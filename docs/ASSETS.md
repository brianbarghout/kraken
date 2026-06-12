# KRAKEN — Asset Register

## Current state (Phase 1)

**All unit and terrain visuals are programmatic low-poly primitives** built
in `app/src/three/scene.ts` (boxes/cylinders/cones, Lambert materials).
The Phase 1 brief allows placeholders wherever a Kenney model doesn't fit
("do not block on art") — and at the current camera distance the
primitives read more clearly than imported models would, with zero asset
pipeline. Swapping in real models later means touching only
`buildKraken` / `buildDefender` / `buildTerrain`; nothing else knows
about geometry.

## Kenney.nl upgrade path (CC0, no attribution required)

Per GDD §16.2, intended packs when we move past primitives:

| Pack | URL | For |
|---|---|---|
| Hexagon Kit | https://kenney.nl/assets/hexagon-kit | terrain tiles (hex-native) |
| Tanks | https://kenney.nl/assets/tanks | heavy/light tank bodies |
| 3D Road Tiles | https://kenney.nl/assets/3d-road-tiles | road hexes |
| Nature Kit | https://kenney.nl/assets/nature-kit | trees, rocks |
| Particle Pack | https://kenney.nl/assets/particle-pack | explosion/smoke sprites |

Download into `app/public/assets/<pack-name>/` and record the exact pack
version here when added. License: CC0 1.0 Universal (all Kenney packs).

The Kraken itself stays custom (GDD §16.2: "it deserves a custom model") —
Meshy.ai generation is a Phase 4 item.

## Fonts (self-hosted, GDD §16.5)

| Font | Weights | File | Source | License |
|---|---|---|---|---|
| Rajdhani | 500, 700 | `app/public/fonts/rajdhani-*.woff2` | Google Fonts (latin subset) | OFL 1.1 |
| Inter | variable 100–900 | `app/public/fonts/inter-var.woff2` | Google Fonts (latin subset) | OFL 1.1 |

Downloaded 2026-06-12 from fonts.gstatic.com via the css2 API; served
from `/fonts/`, declared in `app/src/styles.css`. No runtime Google
requests — the build is fully self-contained.

## Other

- `app/public/favicon.svg` — original, drawn in-line (hex + blip motif).
