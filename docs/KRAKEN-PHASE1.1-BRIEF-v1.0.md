# PHASE 1.1 BRIEF — KRAKEN UX & READABILITY

**Filename:** KRAKEN-PHASE1.1-BRIEF-v1.0.md
**Version:** v1.0 — 12 June 2026

Source: owner's first human playtest of the Phase 1 Solo MVP (12 June 2026). The engine is sound; the game does not yet explain itself. Every item below is UI-layer except the one engine verification in §0. Reference: docs/KRAKEN-GDD-v1.3.md and docs/DECISIONS.md.

Theme: the game runs four hidden checks per targeting tap (weapon range, sensor range D18, line of sight, system state) and shows the player the verdict but never the evidence. Phase 1.1 makes the game's state and rules visible.

## 0. ENGINE VERIFICATION (do first)

In the combat phase, does direct fire (MAIN/SEC/AP) resolve against the target **unit** at its post-movement position with range/LOS/sensor re-checked — or against the hex where it stood when locked? The owner observed shots landing on vacated ground.

Expected behaviour: direct fire tracks the unit; a target that moved out of the firing envelope **evades** (emit an `evaded` event with the reason — outOfRange / losBlocked / outOfSensors). Hex-targeting is correct only for missiles/artillery shells (D19). If direct fire is hex-based, fix with tests. Record the answer in DECISIONS.md either way.

## PRIORITY 1 — Lock visibility (the worst hole; owner hit it twice)

Armed is visible (orange button); locked is invisible. Fix with three reinforcing cues:

1. **Locked-target reticle** — on lock, the unit's yellow ring is replaced by a visually distinct pulsing reticle (crosshair/corner brackets, different colour). Cannot be confused with "targetable".
2. **Targeting lines** — thin line from the Kraken to each locked target, one colour per weapon. With several weapons locked, the player sees their whole fan of fire.
3. **Weapon bar lock badges** — a locked weapon's button shows its commitment, e.g. `MAIN ◉` with the target type. Bar reads as the fire plan: idle / armed / locked.
4. Tap a locked target again to unlock. Tap a different valid target to re-lock.

## PRIORITY 2 — Targeting legibility (range rings + filtering)

On arming a weapon:

1. **Range band on terrain** — translucent band showing that weapon's reach, colour matching the weapon.
2. **Sensor horizon** — subtle second boundary at current sensor range (state-dependent, D18) when it is tighter than weapon range.
3. **LOS-blocked hexes inside range get distinct treatment** (hatched/darkened) so ridge shadows and forest cover are visible before tapping.
4. **Ring filtering** — yellow rings appear ONLY on targets valid for the armed weapon, re-filtered on every weapon change. Ringed = clickable = will lock. No exceptions.
5. **Specific rejection reasons** — if a tap is still rejected, the message names the actual failed check ("Blocked: line of sight"), not a list of possibilities. The engine knows which check failed; surface it.

Build the range-band as a reusable component — defenders will need Kraken threat rings in Phases 2–3.

## PRIORITY 3 — Distinct unit models (replaces D30 primitives)

Kenney.nl CC0 packs (record in ASSETS.md). Each unit type must be identifiable at a glance at gameplay zoom: heavy tank, light tank, GEV, artillery SPG, scout bike, Command Post, and a more imposing Kraken assembly. Placeholder primitives are no longer acceptable for defender units. Distinct silhouettes matter more than beauty.

## PRIORITY 4 — Turn clarity

1. **Order checklist panel** — persistent during the orders phase: course set/unset, each weapon idle/armed/locked (+target), repair selection, smoke. One glance answers "am I ready to END TURN?"
2. **Resolution phase playback** — END TURN plays a labelled sequence instead of an instant snap: MOVEMENT (units slide) → COMBAT (direct fire, with evade events visible) → ARTILLERY (shells land) → REPAIR (bar ticks). 2–3 seconds total, skippable with a tap. This passively teaches GDD §8.1 and is where the cinematic pillar lives.

## PRIORITY 5 — Teaching layer

1. **Weapon tooltips** — long-press/hover on a weapon button: full name, attack, range ("SEC R — Secondary Battery · ATK 3 · RNG 5").
2. **First-time hints** — one-shot dismissible toasts: arm→target flow on first weapon arm; repair flow on first damage; indirect-fire hex targeting on first missile arm. No persistent tutorial.

## QUALITY BAR

- npm test green throughout (engine + controller); add tests for the §0 fix and any controller logic changes
- npm run build + preview verified; no console errors; phone-portrait 390×844 still usable
- All judgement calls into DECISIONS.md; ASSETS.md updated with pack names + URLs
- Commit in logical chunks; push when green
- Telegram notification per CLAUDE.md standing instruction when done or blocked

## DEFINITION OF DONE

The owner can arm MAIN and see its reach, the ridge shadows inside it, and only valid targets ringed; lock two weapons on two targets and see both reticles, lines, and badges; press END TURN and watch a labelled resolution including any evades; and identify every unit type on sight. The question "why can't I shoot that?" should no longer be askable.

*KRAKEN-PHASE1.1-BRIEF-v1.0.md — end*