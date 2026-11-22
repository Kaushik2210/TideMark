// MapLibre GL 6 locates its worker next to its own module, which no longer exists once a
// bundler has emitted the module into a hashed chunk. Serve the worker from public/ instead
// and point MapLibre at it with setWorkerUrl (see components/LakeMap.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const from = path.join("node_modules", "maplibre-gl", "dist");
const to = path.join("public", "maplibre");
mkdirSync(to, { recursive: true });
// Copied with a .js extension: every static host serves .js as JavaScript, whereas .mjs
// handling varies, and a module worker is rejected when it is served as text/plain.
for (const f of ["maplibre-gl-worker", "maplibre-gl-shared"]) {
  copyFileSync(path.join(from, `${f}.mjs`), path.join(to, `${f}.js`));
}
console.log("copied MapLibre worker files to public/maplibre");
