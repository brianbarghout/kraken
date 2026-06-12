# PHASE 1.2 BRIEF — KRAKEN FEEL & FIXES

**Filename:** KRAKEN-PHASE1.2-BRIEF-v1.0.md
**Version:** v1.0 — 12 June 2026

Source: owner's second playtest session (12 June 2026, post-1.1 build). The 1.1 readability work landed — lock visibility, range bands, and playback all verified working in play. This phase fixes the one remaining input bug, repairs the visual scale, adds the overrun mechanic, and delivers the cinematic payoff that GDD pillar #4 promises and Phase 1 lacks.

Reference: docs/KRAKEN-GDD-v1.3.md, docs/DECISIONS.md. Engine changes require tests; presentation changes require smoke-harness coverage.

Design principle for this phase (add to DECISIONS.md): **every committed order must pay off audiovisually at resolution — the ticker is the receipt, not the experience.**

## PRIORITY 1 — Dead-click bug (100% reproducible)

Arm any weapon → range band renders, valid targets ringed → clicks on ringed targets are dead (no lock, no rejection message). Disarm (tap weapon again) → re-arm → the identical click locks immediately, every time. First arm produces a non-functional targeting state; second arm produces a working one.

Suspect: click hit-test or validity lookup built/captured before the envelope finishes computing on first arm — stale-snapshot family (cf. the 1.1 memo bug).

**Test-first is mandatory here:** encode the repro as a failing regression test (arm weapon once → first click on a valid ringed target must lock), watch it fail, then fix. Also assert that a dead click is impossible in principle: any click on a ringed target must produce either a lock or an explicit rejection event — silence is a test failure.

## PRIORITY 2 — Kraken scale & occlusion

The Kraken model has outgrown its logical footprint: it visually sprawls across multiple hexes and hides defender units behind/under its silhouette.

1. Rescale so the model reads as "barely contained by one hex" — target ~1.3 hex visual footprint. Slight overhang is desirable (imposing); occluding neighbouring hexes' contents is not.
2. **X-ray outlines:** any defender unit (or the CP) whose screen position is occluded by the Kraken model renders a visible outline/ghost through it. Standard tactics-game treatment; include in the smoke harness.
3. Evaluate steepening the camera pitch a few degrees to reduce occlusion from tall models generally; apply if it doesn't hurt terrain readability.
4. Defender models may need a modest scale-up for identifiability at the adjusted ratio — judge by eye in the smoke screenshots, silhouette distinctness rules (D37).

## PRIORITY 3 — Overrun (ramming) mechanic — ENGINE + AI + UI [GDD addition, flag in DECISIONS.md]

Currently units cannot enter occupied hexes, which means scouts swarm a 200-tonne machine with impunity once AP guns die. Fix with overrun:

1. The Kraken (only) may path through hexes occupied by defender units. Movement cost unchanged by the overrun itself.
2. **Soft targets (scoutBike, GEV):** destroyed outright on overrun — no roll. Emit a distinct `overrun` event.
3. **Hard targets (lightTank, heavyTank):** resolve a damage roll against the tank (treat as attack ≥ armour bracket: 50/50 damaged-or-no-effect; a damaged tank overrun again is destroyed). Each tank overrun also risks the Kraken: 1-in-3 chance of one damage step to the tread on that side (random side if indeterminate). Grinding through armour is possible and costly.
4. Defender units cannot overrun anything; CP hex cannot be entered (CP destruction is by fire per D13).
5. UI: path preview through an occupied hex shows an overrun marker on that hex; the orders checklist lists planned overruns ("Course: 4 hexes · overruns U7").
6. Tier 1 AI: no avoidance behaviour (dumb per §18.1) — but add the avoidance hook for Tier 2 and note it in the Tier 2 backlog.
7. Tests: soft-kill, hard-target roll, tread-risk roll, damaged-tank-killed-on-second-overrun, CP not enterable, event emission. Balance note in DECISIONS.md referencing D27 (Kraken already dominant; tread-risk is the regulator — tune the 1-in-3 there if needed).

## PRIORITY 4 — Combat juice (visual)

Hang everything on the existing resolution playback (D39); COMBAT phase gets a choreographed timeline:

1. Muzzle flash on each firing Kraken weapon; tracer/projectile line to the target. Defender fire gets tracers toward the Kraken too.
2. Result-scaled impacts: **ping** — small spark/ricochet; **damage** — explosion + persistent smoke trail on the victim; **kill** — full explosion, hull blackens, wreck or scorch mark persists on the hex for several turns.
3. **Converging salvo:** when multiple weapons lock the same target, sync their tracers to land together and scale the explosion up. Multi-weapon kills must look like executions.
4. Overrun gets its own beat: the Kraken visibly drives through, victim crushed/flattened with debris.
5. Brief screen-shake on kills and on hits the Kraken takes (subtle — phone-safe, no motion sickness; cap intensity).
6. Artillery/missile landings get proper ground explosions with scatter visible (impact where the shell lands, not an abstract flash).
7. Wrecks/scorches must not block movement or LOS (cosmetic only) — note in DECISIONS.md.

## PRIORITY 5 — Sound

Web Audio API; source CC0 audio from Kenney audio packs (impact/explosion/sci-fi packs — record pack names + hashes in ASSETS.md). Layered, result-scaled:

1. Distinct voice per weapon class: main battery deep boom, secondaries sharp crack, AP rapid chatter, missile whistle-then-crump, artillery distant thump + incoming whistle on landing.
2. Result sounds: ricochet ping / damage explosion / kill explosion (weightier, with debris tail). Converging salvos layer into one big detonation.
3. Overrun: heavy crunch.
4. Ambience: low tread-rumble while the Kraken moves (it should sound like 200 tonnes), subtle wind/quiet otherwise.
5. Mute toggle in the UI, default ON sound; remember nothing (no storage per §17) — default applies each load.
6. Keep total audio payload lean for mobile; mono is fine.

## PRIORITY 6 — Smaller fixes

1. **Abandon game:** in-game button → confirm tap → back to start screen. Solo-only semantics for now; note the Phase 3 design question (mid-match quit in multiplayer) in DECISIONS.md.
2. **Persistent sensor bubble:** subtle always-on indication of current sensor range on the terrain (distinct from weapon range bands), so "invisible because terrain/range" is readable at all times, not only when arming. Sensor damage visibly shrinks it.
3. Ticker phrasing: include unit type in events ("scoutBike u7 evaded...") — owner reports bare unit codes read cold.

## QUALITY BAR

- npm test green throughout; new engine logic (overrun, dead-click regression) test-first
- Build + preview verified; headless smoke extended: occlusion-outline scenario, overrun scenario, long-session multi-lock scenario; zero console errors; 390×844 still usable
- Audio behind a user-gesture unlock (browser autoplay rules) — verify first END TURN triggers sound correctly
- DECISIONS.md and ASSETS.md updated; commit in logical chunks; push when green
- Telegram notification on completion or blockage per CLAUDE.md standing instruction

## DEFINITION OF DONE

The owner can: arm a weapon and lock a valid target on the **first** click, every time; see every unit even when the Kraken stands in front of it; drive through a scout and leave treadmarks; put three weapons into one light tank and get a single convergent, audible, screen-shaking detonation with a wreck left smoking on the hex; abandon a game from the pause of battle; and at all times read his own sensor horizon off the terrain. The game should feel like commanding a war machine, not auditing one.

*KRAKEN-PHASE1.2-BRIEF-v1.0.md — end*