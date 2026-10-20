// Local preview server: builds, serves dist/ with clean URLs (/privacy -> privacy.html),
// and rebuilds when anything in src/ changes.   node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, watch } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = Number(process.argv[2] || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".xml": "application/xml",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4",
};

build();
let timer;
watch(join(root, "src"), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 150);
});

createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/") && p !== "/") p = p.slice(0, -1);
  const tries = p === "/" ? ["index.html"] : [p, p + ".html", p + "/index.html"];
  const hit = tries.map((t) => join(dist, t)).find((f) => f.startsWith(dist) && existsSync(f) && statSync(f).isFile());
  const file = hit || join(dist, "404.html");
  res.writeHead(hit ? 200 : 404, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`futchy.co preview → http://localhost:${port}`));
