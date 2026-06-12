# PHASE 1 BRIEF — KRAKEN SOLO MVP

**Filename:** KRAKEN-PHASE1-BRIEF-v1.0.md
**Version:** v1.0 — 12 June 2026

Reference: docs/KRAKEN-GDD-v1.3.md §18.1 (Solo mode), §5.3 (dashboard), §7 (fog of war), §16 (assets), §19 Phase 1. The Phase 0 engine is the single source of game truth — the UI never duplicates rules logic. Engine bugs found during this phase get fixed in /engine with tests.

## GOAL

A complete playable Solo game in the browser: the human drives the Kraken from spawn to Command Post against Tier 1 AI defenders, on the Gateway map, with win/loss and post-game summary. Runs entirely client-side as a static SPA (solo needs no server, GDD §18.4).

## STACK

- Vite + React + TypeScript in /app, importing /engine directly
- Three.js for the 3D tactical view
- Kenney.nl CC0 assets for all models/terrain (download into /app/public/assets; record pack names + URLs in docs/ASSETS.md). Placeholder primitives are acceptable wherever a Kenney model doesn't fit — do not block on art.
- Static build output must deploy cleanly to Cloudflare Pages later
- No localStorage/sessionStorage anywhere

## DELIVERABLES

1. **Game shell** — start screen (full map / 50% reduced map per §18.1), game screen, post-game summary (system damage log, kill feed, §11).
2. **Kraken tactical view** — Three.js scene: terrain from map JSON, Kraken model, fog of war per §7 (only hexes within sensor range AND LOS are revealed; sensor damage visibly shrinks the bubble). Defender units render only when detected.
3. **Strategic mini-map** — canvas, corner overlay per §7.1: full map outline, CP marker, own position. (Sensor bleed is defender-side; not needed in solo.)
4. **Kraken dashboard per §5.3** — SVG schematic, all systems labelled, colour + shape states (✓/△/!/✕), spatial L/R treads, live repair bar. This is the hero UI — make it feel like a machine's nervous system, not a settings panel.
5. **Controls** — tap/click a hex to set movement target (A* path preview); weapon fire orders with valid-target highlighting per engine rules; repair system selection; smoke trigger. Must work with touch.
6. **Turn flow** — solo adaptation [flag in DECISIONS.md]: the turn resolves when the player commits orders ("END TURN"), no 20s timer. The 30-minute clock is the 85-turn limit, shown as turns remaining.
7. **Tier 1 AI exactly per §18.1**: move toward Kraken's last known position; fire when in range; artillery seeks nearest high ground then fires; scouts advance to sensor range, hold, report; no inter-fleet coordination, no retreat. Implement in /engine (it issues orders through the same API as a human would) so Phase 2+ reuses nothing UI-bound. Default solo opposing force: 1× GEV squadron, 1× heavy tank platoon, 1× light tank troop, 1× artillery battery, 1× scouts.
8. **Visual effects per §16.4** — parabolic shell arcs (programmatic curves), simple particle explosions, smoke cloud, damage states on the Kraken via material/texture swap at amber/red/dark.
9. **Fonts**: Rajdhani + Inter (Google Fonts, self-hosted in the build).

## MOBILE

Defenders are phone-first in later phases, but the solo player is the Kraken — target tablet/laptop layout first (§12), with a usable phone-portrait fallback. Test at 390×844.

## QUALITY BAR

- npm test stays green (engine tests + new AI tests; UI logic that can be tested headless, is)
- npm run build produces a working static bundle; verify with `npm run preview`
- 60fps target on the NUC at default map; degrade particles before anything else
- Update DECISIONS.md (new judgement calls), ASSETS.md, SESSION-LOG.md
- Commit in logical chunks; push when green

## DEFINITION OF DONE

The owner can open the preview URL on the NUC, start a solo game, lose a tread to the AI, repair under fire, and either die, win at the CP, or time out at turn 85 — with the dashboard telling the story throughout.

*KRAKEN-PHASE1-BRIEF-v1.0.md — end*