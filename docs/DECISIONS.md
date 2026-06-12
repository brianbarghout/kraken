# KRAKEN — Engine Design Decisions (Phase 0)

Where GDD v1.3 is silent or qualitative, the engine makes these calls.
Each follows the §2 design pillars; anything marked **[addition]** goes
beyond the GDD and is flagged per §17.

All numbers live in `engine/data/units.json` or the map JSON — playtest
retuning never requires code changes.

## Time & turns

- **D1 — Turn conversion.** 30 minutes / 85 turns ≈ 21 s per turn (§8.1).
  `game.turnLimit = 85`; hitting it ends the game (defenders win, §3).
- **D2 — Repair times in turns.** §5.4 minutes converted at 21 s/turn:
  smoke 1.5 min → 4 turns, sensors 2 min → 6, weapons 3 min → 9,
  treads 4–5 min → 13.

## Kraken systems

- **D3 — State ladder.** Every system: green → amber → red → dark.
  Combat `damage` = one step down; `kill` = dark outright. Weapon attack
  scales 1 / 0.75 / 0.5 / 0 by state (floored); sensor range 10/7/4/2.
- **D4 — 75% repair cap.** "75% of original capability" maps to the amber
  state: repair restores a red/dark system to amber, never green. Amber
  systems are not valid repair targets (already at the cap).
  **[addition]** Damage to the system under repair resets its progress.
  **[addition]** Printers themselves can never be repaired (the GDD only
  says they cannot self-repair once destroyed; we extend to always —
  the lifeline has no lifeline).
- **D5 — Tread speed.** Each tread contributes 1.5/1/0.5/0 MP by state;
  speed = floor(sum). Asymmetric damage (states ≥ 2 steps apart) costs a
  further −1 as turning impairment (§5.2) — but any working tread keeps a
  minimum speed of 1. Both treads dark = immobilised (speed 0).
- **D6 — "Kraken fully destroyed" (§3).** All seven weapon systems AND
  both treads dark. Rationale: printers can stay hidden all game (§13.5),
  so requiring them would make the defender win unreachable; a disarmed,
  immobilised hulk is destroyed for game purposes (pillar 2: degradation
  over death).
- **D7 — Smoke numbers. [addition]** Cloud = Kraken's hex + radius 1,
  lasts 3 turns, 5-turn cooldown, adds +1 scatter to shells landing
  inside it (checked at landing). The GDD names the mechanic but gives
  no numbers.

## Map & movement

- **D8 — Mountains.** Impassable to the Kraken (200-tonne machine, §7.1);
  4× for defenders ("4× or impassable", §6.2).
- **D9 — Hills.** Entering hills from lower ground costs 2× (light tank
  1.5×); moving hill-to-hill or onto hills from equal/higher ground costs
  1× ("2× climbing, 1× descending"). Descending uses the target terrain's
  own cost.
- **D10 — Minimum-move rule. [addition]** A unit whose MP cannot afford
  the first step of its path still moves one hex. Without it, river
  (2.5×) would be permanently impassable to 2-MP units.
- **D11 — Occupied destinations.** An order onto an occupied hex is
  treated as an approach: the unit paths toward it and stops short
  (never enters — no collisions, §8.3). Units cannot path *through*
  occupied hexes either.
- **D12 — Simultaneous movement order.** Kraken resolves first, then
  defenders fastest-first (unit id as tiebreak). Deterministic by
  construction for replay.
- **D13 — Command Post hex.** Impassable to everyone; the Kraken destroys
  it by fire, not by driving over it. CP armour 3, but as a hardened
  structure it is **immune to kill results** (`immuneToKill` in
  units.json): every successful hit steps it one rung down
  green → amber → red → destroyed, so it takes ~3 main-battery hits or
  sustained secondary fire. **[addition — armour value & kill immunity;
  amended by Brian 2026-06-12]**

## Line of sight (§6.2)

- **D14 — Numeric LOS model.** Obstacle height of an intervening hex =
  terrain elevation, +1 if losKind `blocks` (forest canopy), ∞ if
  `fullyBlocks` (mountain). Sight is blocked when obstacle height >
  max(elevation of the two endpoints). Endpoint hexes never block
  themselves; adjacent hexes always see each other. This yields: forest
  blocks ground-level sight but hills see over it (extends-from-top),
  mountains block everything.
- **D15 — Rubble (partial).** One intervening rubble hex never blocks;
  two or more block ground-level sight only (elevated endpoints see over).

## Combat

- **D16 — Defender damage ladder.** green → amber → dead. Amber units
  attack at 50% (floored, min 1) and move −1 MP (min 1). A `kill` result
  is immediate death; heavy tanks may pass one defence roll (50%) against
  a main-battery kill while green, surviving at amber (§8.5).
- **D17 — Per-system targeting without facing.** §8.5 limits system
  selection to the attacker's "LOS arc"; Phase 0 has no model of facing,
  so any defender with LOS to the Kraken may select any targetable
  system. Facing arcs are a Phase 1+ refinement.
- **D18 — Kraken sensor gating.** Direct fire at a defender requires
  distance ≤ sensor range (state-dependent) as well as weapon range and
  LOS — destroyed sensors blind the guns (§5.2). The CP needs no sensors
  (fixed, known location). Defenders need only range + LOS: the Kraken is
  always visible strategically (§7.1).
- **D19 — Missiles as indirect fire.** Kraken missiles use the artillery
  shell pipeline: 1-turn landing delay, scatter 0 with LOS / 2 blind.
  No spotted mode (scout coordination is a defender mechanic). They land
  in the §8.1 artillery landing phase.
- **D20 — Blast model.** Impact hex takes full attack; the 6 hexes
  around it take 50% (floored) splash. Everything in the area is rolled
  against — defenders (friendly fire ON, §8.3), the CP, and the Kraken,
  which takes the hit on a *random* targetable system per affected hex.
- **D21 — Scatter resolution.** Scatter class (aimed 0 / spotted 1 /
  blind 2, §13.3) is fixed when the shell is fired (the scout must have
  eyes on the target hex then); the impact hex is drawn uniformly from
  all hexes within the final radius at landing, after the smoke penalty.
- **D22 — Shoot-and-scoot.** A GEV with a `scootTo` order skips the
  movement phase, fires in combat, then moves with its full MP after
  combat resolves.
- **D23 — Artillery move+fire.** Artillery may move and fire the same
  turn at its firing-turn speed of 1 (§8.5 "2 (1 on firing turn)").

## Engine & data

- **D24 — Determinism.** One mulberry32 RNG seeded at game creation
  drives every roll; processing orders are sorted deterministically.
  Same seed + same orders ⇒ byte-identical event log (verified by test).
  This is the §13.8 replay foundation.
- **D25 — Invalid orders.** Rejected with an `orderRejected` event, never
  an exception — robust against late/garbage multiplayer input in
  Phases 2–3, and keeps the log honest.
- **D26 — Map scale (flagged for playtesting).** map01 is 44×30
  (≈38 hexes Kraken-spawn → CP). An unopposed Kraken crosses in ~10–13
  turns — much faster than the GDD §13.1 intent of ~20 minutes. Kept
  deliberately compact so Phase 0/1 development stays fast; scaling the
  map up is pure data (bigger `rows`). Revisit when the 30-minute pacing
  is playtested.
- **D27 — Balance observation (not a code issue).** Against the naive
  random/Tier-1-style script in `npm run sim`, the Kraken wins
  consistently: defenders that chase rather than block die to its
  superior reach. The mobility-kill path works (treads stripped → speed
  1) but the clock still favours the Kraken on this map size. Inputs for
  Phase 1 Tier-1 AI and §18.2 balance tuning.

## Phase 1 (Solo MVP) decisions

- **D28 — Solo turn flow [flagged in the brief].** The WeGo turn resolves
  when the player hits END TURN — no 20-second timer in solo. The
  30-minute clock is represented as "turns remaining" out of 85.
- **D29 — Terrain is always rendered; fog gates units.** The solo player
  chose the map on the start screen, so hiding static terrain adds
  nothing. Out-of-sensor hexes are dimmed to ~30% (the bubble visibly
  shrinks with sensor damage per §7.2); defender units exist on screen
  only while detected (sensor range AND LOS). Progressive terrain
  *reveal* matters for defender-side fog and returns in Phase 2+.
- **D30 — Primitive models, not Kenney, for Phase 1.** All units/terrain
  are programmatic low-poly primitives (brief: "placeholder primitives
  are acceptable… do not block on art"). Upgrade path and intended packs
  recorded in ASSETS.md; only three scene functions know about geometry.
- **D31 — Effect timing vs the artillery delay.** `shellFired` shows a
  launch flash on the firing turn; the descending arc + explosion play on
  the landing turn (the 1-turn suspense gap stays honest). The Kraken's
  move lerps; defender moves snap (detected-only units tweening in and
  out of fog reads as teleporting anyway).
- **D32 — Dev seam.** `?dev=1` exposes `window.__kraken = { controller,
  bump }` so the headless browser smoke test (`scripts/smoke.mjs`) can
  damage systems and drive the repair flow. No effect without the query
  param.
- **D33 — Particle degradation first (quality bar).** The render loop
  tracks average frame time; sustained > ~22 ms halves the particle
  budget (floor 25%) before any other quality is touched.
- **D34 — AI RNG is separate from game RNG.** `createTier1AI(seed)` uses
  its own stream (`seed ^ 0x7ae1`); AI target picks never perturb the
  engine's replay-critical RNG sequence.
- **D35 — Tier 1 AI gaps.** "Last known position" = current position
  (the Kraken blip is always on the strategic layer, §7.1). Artillery
  already on hills but out of range advances toward the Kraken — the GDD
  is silent; sitting uselessly forever felt wrong even for Tier 1.
  Tier 1 GEVs do not shoot-and-scoot (that is terrain/tactic
  exploitation, which §18.1 excludes).
## Phase 1.1 (UX & readability) decisions

- **D36 — Direct fire is unit-tracking with re-validation (§0 of the
  brief, verified + hardened 2026-06-12).** Combat resolves after
  movement; MAIN/SEC/AP fire orders re-check range, sensors and LOS
  against the target's post-movement position. A target out of envelope
  at resolution **evades**: the engine emits a `targetEvaded` event
  (surfaced in the UI ticker and CLI sim) instead of a silent generic
  rejection. Only missiles and artillery are hex-targeted — their shells
  landing on vacated ground is the designed 1-turn-delay suspense, not
  a bug.

- **D37 — Kenney models are repurposed civilian/TD kits.** Kenney has no
  3D military pack, so silhouettes are composed (tractor-shovel + turret
  = heavy tank, flatbed + cannon = artillery SPG, hover racer = GEV,
  kart = scout) and faction-tinted. Distinct shapes over literal tanks,
  per the brief. Full mapping in ASSETS.md. The Kraken stays a custom
  primitive assembly (GDD §16.2 + per-system damage materials).
- **D38 — First-time hints are per-session.** The GDD forbids
  localStorage/sessionStorage (§17), so one-shot teaching toasts reset
  with each page load. Acceptable: they only fire on first arm / first
  missile / first damage, and veterans skim past them.
- **D39 — Resolution playback timing.** Phase segments only play when
  they have content (MOVEMENT/COMBAT/ARTILLERY/REPAIR), ~0.7 s each,
  tap anywhere on the battlefield to skip. Phase labels double as the
  §8.1 teaching device.
