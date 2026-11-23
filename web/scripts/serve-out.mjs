// Tiny static server for the exported site (web/out), used by the Playwright smoke tests.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const port = Number(process.argv[2] || 4321);
// Optional: serve a build made with NEXT_PUBLIC_BASE_PATH by stripping that prefix from requests.
const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".geojson": "application/geo+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".xml": "application/xml", ".csv": "text/csv", ".txt": "text/plain", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (base && (p === base || p.startsWith(`${base}/`))) p = p.slice(base.length) || "/";
    p = normalize(p);
    if (p.includes("..")) throw new Error("bad path");
    let file = join(root, p);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on ${port}`));
