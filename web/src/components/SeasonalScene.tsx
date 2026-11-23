"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fmtHa, formatMonth, hasExtent } from "@/lib/data";
import { MOTION_OK, registerGsap } from "@/lib/motion";
import type { Row } from "@/lib/types";

type ViewName = "angle" | "front" | "top";

const VIEWS: Record<ViewName, [number, number, number]> = {
  angle: [9.2, 9.6, 16.2],
  front: [0, 4.6, 19.5],
  top: [0.001, 23, 0.001],
};
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MAX_BAR = 4.2;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface Api {
  view: (v: ViewName) => void;
  select: (i: number | null) => void;
}

/**
 * A "seasonal landscape": one bar per month, laid out by calendar month (left to right, Jan-Dec)
 * and year (back to front, oldest to newest), height = open-water area. The monsoon cycle and the
 * decline across years show up as ridges and slopes. Heights are scaled to this lake's own maximum.
 */
export default function SeasonalScene({ rows, name }: { rows: Row[]; name: string }) {
  const uid = useId();
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<ViewName>("angle");

  const firstYear = Number(rows[0].month.slice(0, 4));
  const maxArea = Math.max(...rows.filter(hasExtent).map((r) => r.area_ha ?? 0));
  const selRow = sel === null ? null : rows[sel];

  useEffect(() => {
    let disposed = false;
    let cleanup: () => void = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = host.current;
      if (disposed || !el) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        setStatus("unsupported");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.display = "block";

      const gsap = registerGsap();
      const nYears = Number(rows[rows.length - 1].month.slice(0, 4)) - firstYear + 1;
      const colors = {
        optical: new THREE.Color(cssVar("--optical", "#38bdf8")),
        fused: new THREE.Color(cssVar("--fused", "#34d399")),
        radar: new THREE.Color(cssVar("--radar", "#fbbf24")),
        none: new THREE.Color(cssVar("--border", "#2a3a52")),
        floor: new THREE.Color(cssVar("--surface-2", "#17233a")),
        line: new THREE.Color(cssVar("--muted", "#9db0c7")),
        fg: new THREE.Color(cssVar("--fg", "#e6edf7")),
      };

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-6, 12, 9);
      scene.add(sun);

      // Floor
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(14, nYears + 2),
        new THREE.MeshBasicMaterial({ color: colors.floor, transparent: true, opacity: 0.55 }),
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      // Bars: one instance per month.
      const geo = new THREE.BoxGeometry(0.78, 1, 0.78);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
      const mesh = new THREE.InstancedMesh(geo, mat, rows.length);
      const targets = rows.map((r) => (hasExtent(r) && maxArea > 0 ? Math.max(0.05, ((r.area_ha ?? 0) / maxArea) * MAX_BAR) : 0.03));
      const cell = rows.map((r) => {
        const y = Number(r.month.slice(0, 4)) - firstYear;
        const m = Number(r.month.slice(5, 7)) - 1;
        return { x: m - 5.5, z: y - (nYears - 1) / 2, y, m };
      });
      rows.forEach((r, i) => mesh.setColorAt(i, r.source === "none" ? colors.none : colors[r.source]));
      scene.add(mesh);

      const dummy = new THREE.Object3D();
      const progress = { p: 0 };
      let dirty = true;
      const layout = () => {
        rows.forEach((_, i) => {
          const delay = (i / rows.length) * 0.55;
          const local = Math.min(1, Math.max(0, (progress.p - delay) / 0.45));
          const eased = 1 - (1 - local) * (1 - local);
          dummy.position.set(cell[i].x, 0, cell[i].z);
          dummy.scale.set(1, Math.max(0.001, targets[i] * eased), 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        dirty = true;
      };
      layout();

      // Axis labels as sprites (month letters along the front edge, years down the left edge).
      const sprites: InstanceType<typeof THREE.Sprite>[] = [];
      const label = (text: string, x: number, z: number) => {
        const c = document.createElement("canvas");
        c.width = 128;
        c.height = 64;
        const g = c.getContext("2d")!;
        g.fillStyle = `#${colors.line.getHexString()}`;
        g.font = "600 34px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, 64, 32);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
        s.scale.set(1.3, 0.65, 1);
        s.position.set(x, 0.04, z);
        scene.add(s);
        sprites.push(s);
      };
      MONTH_LETTERS.forEach((L, m) => label(L, m - 5.5, (nYears - 1) / 2 + 1));
      for (let y = 0; y < nYears; y += nYears > 6 ? 2 : 1) label(String(firstYear + y), -7.9, y - (nYears - 1) / 2);

      // Selection outline.
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 1, 0.98).translate(0, 0.5, 0)),
        new THREE.LineBasicMaterial({ color: colors.fg }),
      );
      outline.visible = false;
      scene.add(outline);
      const place = (i: number | null) => {
        if (i === null) {
          outline.visible = false;
        } else {
          outline.visible = true;
          outline.position.set(cell[i].x, 0, cell[i].z);
          outline.scale.set(1, Math.max(0.05, targets[i]), 1);
        }
        dirty = true;
      };

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 10;
      controls.maxDistance = 40;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.target.set(0, 1.4, 0);
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
      // Let a one-finger vertical swipe scroll the page instead of being captured by the canvas.
      renderer.domElement.style.touchAction = "pan-y";

      const start = VIEWS.angle;
      camera.position.set(...start);
      controls.update();

      // Hover / tap picking.
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const onMove = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(mesh)[0];
        if (hit && hit.instanceId !== undefined) {
          place(hit.instanceId);
          setSel(hit.instanceId);
        }
      };
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerdown", onMove);

      const size = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / Math.max(1, h);
        camera.fov = w < 520 ? 52 : 38; // wider lens on narrow screens so the whole field fits
        camera.updateProjectionMatrix();
        dirty = true;
      };
      const ro = new ResizeObserver(size);
      ro.observe(el);
      size();

      // Render only when something changed, and only while on screen.
      let raf = 0;
      let visible = true;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const moved = controls.update();
        if (dirty || moved) {
          renderer.render(scene, camera);
          dirty = false;
        }
      };
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        cancelAnimationFrame(raf);
        if (visible) tick();
      });
      io.observe(el);
      tick();

      // Entrance: bars grow and the camera sweeps in. With reduced motion the final state is immediate.
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        progress.p = 0;
        layout();
        camera.position.set(start[0] + 5, start[1] + 3, start[2] + 2);
        gsap.to(progress, { p: 1, duration: 1.8, ease: "power2.out", onUpdate: layout });
        gsap.to(camera.position, { x: start[0], y: start[1], z: start[2], duration: 2, ease: "power3.out", onUpdate: () => { controls.update(); dirty = true; } });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        progress.p = 1;
        layout();
      });

      api.current = {
        select: (i) => {
          place(i);
          setSel(i);
        },
        view: (v) => {
          const to = VIEWS[v];
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          gsap.to(camera.position, {
            x: to[0], y: to[1], z: to[2],
            duration: reduce ? 0 : 0.9,
            ease: "power3.inOut",
            onUpdate: () => { controls.update(); dirty = true; },
          });
        },
      };

      el.setAttribute("data-ready", "true");
      setStatus("ready");

      cleanup = () => {
        api.current = null;
        mm.revert();
        gsap.killTweensOf([progress, camera.position]);
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerdown", onMove);
        controls.dispose();
        geo.dispose();
        mat.dispose();
        mesh.dispose();
        floor.geometry.dispose();
        (floor.material as InstanceType<typeof THREE.Material>).dispose();
        outline.geometry.dispose();
        (outline.material as InstanceType<typeof THREE.Material>).dispose();
        sprites.forEach((s) => {
          s.material.map?.dispose();
          s.material.dispose();
        });
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        el.removeAttribute("data-ready");
      };
      if (disposed) cleanup();
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // rows, firstYear, maxArea are stable for a given lake page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: arrows move through months (left/right) and years (up/down).
  function onKeyDown(e: React.KeyboardEvent) {
    if (!api.current) return;
    const idx = (y: number, m: number) => rows.findIndex((r) => r.month === `${firstYear + y}-${String(m + 1).padStart(2, "0")}`);
    const cur = sel ?? rows.length - 1;
    const y = Number(rows[cur].month.slice(0, 4)) - firstYear;
    const m = Number(rows[cur].month.slice(5, 7)) - 1;
    let next = -1;
    if (e.key === "ArrowLeft") next = idx(y, Math.max(0, m - 1));
    else if (e.key === "ArrowRight") next = idx(y, Math.min(11, m + 1));
    else if (e.key === "ArrowUp") next = idx(y - 1, m);
    else if (e.key === "ArrowDown") next = idx(y + 1, m);
    else if (e.key === "Escape") {
      api.current.select(null);
      return;
    } else return;
    e.preventDefault();
    if (next >= 0) api.current.select(next);
  }

  const readout = selRow
    ? hasExtent(selRow)
      ? `${formatMonth(selRow.month)}: ${fmtHa(selRow.area_ha)} (±${fmtHa(selRow.unc_ha)}), ${selRow.source}`
      : `${formatMonth(selRow.month)}: no usable optical or radar scene`
    : "Hover, tap, or focus the scene and use the arrow keys to read a month.";

  return (
    <figure className="space-y-3" data-testid="landscape">
      <figcaption id={`${uid}-t`} className="max-w-3xl text-sm text-muted">
        Each bar is one month of {name}: left to right is January to December, back to front is {firstYear} to the
        latest year, and height is open-water area. The monsoon cycle shows as ridges and the slow decline as a
        slope. Heights are scaled to this lake&apos;s own maximum ({fmtHa(maxArea)}), so lakes cannot be compared by
        eye here. The same numbers are in the table above.
      </figcaption>

      <div
        tabIndex={0}
        role="group"
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-r`}
        onKeyDown={onKeyDown}
        className="relative overflow-hidden rounded-xl border border-border bg-surface"
      >
        <div ref={host} className="h-[340px] w-full sm:h-[460px]" />
        {status !== "ready" ? (
          <p role="status" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
            {status === "loading" ? "Loading the 3D view…" : "The 3D view is not available on this device (WebGL is off). The chart and table above show the same data."}
          </p>
        ) : null}
      </div>

      <p id={`${uid}-r`} aria-live="polite" className="num min-h-6 text-sm">{readout}</p>

      {status === "ready" ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Camera view">
          {([["angle", "Angled"], ["front", "Front (seasons)"], ["top", "Top (years)"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => { setView(v); api.current?.view(v); }}
              className={`tap rounded-full border px-4 text-sm ${view === v ? "border-accent bg-surface-2" : "border-border text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
          <span className="text-sm text-muted">Drag sideways to rotate, pinch or scroll to zoom.</span>
        </div>
      ) : null}
    </figure>
  );
}
