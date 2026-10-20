# Where the site's images come from

Every image is a crop / resize / re-encode of a real FUTCHY file. Nothing is generated or repainted.
The source files are not stored in this repository.

| Site image(s) | Source |
|---|---|
| `hero-*`, `og-card.jpg`, all `world-*`, `play-gameplay-*`, `play-tricks-*`, `trailer-poster-*` | the owner-approved loading-screen key art (Railay beach, golden hour; 5120×2880 master, no UI baked in) |
| `logo-*` | the game logo (`GameLogo.png`) |
| `favicon*`, `apple-touch-icon`, `icon-*` | the app icon (1254 px original) |

To regenerate (needs Python 3 + Pillow):
```bash
FUTCHY_KEYART_FILE=/path/to/Futchy_loading_art_MASTER_5120x2880.png \
FUTCHY_LOGO=/path/to/GameLogo.png \
FUTCHY_ICON=/path/to/Futchy_AppIcon_original_1254.png \
npm run images && npm run build
```

## Slots waiting for real screenshots
`Make it yours` and `Compete & climb` show a labelled slot. Drop a real in-game screenshot at
`src/img/slot-customization.webp` / `src/img/slot-progression.webp` (landscape ~16:11, 1600 px wide, no
device frame) and rebuild: the slot is replaced automatically.
