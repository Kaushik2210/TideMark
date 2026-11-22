import { SOURCE_LABEL, type Source } from "@/lib/types";

export const SOURCE_COLOR: Record<Exclude<Source, "none">, string> = {
  optical: "var(--optical)",
  fused: "var(--fused)",
  radar: "var(--radar)",
};

/** SVG path/shape for a source marker, centred on (cx, cy). Shape + colour, never colour alone. */
export function MarkerShape({
  source,
  cx,
  cy,
  r = 4,
  hollow = false,
}: {
  source: Exclude<Source, "none">;
  cx: number;
  cy: number;
  r?: number;
  hollow?: boolean;
}) {
  const color = SOURCE_COLOR[source];
  const common = {
    fill: hollow ? "var(--bg)" : color,
    stroke: color,
    strokeWidth: hollow ? 1.5 : 1,
  };
  if (source === "optical") return <circle cx={cx} cy={cy} r={r} {...common} />;
  if (source === "fused") {
    const d = r * 1.3;
    return <polygon points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`} {...common} />;
  }
  const d = r * 1.25;
  return <polygon points={`${cx},${cy - d} ${cx + d},${cy + d * 0.85} ${cx - d},${cy + d * 0.85}`} {...common} />;
}

export function SourceMark({ source, label = true }: { source: Source; label?: boolean }) {
  if (source === "none") {
    return <span className="text-muted">{label ? SOURCE_LABEL.none : null}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <MarkerShape source={source} cx={7} cy={7.5} r={4.5} />
      </svg>
      {label ? <span>{SOURCE_LABEL[source]}</span> : <span className="sr-only">{SOURCE_LABEL[source]}</span>}
    </span>
  );
}

export function SourceLegend({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${className}`} aria-label="Data source legend">
      {(["optical", "fused", "radar"] as const).map((s) => (
        <li key={s}>
          <SourceMark source={s} />
        </li>
      ))}
    </ul>
  );
}
