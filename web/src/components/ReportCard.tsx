"use client";

import { useState } from "react";

export interface ReportCardData {
  id: string;
  name: string;
  areaHa: number | null;
  month: string; // already formatted, e.g. "Nov 2026"
  sourceLabel: string;
  score: number;
  range: [number, number];
  lowCoverage: boolean;
}

const W = 1200;
const H = 630;

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = t;
  }
  ctx.fillText(line, x, y);
  return y;
}

/** Draws the shareable card. Fixed dark palette so the PNG looks the same everywhere. */
export function drawReportCard(canvas: HTMLCanvasElement, d: ReportCardData) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#17233a";
  ctx.fillRect(0, 0, W, 8);
  const serif = 'Georgia, "Times New Roman", serif';
  const sans = "system-ui, -apple-system, Segoe UI, sans-serif";

  ctx.fillStyle = "#9db0c7";
  ctx.font = `600 26px ${sans}`;
  ctx.fillText("TIDEMARK · BENGALURU LAKES FROM SPACE", 60, 70);
  ctx.fillStyle = "#e6edf7";
  ctx.font = `700 76px ${serif}`;
  ctx.fillText(d.name, 60, 170);

  ctx.fillStyle = "#9db0c7";
  ctx.font = `400 28px ${sans}`;
  ctx.fillText(`Open water, ${d.month}`, 60, 250);
  ctx.fillStyle = "#38bdf8";
  ctx.font = `700 120px ${sans}`;
  ctx.fillText(d.areaHa == null ? "n/a" : `${d.areaHa.toFixed(1)} ha`, 60, 370);
  ctx.fillStyle = "#9db0c7";
  ctx.font = `400 26px ${sans}`;
  ctx.fillText(`Source: ${d.sourceLabel}`, 60, 415);

  ctx.fillStyle = "#e6edf7";
  ctx.font = `700 120px ${sans}`;
  ctx.fillText(String(d.score), 720, 370);
  ctx.fillStyle = "#9db0c7";
  ctx.font = `400 28px ${sans}`;
  ctx.fillText("Satellite health index (experimental)", 720, 250);
  ctx.font = `400 26px ${sans}`;
  ctx.fillText(`Range ${d.range[0]} to ${d.range[1]} under other weightings${d.lowCoverage ? " · low coverage" : ""}`, 720, 415);

  ctx.fillStyle = "#17233a";
  ctx.fillRect(60, 470, W - 120, 2);
  ctx.fillStyle = "#9db0c7";
  ctx.font = `400 24px ${sans}`;
  wrap(
    ctx,
    "Research estimate from Sentinel-1/2 satellite data, not an official assessment. The index does not measure water quality, toxicity or safety. Method and failures: see the Tidemark methodology page.",
    60, 515, W - 120, 34,
  );
}

export function ReportCard({ data }: { data: ReportCardData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  function download() {
    setBusy(true);
    setError(false);
    try {
      const canvas = document.createElement("canvas");
      drawReportCard(canvas, data);
      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) return setError(true);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tidemark-${data.id}-report-card.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={download} disabled={busy} data-testid="report-card" className="tap rounded-md border border-border bg-surface px-4 text-sm font-medium">
        {busy ? "Preparing…" : "Download report card (PNG)"}
      </button>
      {error ? <span role="alert" className="text-sm text-danger">The card could not be created in this browser.</span> : null}
    </div>
  );
}
