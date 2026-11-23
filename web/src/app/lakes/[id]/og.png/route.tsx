import { ImageResponse } from "next/og";
import { formatMonth, hasExtent } from "@/lib/data";
import { getHealth, getLakes, getSeries } from "@/lib/server-data";

const size = { width: 1200, height: 630 };
export const dynamic = "force-static";

export function generateStaticParams() {
  return getLakes().map((l) => ({ id: l.id }));
}

/** Link-preview card built at deploy time from the lake's real series (no screenshots, no fabricated numbers). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lake = getLakes().find((l) => l.id === id)!;
  const rows = getSeries(id);
  const health = getHealth(id);
  const latest = [...rows].reverse().find(hasExtent);
  const name = lake.name.replace(" (Halasuru Kere)", "");

  const W = 1080;
  const H = 150;
  const vals = rows.map((r) => (hasExtent(r) ? r.area_ha ?? 0 : null));
  const max = Math.max(...vals.filter((v): v is number => v !== null));
  let d = "";
  let pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    const x = (i / (vals.length - 1)) * W;
    const y = H - 6 - (v / max) * (H - 14);
    d += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b1220", color: "#e6edf7", padding: 60, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#9db0c7" }}>
          <span>TIDEMARK · BENGALURU LAKES FROM SPACE</span>
          <span>{`${lake.first_month.slice(0, 4)}-${lake.last_month.slice(0, 4)}`}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 16 }}>
            <span style={{ fontSize: 110, fontWeight: 700, color: "#38bdf8" }}>{`${latest?.area_ha?.toFixed(1)}`}</span>
            <span style={{ fontSize: 44, color: "#9db0c7", marginLeft: 14 }}>{`ha of open water, ${latest ? formatMonth(latest.month) : ""}`}</span>
          </div>
          <div style={{ fontSize: 28, color: "#9db0c7", marginTop: 6 }}>{`Health index (experimental): ${Math.round(health.score)}, range ${Math.round(health.sensitivity_range[0])}-${Math.round(health.sensitivity_range[1])}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <path d={d} fill="none" stroke="#38bdf8" strokeWidth={3} />
          </svg>
          <div style={{ fontSize: 22, color: "#9db0c7", marginTop: 10 }}>Research estimate from Sentinel-1/2 data, not an official assessment.</div>
        </div>
      </div>
    ),
    size,
  );
}
