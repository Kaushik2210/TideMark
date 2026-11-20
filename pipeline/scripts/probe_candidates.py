"""Print NDCI/FAI distributions for a few lake-months (used to sanity-check thresholds).

    python scripts/probe_candidates.py bellandur:2018-03 ulsoor:2022-01
"""

import json
import sys

import numpy as np
import planetary_computer

from tidemark import candidates, indices, s2
from tidemark.monthly import _load_npz
from tidemark.runner import CACHE, MASKS, load_lakes


def pct(values: np.ndarray, core: np.ndarray) -> list[float] | None:
    if not core.sum():
        return None
    return np.round(np.nanpercentile(values[core], [10, 50, 90]), 3).tolist()


def main() -> None:
    lakes = load_lakes()
    client = s2.open_catalog()
    for spec in sys.argv[1:]:
        lid, month = spec.split(":")
        row = json.loads((CACHE / f"{lid}_{month}.json").read_text(encoding="utf-8"))
        mask, valid, _, crs = _load_npz(MASKS / f"{lid}_{month}.npz")
        item = client.get_collection(s2.COLLECTION).get_item(row["scene_id"])
        item = planetary_computer.sign(item)
        _, _, bounds = s2.lake_masks(lakes[lid][1], crs)
        hrefs = {b: item.assets[b].href for b in candidates.BANDS}
        refl, _, _, _ = s2.read_bands(hrefs, bounds, row["processing_baseline"])
        core = indices.water_core(mask, valid)
        nd = indices.ndci(refl["B05"], refl["B04"])
        fa = indices.fai(refl["B04"], refl["B08"], refl["B11"])
        print(lid, month, row["date"], f"water {mask.sum() / 100:.1f} ha",
              "NDCI p10/50/90", pct(nd, core), "FAI", pct(fa, core))


if __name__ == "__main__":
    main()
