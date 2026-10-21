# futchy.co

Official launch site for **FUTCHY**. Static HTML/CSS/JS, no framework, no runtime dependencies, no analytics, no cookies.
Separate from the Unity game repository.

```
npm run dev      # build + preview at http://localhost:4173 (rebuilds on save)
npm run build    # writes the deployable site to dist/
npm run images   # re-creates src/img from the real source renders (needs python3 + Pillow)
```

## Structure
```
site.config.json     App Store URL, trailer file, contact email, years  ← the only things to edit at launch
build.mjs            templating, hashed css/js, sitemap, robots, manifest, CNAME, CSP meta
src/index.html       home (hero, trailer, world, play your way, final CTA)
src/privacy.html     /privacy        src/support.html  /support        src/404.html
src/partials/        head, header, footer
src/css, src/js      one stylesheet, one ~3 KB script
src/img, src/fonts   optimized AVIF/WebP images, self-hosted Anton (SIL OFL)
tools/               make-images.py, serve.mjs
assets-src/SOURCES.md  where every image came from
```

## Launch switches (`site.config.json`)
* `appStoreUrl`: set the real URL and every "Download on the App Store" button becomes a link. While empty they go nowhere.
* `trailer.src`: path to the trailer, e.g. `/media/futchy-trailer.mp4` (put the file in `src/media/`; it is copied to `dist/media/`). The trailer loads only when the visitor presses play; it never autoplays.
  `trailer.poster` is optional.

## Deploy (GitHub Pages)
Pushing to `main` runs `.github/workflows/pages.yml`, which runs `node build.mjs` and publishes `dist/`.
Settings → Pages → Source must be **GitHub Actions**; the custom domain is `futchy.co` (the build writes `CNAME` and `.nojekyll`).

DNS at the registrar:

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153 |
| CNAME | www | `<github-user>.github.io` |

Clean URLs: GitHub Pages serves `privacy.html` at `/privacy` and `support.html` at `/support`; `404.html` is the custom 404.
GitHub Pages cannot set response headers, so the Content-Security-Policy ships as a `<meta>` tag (see `build.mjs`).

The privacy page (`src/privacy.html`, English + Hebrew) follows the final launch architecture: LevelPlay + Unity Ads only, own consent dialog for every player, no ATT. If the shipped build differs, update sections 3–5 in both languages and `privacyUpdated` / `privacyUpdatedHe` in `site.config.json`.
