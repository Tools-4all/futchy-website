// Zero-dependency static site builder for futchy.co.
//   node build.mjs   ->  dist/   (deploy the dist folder as-is)
import {
  readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");

const PAGES = [
  {
    file: "index.html", out: "index.html", path: "/", index: true, lastmod: "2026-10-21",
    title: "FUTCHY — Own the beach. Beach footvolley for iPhone",
    description: "FUTCHY is a mobile beach footvolley game for iPhone: circles, footvolley and competition on the sand.",
  },
  {
    file: "privacy.html", out: "privacy.html", path: "/privacy", index: true, lastmod: "2026-10-21",
    title: "Privacy Policy — FUTCHY",
    description: "How the FUTCHY iOS game and futchy.co handle data: local progress, rewarded ads, consent and your choices.",
  },
  {
    file: "support.html", out: "support.html", path: "/support", index: true, lastmod: "2026-10-21",
    title: "Support — FUTCHY",
    description: "Contact FUTCHY support: gameplay questions, privacy questions and reporting an inappropriate advertisement.",
  },
  {
    file: "404.html", out: "404.html", path: "/404", index: false,
    title: "Page not found — FUTCHY",
    description: "This page does not exist.",
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const hash = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 8);

export function build() {
  const cfg = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(src, "img/manifest.json"), "utf8"));

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "assets"), { recursive: true });

  // static assets (the manifest is build input only)
  cpSync(join(src, "img"), join(dist, "img"), {
    recursive: true,
    filter: (p) => !p.endsWith("manifest.json"),
  });
  cpSync(join(src, "fonts"), join(dist, "fonts"), { recursive: true });
  if (existsSync(join(src, "media"))) cpSync(join(src, "media"), join(dist, "media"), { recursive: true });

  // hashed css / js so returning visitors never get stale code
  const assets = {};
  for (const [key, from, ext] of [["css", "css/main.css", "css"], ["js", "js/main.js", "js"]]) {
    const buf = readFileSync(join(src, from));
    const name = `assets/main.${hash(buf)}.${ext}`;
    writeFileSync(join(dist, name), buf);
    assets[key] = "/" + name;
  }

  const partial = (name) => readFileSync(join(src, "partials", name + ".html"), "utf8");
  const hasFile = (rel) => existsSync(join(src, rel));

  // --- helpers -------------------------------------------------------------
  function picture(attrs) {
    const a = Object.fromEntries([...attrs.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const flags = new Set(attrs.replace(/\w+="[^"]*"/g, "").trim().split(/\s+/).filter(Boolean));
    const info = manifest[a.name];
    if (!info) throw new Error(`picture: unknown image "${a.name}"`);
    const srcset = (name, ext) => manifest[name].widths.map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(", ");
    const sizes = a.sizes || "100vw";
    let sources = "";
    if (a.mobile) {
      const m = a.mobile;
      sources += `<source media="(max-width: 720px)" type="image/avif" srcset="${srcset(m, "avif")}" sizes="100vw">`;
      sources += `<source media="(max-width: 720px)" type="image/webp" srcset="${srcset(m, "webp")}" sizes="100vw">`;
    }
    sources += `<source type="image/avif" srcset="${srcset(a.name, "avif")}" sizes="${sizes}">`;
    sources += `<source type="image/webp" srcset="${srcset(a.name, "webp")}" sizes="${sizes}">`;
    const widths = info.widths;
    const fallbackW = widths[Math.floor(widths.length / 2)] ?? widths[0];
    const [rw, rh] = info.ratio;
    const eager = flags.has("eager");
    return `<picture>${sources}<img src="/img/${a.name}-${fallbackW}.webp" width="${rw}" height="${rh}" alt="${esc(a.alt || "")}"${a.class ? ` class="${a.class}"` : ""} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${a.alt ? "" : ' role="presentation"'}></picture>`;
  }

  // A real screenshot dropped into src/img as slot-<name>.webp replaces the slot.
  function slot(name) {
    const file = `img/slot-${name}.webp`;
    if (hasFile(file)) {
      return `<img src="/${file}" alt="" loading="lazy" decoding="async">`;
    }
    return `<div class="slot" data-slot="${name}"><span class="slot__badge">Asset slot · ${name} screenshot needed</span></div>`;
  }

  function cta(variant) {
    const inner = '<span class="cta__small">Download on the</span><span class="cta__big">App Store</span>';
    if (cfg.appStoreUrl) {
      return `<a class="cta cta--${variant}" href="${esc(cfg.appStoreUrl)}" rel="noopener">${inner}</a>`;
    }
    return `<button type="button" class="cta cta--${variant}" data-cta-pending aria-disabled="true" aria-describedby="cta-note">${inner}</button>`;
  }

  function trailer() {
    const poster = picture('name="trailer-poster" sizes="(min-width: 1100px) 1100px, 100vw" alt=""');
    if (cfg.trailer && cfg.trailer.src) {
      return `<div class="trailer__frame" data-trailer data-video="${esc(cfg.trailer.src)}" data-poster="${esc(cfg.trailer.poster || "")}">${poster}<button type="button" class="trailer__play" data-trailer-play aria-label="Play the FUTCHY launch trailer"><span class="trailer__ring" aria-hidden="true"></span><span class="trailer__label">Play trailer</span></button></div>`;
    }
    return `<div class="trailer__frame is-soon">${poster}<div class="trailer__play" role="group" aria-label="Launch trailer coming soon"><span class="trailer__ring" aria-hidden="true"></span><span class="trailer__label">Launch trailer — coming soon</span></div></div>`;
  }

  // GitHub Pages cannot send headers, so the policy ships as a <meta>. The only inline
  // script (the "js" flag in head.html) is allowed by hash.
  const inlineFlag = 'document.documentElement.classList.add("js")';
  const flagHash = createHash("sha256").update(inlineFlag).digest("base64");
  const csp = `default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self' 'sha256-${flagHash}'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'`;

  function render(html, page) {
    for (let i = 0; i < 4; i++) html = html.replace(/\{\{> (\w+)\}\}/g, (_, n) => partial(n));
    html = html
      .replace(/\{\{picture ([^}]*)\}\}/g, (_, a) => picture(a))
      .replace(/\{\{slot:(\w+)\}\}/g, (_, n) => slot(n))
      .replace(/\{\{cta:(\w+)\}\}/g, (_, v) => cta(v))
      .replace(/\{\{trailer\}\}/g, () => trailer())
      .replace(/\{\{cta_note\}\}/g, () => cfg.appStoreUrl ? "" : '<p id="cta-note" class="sr-only">The App Store link will be available at launch.</p>');
    const vars = {
      title: esc(page.title),
      description: esc(page.description),
      canonical: cfg.siteUrl + (page.path === "/" ? "/" : page.path),
      robots: page.index ? "index, follow" : "noindex, follow",
      csp: csp,
      css: assets.css,
      js: assets.js,
      email: cfg.email,
      siteUrl: cfg.siteUrl,
      year: cfg.year,
      updated: cfg.privacyUpdated,
    };
    return html.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (!(k in vars)) throw new Error(`unknown placeholder ${m} in ${page.file}`);
      return vars[k];
    });
  }

  for (const page of PAGES) {
    const html = render(readFileSync(join(src, page.file), "utf8"), page);
    writeFileSync(join(dist, page.out), html);
  }

  // site files
  const urls = PAGES.filter((p) => p.index)
    .map((p) => `  <url>\n    <loc>${cfg.siteUrl}${p.path === "/" ? "/" : p.path}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  writeFileSync(join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
  writeFileSync(join(dist, "site.webmanifest"), JSON.stringify({
    name: "FUTCHY", short_name: "FUTCHY", start_url: "/", display: "browser",
    background_color: "#06141d", theme_color: "#06141d",
    icons: [
      { src: "/img/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/img/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }, null, 2));
  // GitHub Pages: custom domain + no Jekyll processing
  writeFileSync(join(dist, "CNAME"), new URL(cfg.siteUrl).hostname + "\n");
  writeFileSync(join(dist, ".nojekyll"), "");
  // favicon.ico at the site root (some crawlers ask for it there)
  cpSync(join(src, "img/favicon.ico"), join(dist, "favicon.ico"));

  console.log(`built ${PAGES.length} pages, css ${assets.css}, js ${assets.js} -> dist/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
