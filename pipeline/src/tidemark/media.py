"""Per-lake images and a time-lapse video, rendered only from pipeline outputs.

    tidemark-media --lakes varthur --out ../docs/media

Everything drawn comes from data/lakes.geojson and the monthly (or, failing that, optical)
extents; nothing is illustrative. Map colour shows which sensor supplied each month.
Requires the optional extra:  pip install -e ".[media]"
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import imageio.v2 as imageio
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402
from matplotlib.path import Path as MPath  # noqa: E402
from shapely.geometry import shape as to_shape  # noqa: E402

from .runner import LAKES, ROOT, load_lakes  # noqa: E402

BG, FG, MUTED = "#0b1220", "#e6edf7", "#8aa0b8"
SOURCE_COLOR = {"optical": "#38bdf8", "fused": "#34d399", "radar": "#fbbf24"}
DEFAULT_OUT = ROOT / "docs" / "media"


def polygon_patch(geom, **kw):
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    verts, codes = [], []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            xy = np.asarray(ring.coords)
            verts.extend(xy)
            codes.extend([MPath.MOVETO] + [MPath.LINETO] * (len(xy) - 2) + [MPath.CLOSEPOLY])
    return PathPatch(MPath(verts, codes), **kw)


def _read_geom(path: Path):
    if not path.exists():
        return None
    return to_shape(json.loads(path.read_text(encoding="utf-8"))["geometry"])


def load_months(lake_id: str) -> pd.DataFrame:
    """Rows: month, source, area, unc, geom (shapely or None). Monthly data if present."""
    monthly = ROOT / "data" / "monthly" / f"{lake_id}.parquet"
    rows = []
    if monthly.exists():
        df = pd.read_parquet(monthly)
        for r in df.itertuples():
            f = ROOT / "data" / "monthly" / lake_id / f"{r.month}.geojson"
            geom = _read_geom(f)
            has = r.source in SOURCE_COLOR
            rows.append((r.month, r.source if has else "none",
                         r.water_area_ha if has else np.nan,
                         r.water_area_unc_ha if has else np.nan, geom))
    else:
        df = pd.read_parquet(ROOT / "data" / "timeseries" / f"{lake_id}.parquet")
        for r in df.itertuples():
            ok = r.status == "ok"
            f = ROOT / "data" / "extents" / lake_id / f"{getattr(r, 'date', '')}.geojson"
            geom = _read_geom(f) if ok else None
            rows.append((r.month, "optical" if ok else "none",
                         r.water_area_ha if ok else np.nan,
                         r.water_area_unc_ha if ok else np.nan, geom))
    out = pd.DataFrame(rows, columns=["month", "source", "area", "unc", "geom"])
    return out.sort_values("month").reset_index(drop=True)


def pick_before_after(df: pd.DataFrame) -> tuple[int, int]:
    """Indices of the months with the largest and smallest water area (data-driven)."""
    have = df[df["area"].notna() & df["geom"].notna()]
    return int(have["area"].idxmax()), int(have["area"].idxmin())


def draw_map(ax, outline, row, bounds, title=None):
    ax.set_facecolor(BG)
    ax.add_patch(polygon_patch(outline, fill=False, ec=MUTED, lw=1.0, ls="--"))
    if row is not None and row.geom is not None:
        ax.add_patch(polygon_patch(row.geom, fc=SOURCE_COLOR[row.source], ec="none", alpha=0.9))
    x0, y0, x1, y1 = bounds
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect(1 / math.cos(math.radians((y0 + y1) / 2)))
    ax.axis("off")
    if title:
        ax.set_title(title, color=FG, fontsize=11, loc="left")


def label(row) -> str:
    if row.source == "none" or not np.isfinite(row.area):
        return f"{row.month}   no usable scene"
    return f"{row.month}   {row.area:.0f} ± {row.unc:.0f} ha   ({row.source})"


def draw_trend(ax, df, mapped_ha, cursor=None):
    ax.set_facecolor(BG)
    for s, c in SOURCE_COLOR.items():
        d = df[df.source == s]
        ax.scatter(pd.to_datetime(d.month), d.area, s=14, color=c, label=s, zorder=3)
    ax.axhline(mapped_ha, color=MUTED, ls="--", lw=1)
    ax.text(pd.to_datetime(df.month.iloc[0]), mapped_ha, " mapped outline (OSM)", color=MUTED,
            fontsize=8, va="bottom")
    if cursor is not None:
        ax.axvline(pd.to_datetime(cursor), color=FG, lw=1)
    ax.set_ylim(0, max(mapped_ha, np.nanmax(df.area)) * 1.08)
    ax.set_ylabel("water area (ha)", color=MUTED)
    ax.tick_params(colors=MUTED)
    for sp in ax.spines.values():
        sp.set_color("#243247")
    ax.legend(frameon=False, labelcolor=FG, fontsize=8, loc="upper right", ncol=3)


FOOTER = "Tidemark. Research, not an official assessment. Unvalidated satellite estimate."


def make_for_lake(lake_id: str, out: Path) -> dict:
    props, outline = load_lakes()[lake_id]
    df = load_months(lake_id)
    d = out / lake_id
    d.mkdir(parents=True, exist_ok=True)
    minx, miny, maxx, maxy = outline.buffer(0.0015).bounds
    bounds = (minx, miny, maxx, maxy)

    # before/after image: largest vs smallest observed water area
    hi, lo = pick_before_after(df)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.6), facecolor=BG)
    for ax, i in zip(axes, (hi, lo), strict=True):
        draw_map(ax, outline, df.iloc[i], bounds, label(df.iloc[i]))
    fig.text(0.01, 0.01, f"{props['name']}. Largest vs smallest observed water area. {FOOTER}",
             color=MUTED, fontsize=7)
    fig.savefig(d / "before_after.png", dpi=110, facecolor=BG)
    plt.close(fig)

    # trend chart
    fig, ax = plt.subplots(figsize=(11, 3.8), facecolor=BG)
    draw_trend(ax, df, props["area_ha"])
    ax.set_title(f"{props['name']}: monthly water area by sensor", color=FG, loc="left")
    fig.text(0.01, 0.01, FOOTER, color=MUTED, fontsize=7)
    fig.savefig(d / "trend.png", dpi=110, facecolor=BG)
    plt.close(fig)

    # time-lapse video: map + trend with moving cursor
    frames = []
    for i in range(len(df)):
        fig = plt.figure(figsize=(12.8, 7.2), dpi=100, facecolor=BG)
        gs = fig.add_gridspec(1, 2, width_ratios=[1, 1.25], wspace=0.08)
        draw_map(fig.add_subplot(gs[0]), outline, df.iloc[i], bounds, props["name"])
        ax2 = fig.add_subplot(gs[1])
        draw_trend(ax2, df, props["area_ha"], cursor=df.month.iloc[i])
        fig.text(0.04, 0.9, label(df.iloc[i]), color=FG, fontsize=15, weight="bold")
        fig.text(0.04, 0.03, FOOTER, color=MUTED, fontsize=9)
        fig.canvas.draw()
        frames.append(np.asarray(fig.canvas.buffer_rgba())[..., :3].copy())
        plt.close(fig)
    imageio.mimsave(d / "timelapse.mp4", frames, fps=6, codec="libx264", quality=7,
                    macro_block_size=1)
    return {"lake": lake_id, "months": len(df), "before_after": [df.month[hi], df.month[lo]]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-media")
    ap.add_argument("--lakes", nargs="+", default=None)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args(argv)
    assert LAKES.exists()
    for lid in args.lakes or list(load_lakes()):
        print(make_for_lake(lid, args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
