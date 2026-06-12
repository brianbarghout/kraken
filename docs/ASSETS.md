# KRAKEN — Asset Register

## Current state (Phase 1.1)

**Defender units and the Command Post use Kenney CC0 GLB models**
(downloaded 2026-06-12 into `app/public/assets/kenney/<pack>/`), tinted
toward faction colours and composed in `app/src/three/scene.ts`. Kenney
has no 3D military pack, so silhouettes are built from civilian/TD kits —
distinct shapes matter more than literal tanks (Phase 1.1 P3):

| Unit | Model(s) | Pack |
|---|---|---|
| Heavy Tank | `tractor-shovel` + `weapon-turret` | Car Kit + Tower Defense Kit |
| Light Tank | `suv` + `weapon-turret` (small) | Car Kit + Tower Defense Kit |
| GEV | `race-future` (hover offset) | Car Kit |
| Artillery SPG | `truck-flat` + `weapon-cannon` | Car Kit + Tower Defense Kit |
| Scout Bike | `kart-oobi` | Car Kit |
| Command Post | `tower-square-bottom-a` + `tower-square-top-a` | Tower Defense Kit |

**Packs used** (License: CC0 1.0 Universal, no attribution required):

| Pack | URL | Version (zip hash) |
|---|---|---|
| Car Kit | https://kenney.nl/assets/car-kit | 1a312ec241-1775131960 |
| Tower Defense Kit | https://kenney.nl/assets/tower-defense-kit | a402493eaa-1726471567 |

Each pack folder carries its own `Textures/colormap.png` (the GLBs
reference it relatively — do not flatten the folders).

**The Kraken remains a custom primitive assembly** — per GDD §16.2 it
deserves a custom model, and its per-system damage materials need named
submeshes. Meshy.ai generation is a Phase 4 item. Terrain is programmatic
instanced hex prisms (fog dimming needs per-instance colours).

Primitive fallbacks remain in code for all units if model loading fails.

## Fonts (self-hosted, GDD §16.5)

| Font | Weights | File | Source | License |
|---|---|---|---|---|
| Rajdhani | 500, 700 | `app/public/fonts/rajdhani-*.woff2` | Google Fonts (latin subset) | OFL 1.1 |
| Inter | variable 100–900 | `app/public/fonts/inter-var.woff2` | Google Fonts (latin subset) | OFL 1.1 |

Downloaded 2026-06-12 from fonts.gstatic.com via the css2 API; served
from `/fonts/`, declared in `app/src/styles.css`. No runtime Google
requests — the build is fully self-contained.

## Audio (Phase 1.2, CC0)

Samples in `app/public/assets/audio/` (~475 KB total, mono-friendly):

| Pack | URL | Version (zip hash) | Files used |
|---|---|---|---|
| Sci-Fi Sounds | https://kenney.nl/assets/sci-fi-sounds | 6b296f9ecf-1677589334 | lowFrequency_explosion_000/001, laserLarge_001, laserSmall_000, laserRetro_000, thrusterFire_000, forceField_000, explosionCrunch_000/002/004 |
| Impact Sounds | https://kenney.nl/assets/impact-sounds | 87b4ddecda-1677589768 | impactMetal_light_000, impactMetal_heavy_004, impactPlate_heavy_000 |

Voice mapping lives in `app/src/game/sound.ts`. Tread rumble and wind
ambience are **synthesized** (brown noise through filters) — no files.

## Other

- `app/public/favicon.svg` — original, drawn in-line (hex + blip motif).
