# Where the site's images come from

Every image is a crop / resize / re-encode of a real FUTCHY file. Nothing is generated or repainted.
The source files are not stored in this repository.

| Site image(s) | Source |
|---|---|
| `hero-*`, `og-card.jpg`, `world-circles-*`, `world-footvolley-*`, `play-tricks-*` | loading-screen key art final D2 (5120×2880) |
| `world-court-*`, `world-beach-*`, `play-gameplay-*`, `trailer-poster-*` | loading-screen key art final D1 (5120×2880) |
| `logo-*` | the game logo (`GameLogo.png`) |
| `favicon*`, `apple-touch-icon`, `icon-*` | the app icon (1254 px original) |

To regenerate (needs Python 3 + Pillow):
```bash
FUTCHY_KEYART_DIR=/path/to/dir/with/D1_and_D2 \
FUTCHY_LOGO=/path/to/GameLogo.png \
FUTCHY_ICON=/path/to/Futchy_AppIcon_original_1254.png \
npm run images && npm run build
```

## Slots waiting for real screenshots
`Make it yours` and `Compete & climb` show a labelled slot. Drop a real in-game screenshot at
`src/img/slot-customization.webp` / `src/img/slot-progression.webp` (landscape ~16:11, 1600 px wide, no
device frame) and rebuild: the slot is replaced automatically.
