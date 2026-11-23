"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatMonth } from "@/lib/data";
import { registerGsap } from "@/lib/motion";
import { notePlan } from "@/lib/sonify";
import type { Row } from "@/lib/types";

const STEP = 0.11; // seconds per month: about 14 seconds for the whole record

/** Plays a lake's record as music. Sound only ever starts when the button is pressed. */
export function ListenLake({ rows, name }: { rows: Row[]; name: string }) {
  const uid = useId();
  const plan = useMemo(() => notePlan(rows), [rows]);
  const [state, setState] = useState<"idle" | "playing" | "unsupported">("idle");
  const [vol, setVol] = useState(0.5);
  const [shown, setShown] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  const stop = () => {
    tween.current?.kill();
    tween.current = null;
    const c = ctx.current;
    ctx.current = null;
    master.current = null;
    if (c) c.close().catch(() => {});
    setState("idle");
  };

  useEffect(() => {
    const onHide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      tween.current?.kill();
      ctx.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (master.current) master.current.gain.value = 0.22 * vol;
  }, [vol]);

  function play() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      setState("unsupported");
      return;
    }
    const c = new AC();
    ctx.current = c;
    const out = c.createGain();
    out.gain.value = 0.22 * vol;
    out.connect(c.destination);
    master.current = out;

    const t0 = c.currentTime + 0.12;
    plan.forEach((n, i) => {
      const t = t0 + i * STEP;
      if (n.newYear) {
        const tick = c.createOscillator();
        const g = c.createGain();
        tick.frequency.value = 98;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        tick.connect(g).connect(out);
        tick.start(t);
        tick.stop(t + 0.1);
      }
      if (n.freq === null) return; // a rest: no usable scene, nothing is made up
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = n.wave;
      o.frequency.value = n.freq;
      const peak = n.wave === "square" ? 0.28 : n.wave === "triangle" ? 0.6 : 0.9; // keep the buzzy timbre quiet
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.6);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + STEP * 1.7);
    });

    // The on-screen position follows the same clock the audio uses.
    const gsap = registerGsap();
    const state2 = { i: 0 };
    tween.current = gsap.to(state2, {
      i: plan.length - 1,
      duration: plan.length * STEP,
      delay: 0.12,
      ease: "none",
      onUpdate: () => {
        const i = Math.round(state2.i);
        setShown(i);
        if (bar.current) bar.current.style.transform = `scaleX(${i / (plan.length - 1)})`;
      },
      onComplete: stop,
    });
    setState("playing");
  }

  const cur = plan[shown];
  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-3 rounded-xl border border-border bg-surface p-5" data-testid="listen">
      <h3 id={`${uid}-h`} className="font-serif text-xl font-semibold">Listen to {name}</h3>
      <p className="max-w-3xl text-sm text-muted">
        The same record as sound, about 14 seconds long. Higher pitch means more open water (scaled to this lake&apos;s own
        range). A soft sine tone is an optical month, a triangle is optical plus radar, a buzzier tone is radar only, a
        quiet tick marks each January, and silence means no usable scene. Nothing plays until you press the button.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={state === "playing" ? stop : play}
          aria-pressed={state === "playing"}
          className="tap inline-flex items-center gap-2 rounded-md bg-accent px-5 font-medium text-bg"
        >
          {state === "playing" ? "Stop" : "Play the record"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          Volume
          <input type="range" min="0.1" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} className="tap w-32" />
        </label>
      </div>
      <p role="status" className="sr-only">{state === "playing" ? "Playing" : state === "unsupported" ? "Audio is not available in this browser." : ""}</p>
      {state === "unsupported" ? <p className="text-sm text-muted">Audio is not available in this browser. The chart and table above show the same record.</p> : null}
      {state === "playing" ? (
        <div aria-hidden="true" className="space-y-2">
          <div className="h-1.5 overflow-hidden rounded bg-surface-2"><div ref={bar} className="h-full origin-left bg-accent" style={{ transform: "scaleX(0)" }} /></div>
          <p className="num text-sm">{formatMonth(cur.month)}: {cur.areaHa === null ? "no usable scene (silence)" : `${cur.areaHa.toFixed(1)} ha`}</p>
        </div>
      ) : null}
    </section>
  );
}
