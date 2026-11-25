import { formatMonth, withBase } from "@/lib/data";
import type { SceneArchive } from "@/lib/types";

export function SceneStrip({ archive, months, index, select }: {
  archive: SceneArchive; months: string[]; index: number; select: (i: number) => void;
}) {
  const start = Math.max(0, Math.min(index - 2, months.length - 5));
  return (
    <div className="scene-strip" role="group" aria-label="Nearby satellite acquisitions">
      {months.slice(start, start + 5).map((m, i) => {
        const scene = archive.months[m];
        return <button type="button" key={m} aria-pressed={m === months[index]}
          aria-label={scene ? `${formatMonth(m)}, acquired ${scene.date}` : `Show ${formatMonth(m)} (no image)`}
          onClick={() => select(start + i)}>
          {scene && <span aria-hidden="true" style={{ backgroundImage: `url("${withBase("/data/scenes/thumbs/" + scene.file)}")` }} />}
          <strong>{formatMonth(m)}</strong>
        </button>;
      })}
    </div>
  );
}
