import { ImageResponse } from "next/og";
import { formatMonth, hasExtent } from "@/lib/data";
import { getLakes, getSeries } from "@/lib/server-data";

const size = { width: 1200, height: 630 };
export const dynamic = "force-static";

export function GET() {
  const lakes = getLakes();
  const rows = lakes.map((l) => ({ name: l.name.replace(" (Halasuru Kere)", ""), latest: [...getSeries(l.id)].reverse().find(hasExtent) }));
  const month = rows[0].latest ? formatMonth(rows[0].latest.month) : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b1220", color: "#e6edf7", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 30, color: "#7dd3fc", fontWeight: 700 }}>TIDEMARK</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>Bengaluru&apos;s lakes, seen from space</div>
          <div style={{ fontSize: 34, color: "#9db0c7", marginTop: 18 }}>Open water every month since 2016, from free Sentinel satellite data</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 }}>
          {rows.map((r) => (
            <div key={r.name} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#9db0c7", fontSize: 26 }}>{r.name}</span>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>{`${r.latest?.area_ha?.toFixed(1)} ha`}</span>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color: "#9db0c7", fontSize: 24 }}>
            <span>{month}</span>
            <span>Research estimate, not official</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
