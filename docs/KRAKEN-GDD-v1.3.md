# KRAKEN — Game Design Document

**Version:** v1.3
**Filename:** KRAKEN-GDD-v1.3.md
**Status:** Draft — for development handoff
**Tagline:** *One machine. One objective. Stop it if you can.*

-----

## CHANGELOG — v1.3 (12 June 2026)

- Section 13 open questions resolved — converted to design decisions (Section 13 rewritten)
- New Section 8.5: Unit Statistics & Combat Mathematics (full stat tables)
- New unit added: **Light Tank** (fleet table §4.2 and stats §8.5)
- Turn cadence specified: simultaneous WeGo, 20-second order window (§8.1)
- Flagged additions beyond v1.2: GEV shoot-and-scoot, scout "spotted fire", per-system armour values, light tank
- New Section 19: Build Sequence (development phases)

-----

## 1. CONCEPT OVERVIEW

KRAKEN is an asymmetric multiplayer tactical wargame for 2 to 50 human players, playable in a browser on desktop or mobile. One player controls the Kraken — a vast, semi-autonomous cybernetic war machine of overwhelming power — while all other players control defending units attempting to destroy it before it reaches and obliterates the Command Post.

The game is inspired by the classic 1977 board wargame *Ogre* by Steve Jackson but is an original design with substantially expanded mechanics, 3D presentation, and internet multiplayer at its core.

-----

## 2. DESIGN PILLARS

1. **Asymmetric tension** — one monster versus many humans, never AI vs human
2. **Degradation over death** — the Kraken loses systems, not hit points
3. **Fog of war with realism** — visibility is earned by position, not toggled
4. **Cinematic moments** — parabolic shell arcs, ridge barrages, last-stand drama
5. **Social chaos** — defenders must self-organise with no formal command structure
6. **30-minute sessions** — always tight, always dramatic

-----

## 3. WIN CONDITIONS

|Outcome                    |Condition                                                                          |
|---------------------------|-----------------------------------------------------------------------------------|
|**Defenders win**          |Kraken is fully destroyed                                                          |
|**Kraken wins**            |Command Post is destroyed                                                          |
|**Draw**                   |Both destroyed simultaneously                                                      |
|**Defenders win (timeout)**|30-minute clock expires with Kraken alive and CP intact — Kraken failed its mission|

-----

## 4. PLAYERS & ROLES

### 4.1 The Kraken Player

- Always a human — never AI
- Controls the Kraken directly: movement, weapons selection, targeting, repair priority
- Has an elevated tactical overview plus full system dashboard
- Must choose a path from spawn point to Command Post — complete freedom of route
- Manages self-repair during the game

### 4.2 Defender Players

Each defender commands a **fleet** — a group of 2–5 same-type units controlled as a squad. This allows small groups or even solo players to run a full game.

|Fleet Type                  |Units                  |Role                                           |
|----------------------------|-----------------------|-----------------------------------------------|
|**GEV Squadron**            |3–4 hovercraft         |Fast flanking, hit-and-run, harassment         |
|**Tank Platoon**            |2–3 heavy tanks        |Slow, high damage, frontline assault           |
|**Light Tank Troop**        |3–4 light tanks        |Rapid assault, tread hunting, flexible middleweight|
|**Mobile Artillery Battery**|2–3 self-propelled guns|Long-range parabolic fire, ridge warfare       |
|**Motorcycle Scouts**       |4–5 bikes              |Ultra-fast, zero firepower, pure reconnaissance|

- One person may command multiple fleet types if player count is low
- Maximum 50 human players in a session
- No AI defenders — human coordination (or lack of it) is the point

-----

## 5. THE KRAKEN — UNIT DESIGN

### 5.1 Visual Presentation

- Large 3D model, visibly imposing against defender units
- Damage is shown visually on the model — scarring, smoke, sparking systems, missing components
- Not a health bar — individual systems degrade and fail independently

### 5.2 Systems & Degradation

|System                 |Function                                  |Effect When Destroyed                                             |
|-----------------------|------------------------------------------|------------------------------------------------------------------|
|**Main Battery**       |Primary cannon — destroys tanks in one hit|Lost — must rely on secondaries                                   |
|**Secondary Batteries**|Anti-tank, shorter range                  |Reduced firepower envelope                                        |
|**Anti-Personnel Guns**|Destroys infantry and light units         |Scouts/bikes can now approach safely                              |
|**Missile Racks**      |Long-range strike, can fire blind         |No more indirect bombardment                                      |
|**Smoke Dispensers**   |Creates targeting interference cloud      |Artillery gets clean shots                                        |
|**Tread Units (L/R)**  |Movement                                  |Speed reduced per hit; asymmetric damage causes turning impairment|
|**Sensor Array**       |Detection range and targeting accuracy    |Fog of war closes in on Kraken player                             |
|**Repair Printers**    |Self-repair capability                    |If destroyed, no more self-repair                                 |

### 5.3 The Kraken Dashboard

- Top-down schematic of the Kraken displayed on the player's screen
- Systems shown as labelled components on the diagram
- Colour states: Green (operational) → Amber (damaged, reduced) → Red (critical) → Dark (destroyed)
- **Accessibility:** every state also carries a shape icon (✓ / △ / ! / ✕) — never colour alone (see §13.10)
- Tread damage shown spatially — left vs right side visible
- Repair progress shown as a live bar on the currently-repairing system

### 5.4 Self-Repair System (3D Printer Mechanic)

The Kraken carries internal fabrication units that can rebuild damaged systems under battlefield conditions.

**Rules:**

- Only **one system** can be repaired at a time
- Repair requires the Kraken to **reduce speed significantly** (not full stop, but cannot sprint)
- Maximum repair level: **75% of original capability** — battlefield conditions prevent full restoration
- Repair times (approximate, to be tuned in playtesting):
  - Sensors: fast (~2 min)
  - Weapons: medium (~3 min)
  - Smoke: fast (~1.5 min)
  - Treads: slow (~4–5 min) — most complex
  - Repair Printers themselves: cannot self-repair if destroyed
- Defenders can see on the strategic map that the Kraken has slowed — they know repair is happening
- This creates a **pursuit decision** for defenders: rush in and interrupt, or hold position?
- **Printer concealment:** repair printers are hidden (not targetable) until the first time the Kraken performs any repair — the act of repairing reveals them (see §13.5)

-----

## 6. MAP & TERRAIN

### 6.1 Visual Style

- 3D rendered terrain — not hyper-realistic, but clearly readable
- Style reference: enough fidelity to distinguish terrain types at a glance
- Units are 3D models scaled appropriately — Kraken large and visible, defender units small

### 6.2 Terrain Types

|Terrain       |Movement Cost             |Line of Sight    |Cover Bonus|
|--------------|--------------------------|-----------------|-----------|
|Open Ground   |1× (full speed)           |Clear            |None       |
|Road          |0.75× (faster)            |Clear            |None       |
|Forest        |3× (slow)                 |Blocked          |Good       |
|Hills         |2× climbing, 1× descending|Extended from top|Partial    |
|Mountain      |4× or impassable          |Fully blocks     |Full       |
|River         |2.5× crossing             |Clear            |None       |
|Swamp         |4× (very slow)            |Clear            |None       |
|Rubble/Craters|2×                        |Partial          |Partial    |

Unit exceptions: GEVs ignore river/swamp costs (hovercraft); light tanks climb hills at 1.5× (light chassis).

### 6.3 Map Variants

- Multiple map layouts available to prevent strategic staleness
- Maps are **data-driven JSON files** — three handcrafted maps ship at release (see §13.9)
- Fixed defender spawn positions on map edges
- Command Post fixed at one end; Kraken spawns at opposite end
- Maps designed to offer ridge lines, choke points, forest corridors, and open kill zones
- **Grid:** hexagonal — wargame-native, no diagonal distortion

-----

## 7. VISIBILITY & FOG OF WAR

### 7.1 Two-Layer System

Every player — Kraken and defenders — sees two simultaneous views:

**Layer 1 — Strategic Mini-Map (corner of screen)**

- Simple top-down rectangle of the full battlefield
- Kraken: always visible as a pulsing blip (it cannot hide — it's a 200-tonne machine)
- Command Post: fixed marker
- Own units: dot(s) in your colour
- Friendly units: faint dots (approximate positions)
- Enemy units: only visible if within someone's tactical sensor range

**Layer 2 — Tactical View (main screen)**

- 3D view from your unit's position/elevation
- Visibility radius determined by sensor range
- **Terrain blocks line of sight** — a hill or forest between you and a target means you cannot see it even if within range
- The Kraken has longer sensor range but terrain still applies
- As you advance, fog lifts progressively and realistically

### 7.2 Sensor Bleed

- The Kraken emits heat, sound, and ground vibration
- As it gets closer, even units without line of sight get a degraded signal — the blip on the mini-map becomes sharper and more precise
- Destroyed sensor array reduces this — Kraken's own awareness shrinks

### 7.3 Scout Reconnaissance

- Motorcycle scouts that advance reveal terrain and enemy positions for the whole team
- Their scouting data is shared on the strategic map
- Scouts do not need line of sight to report Kraken position — proximity is enough
- Scouts reveal a 4-hex radius to the whole team and enable **spotted fire** for artillery (see §8.2)

-----

## 8. COMBAT MECHANICS

### 8.1 Turn Structure

**Cadence: simultaneous WeGo.** All players issue orders within a **20-second order window**; the server then resolves all phases at once. Approximately 85 turns fit the 30-minute clock. Real-time was rejected — it disadvantages mobile players and multiplies netcode complexity.

1. **Orders phase** — all players simultaneously issue movement and action orders (20s window)
2. **Movement phase** — all units move
3. **Combat phase** — all attacks resolve
4. **Artillery landing phase** — shells fired last turn now land and explode
5. **Repair phase** — Kraken repair progress ticks forward
6. **Status update** — system damage confirmed, destroyed units removed

### 8.2 Artillery — Parabolic Fire

- Mobile artillery fires in a parabolic arc visible to all players in 3D
- Shells fired this turn **land next turn** — suspense gap between firing and impact
- Artillery can fire beyond line of sight using coordinates (blind fire)
- Blind fire is less accurate — **2-hex scatter radius**
- **Spotted fire** *(addition v1.3)*: if a friendly scout has eyes on the target hex, blind fire improves to **1-hex scatter** — rewards scout/artillery coordination
- Line-of-sight fire from ridge positions: full accuracy (0 scatter)
- Coordinated salvos from multiple artillery units land simultaneously — devastating if on target
- **Friendly fire is ON** — miscoordinated salvos can hit defender units

### 8.3 Friendly Fire

- All weapons can damage friendly units if they are in the blast radius or fire line
- Deliberate friendly targeting is not possible — the UI will not lock onto friendly units (see §13.4)
- No collision damage — units cannot enter an occupied hex
- This is intentional — human coordination (and its failures) is a core feature
- Spectacular and occasionally hilarious

### 8.4 The Ridge Moment

- Artillery units climbing to high ground gain extended line of sight
- Climbing is slow and exposes them — the Kraken player can see blips converging on high ground
- Once on a ridge, artillery has maximum range and accuracy
- The Kraken must decide: divert to eliminate the ridge threat, or push toward the Command Post and absorb the fire?

### 8.5 Unit Statistics & Combat Mathematics *(new in v1.3)*

All values live in `units.json` — playtest-tunable without code changes. Numbers are original to KRAKEN.

**Defender Units**

|Unit            |Speed (hex/turn)|Attack|Range        |Armour|Special                                                                   |
|----------------|----------------|------|-------------|------|--------------------------------------------------------------------------|
|**Heavy Tank**  |2               |4     |4            |3     |Survives one main-battery glance (Amber, not dead) on a defence roll      |
|**Light Tank**  |3               |3     |3            |2     |Climbs hills at 1.5×; damages treads on any hit                           |
|**GEV**         |5               |2     |3            |1     |Ignores river/swamp cost; may move *after* firing (shoot-and-scoot)       |
|**Artillery SPG**|2 (1 on firing turn)|6 |9 (11 ridge) |1     |Parabolic, 1-turn delay, blind fire w/ scatter, spotted fire w/ scout     |
|**Scout Bike**  |6               |0     |—            |0     |Reveals 4-hex radius to team; enables spotted fire (1-hex scatter)        |

**Kraken Weapons**

|System          |Attack|Range|Best against                       |Hard-countered by                          |
|----------------|------|-----|-----------------------------------|--------------------------------------------|
|Main Battery    |6     |8    |Tanks (one-shot)                   |Range — ridge artillery sits at 9–11        |
|Secondaries ×2  |3     |5    |GEVs, light tanks, damaged tanks   |Speed — GEVs dart in/out of the 5-ring      |
|Anti-Personnel ×2|2    |3    |Scouts, exposed crews              |Nothing — until destroyed, then scouts swarm|
|Missile Rack ×2 |5     |12   |Artillery (counter-battery, blind) |Terrain masking only                        |

Kraken movement: 3 hex/turn at full health; sensor range 10 hexes.

**Combat Resolution**

Attack vs Armour, single server-side random roll:

- Attack ≥ 2× Armour → **kill**
- Attack ≥ Armour → **damage roll** (50/50: damaged or no effect)
- Attack < Armour → **ping** (no effect)

**Attacking the Kraken — per-system armour** *(addition v1.3)*: attacks target individual systems; attacker selects the system if it is within their LOS arc.

|Kraken System   |Armour|
|----------------|------|
|Treads (each)   |2     |
|Weapons (each)  |3     |
|Sensor Array    |2     |
|Smoke Dispensers|2     |
|Repair Printers |4 (once revealed — see §5.4)|

**Strategic interplay (design intent):**

- **Heavy tanks** want to arrive after the main battery is stripped, or arrive in numbers from two arcs
- **Light tanks** are genuine tread-hunters (attack 3 vs armour 2 = damage on any hit) and can finish weakened systems — but the main battery one-shots them with no survival roll; they live by not being the priority target
- **GEVs** can barely scratch weapons (2 vs 3) but hurt treads (2 vs 2) — their job is the mobility kill via shoot-and-scoot
- **Artillery** outranges everything but is blind without scouts and nearly defenceless — missile counter-battery is its nightmare
- **Scouts** turn artillery from shotgun to rifle; killing the AP guns flips them from victims to untouchable spotters
- A mixed light-tank + GEV pincer forces the Kraken's secondaries into target-selection errors — they cannot swat both

The defender meta-question: *which system do we strip first?* Treads (slow it, win on the clock), main battery (free the tanks), missiles (free the artillery), or AP guns (free the scouts, which frees the artillery). Four viable openings; the Kraken's route choice punishes some and rewards others.

-----

## 9. MOTORCYCLE SCOUTS

- Fastest units on the map — can cross open ground rapidly
- Zero offensive capability — cannot fire anything
- Their role: advance, spot, report, survive
- Anti-personnel guns on the Kraken are their primary threat — if those are destroyed, scouts can approach freely
- Scouting data shared in real time on the strategic mini-map for all defenders
- Scouts enable spotted fire for artillery (§8.2)
- Playing scouts is a pure adrenaline role — fragile, exposed, vital

-----

## 10. COMMUNICATION

- No built-in voice or text chat in the game itself
- Players are expected to run a Discord server or WhatsApp group alongside the game
- This is intentional — external communication adds to the chaos and social experience
- Spectators join a read-only view with full map visibility — ideal for streaming or group viewing

-----

## 11. SESSION STRUCTURE

|Phase                  |Duration                               |
|-----------------------|---------------------------------------|
|Lobby / fleet selection|Pre-game                               |
|Active game            |Maximum 30 minutes                     |
|Timeout resolution     |Defenders win if Kraken alive          |
|Post-game summary      |System damage log, kill feed, MVP stats|

-----

## 12. TECHNICAL ARCHITECTURE (RECOMMENDED)

### Frontend

- **React** — component structure for UI, dashboards, mini-map
- **Three.js** — 3D terrain, unit models, parabolic shell arcs, explosions
- Mobile-optimised — each defender plays on their phone
- Kraken player ideally on tablet or laptop for larger dashboard

### Multiplayer Backend

- **WebSockets** via Supabase Realtime or Pusher for live game state sync
- Each phone receives only its own unit's tactical view + shared strategic data
- Host/GM screen optional — spectator mode shows full map
- Session state managed server-side — 30-minute clock authoritative on server
- **Full event stream logged server-side from day one** — enables replay and bug diagnosis at near-zero cost (§13.8)

### Deployment

- Hosted web app — no app store required, plays in mobile browser
- Single URL shared in Discord/WhatsApp to join session

-----

## 13. DESIGN DECISIONS (formerly Open Questions — resolved v1.3)

1. **Movement points** — hex grid; base speeds per §8.5 (Scouts 6, GEV 5, Light Tank 3, Kraken 3, Heavy Tank 2, Artillery 2/1). Terrain multipliers per §6.2. Tuned so a full-health Kraken crosses the map in ~20 minutes, leaving margin against the 30-minute clock.
2. **Kraken weapon ranges** — per §8.5: Main 8, Secondaries 5, AP 3, Missiles 12, Sensors 10. Ridge artillery (9–11) deliberately outranges the main battery.
3. **Artillery scatter** — aimed (LOS): 0. Blind: 2 hexes. Spotted (scout on target hex): 1 hex.
4. **Fleet vs fleet** — no deliberate friendly targeting (UI will not lock friendlies); blast radii and fire lines damage anyone within them; no collision damage.
5. **Repair printers** — hidden at game start; become targetable the first time the Kraken repairs anything. Repairing exposes the lifeline.
6. **Lobby balancing** — assignment priority: artillery → tank → fast (GEV/scout) → remainder round-robin. Guarantees the §18.3 minimum viable force; players may swap before launch.
7. **Spectator delay** — 30 seconds default; host-selectable 0/30/60s.
8. **Post-game replay** — replay *viewer* deferred to post-MVP, but full event stream logged server-side from day one.
9. **Map editor** — deferred. Three handcrafted JSON maps ship instead; the data-driven format makes a future editor a UI layer only.
10. **Accessibility** — built in from the start: all status states use shape + colour (✓ / △ / ! / ✕), never colour alone.

-----

## 14. ATMOSPHERE & LORE

The Kraken is not a nickname. It is a designation — stencilled on the hull by a maintenance crew who ran out of other words for it. Previous designations were clinical: Unit 7, Mark IV-B, Autonomous Ground Asset. None of them captured what it was like to watch one come over a ridge.

The defenders don't have ranks. They have radios, vehicles, and thirty minutes.

-----

## 15. LEGAL POSITION & CREATIVE LINEAGE

### 15.1 Inspiration vs Copying

KRAKEN is an original game inspired by a love of *Ogre* (Steve Jackson Games, 1977) — a classic asymmetric wargame played by the designer in his youth. The emotional DNA is there: one unstoppable machine versus many defenders, system degradation over simple hit points, the tension of watching something powerful being slowly dismantled.

However KRAKEN is not a copy, a clone, or a derivative work. The following are entirely original to this design:

- Fleet commander system (one human controls multiple units)
- Self-repair via 3D printer mechanic with 75% ceiling
- Two-layer fog of war with sensor bleed
- Parabolic artillery with one-turn landing delay
- Spotted-fire scout/artillery coordination mechanic
- Motorcycle scout role
- Mobile-only artillery (no static placements)
- 50-player internet multiplayer architecture
- 30-minute session format with timeout win condition
- Friendly fire as a deliberate social mechanic
- The Kraken player always being human — never AI
- All numerical stat values, combat resolution formula, and per-system armour design

### 15.2 What Cannot Be Copyrighted

Game mechanics, rules concepts, and gameplay systems cannot be copyrighted under law — only the specific expression (rulebook text, artwork, counter designs). KRAKEN uses none of Ogre's text, artwork, or components.

### 15.3 Instruction to Developer

Do **not** reproduce, directly adapt, or closely paraphrase any text from Ogre rulebooks or supplements. Design all mechanics from the GDD as the sole reference. Where the GDD leaves gaps, invent original solutions consistent with the design pillars in Section 2. The goal is a game that *feels* like the spiritual successor to Ogre without being legally or creatively beholden to it.

-----

## 16. GRAPHIC ASSETS — SOURCING PLAN

### 16.1 Philosophy

KRAKEN needs graphics that are readable, consistent, and atmospheric — not photorealistic. Clarity on a mobile screen matters more than visual complexity. A coherent art style beats expensive realism.

### 16.2 Recommended Sources

**Kenney.nl — Primary Source (Free, CC0)**

- kenney.nl is a professional-quality free asset library with full CC0 licensing — no attribution required, no commercial restrictions
- Relevant packs: *Military*, *Tanks*, *Vehicles*, *Terrain Tiles 3D*, *Nature Kit*
- These are clean, readable, consistent in style — ideal for wargame unit clarity
- Use as the baseline for all defender units and terrain
- Start here for prototyping; can be upgraded later without changing game architecture

**Sketchfab — Secondary Source (Mixed licensing)**

- Large library of 3D models, many free under Creative Commons
- Search terms: "military tank low poly", "hovercraft 3D", "artillery vehicle", "sci-fi tank"
- Always check individual model license before use
- Quality varies — curate carefully
- Good source for unique one-off assets

**AI 3D Generation — For the Kraken Hero Asset**

- Tools: Meshy.ai, Tripo3D, or CSM.ai
- Text-to-3D is now capable enough for concept-quality hero assets
- Prompt suggestion: *"Massive cybernetic war machine, heavily armoured, multiple weapon turrets, industrial scarring, one central sensor array, treads visible on both sides, menacing silhouette, low-poly game asset style"*
- Generate multiple variants and select the most imposing
- The Kraken is the hero unit — it deserves a custom model, not a library asset

**Commission — If Budget Allows**

- Platforms: Fiverr, ArtStation, CGTrader
- Scope: 7 unit types (Kraken, GEV, heavy tank, light tank, artillery SPG, motorcycle scout, command post) plus damage state variants
- Budget estimate: $300–$800 for a complete low-poly military unit set from a competent freelancer
- Owning the assets outright removes all licensing uncertainty

### 16.3 Recommended Build Sequence for Assets

|Phase        |Assets needed                                        |Source                   |
|-------------|-----------------------------------------------------|-------------------------|
|**Prototype**|Basic unit shapes, flat terrain                      |Kenney.nl                |
|**Alpha**    |Proper unit models, terrain tiles, basic Kraken      |Kenney + Meshy.ai        |
|**Beta**     |Custom Kraken model, damage states, explosion effects|Commission + Kenney      |
|**Release**  |Full polished set, consistent style, mobile-optimised|Commission or curated mix|

### 16.4 Visual Effects

- Parabolic shell arcs: programmatic in Three.js — no asset needed, drawn as a curve with a projectile sprite
- Explosions: particle systems in Three.js, or free sprite sheets from kenney.nl
- Smoke dispenser effect: Three.js particle cloud, semi-transparent grey
- Damage scarring on Kraken: texture swaps on the model at each damage threshold
- Sensor blip pulse on mini-map: pure CSS/canvas animation — no asset needed

### 16.5 UI & Dashboard

- Kraken schematic dashboard: SVG drawn in code — precise, scalable, no asset required
- System status indicators: colour-coded SVG components (green/amber/red/dark) with shape icons (✓ / △ / ! / ✕)
- Mini-map: canvas element rendered in real time
- All UI fonts: free Google Fonts — suggested pairing: *Rajdhani* (military feel) + *Inter* (readability)

-----

## 17. INSTRUCTIONS FOR THE DEVELOPMENT SESSION

This GDD is intended to be handed to a capable AI coding assistant (or human developer) as a complete brief. The following instructions apply:

**Work style:**

- Treat this as a one-shot build brief — attempt to fill all gaps using good game design judgement before asking questions
- Where questions are genuinely necessary, ask them in **multiple-choice format** — the owner finds this faster and easier than open-ended questions
- Do not ask questions that are answerable from the GDD itself

**Priorities:**

1. Game logic and mechanics first — get the rules working before worrying about visuals
2. Use Kenney.nl assets for all prototyping — do not block on custom graphics
3. Build mobile-first — defenders play on phones, this is non-negotiable
4. The Kraken dashboard is a priority UI element — it needs to feel visceral and real
5. WebSocket multiplayer architecture should be designed in from the start, not bolted on later

**All values in §8.5 and §13 are starting points** — implement them as `units.json` / config data so playtesting can retune without code changes.

**Do not:**

- Reproduce any text or mechanics directly from Ogre rulebooks
- Add features not in this GDD without flagging them as additions
- Use localStorage or sessionStorage in browser artifacts
- Ask open-ended questions — multiple choice only if clarification needed

-----

## 18. GAME MODES

KRAKEN ships in three modes. All three share identical rules, map engine, and Kraken mechanics. Only the opponent side changes.

-----

### 18.1 Mode 1 — Solo (1 Player)

**"Can you reach the Command Post alone?"**

- The human plays the Kraken
- All defender fleets are controlled by AI
- Purpose: practice, map exploration, system familiarity, solo entertainment

**AI Defender Behaviour — Tier 1 (Build Now)**
Simple rule-based logic — sufficient for testing and casual solo play:

- Units move toward the Kraken's last known position
- Fire when target enters weapon range
- Artillery moves to nearest high ground then fires
- Scouts advance to sensor range then hold and report
- No coordination between fleets — each acts independently
- No terrain exploitation, no ambushes, no retreat logic

**AI Defender Behaviour — Tier 2 (Later Version)**
Competent rule-based upgrade — feels like a real opponent:

- Units use terrain for cover when advancing
- Artillery prioritises ridge positions before firing
- Scouts genuinely scout ahead of the main force and relay positions
- Fleets loosely coordinate — tanks advance while artillery sets up
- Units retreat when heavily damaged rather than dying in place
- Targets Kraken systems in priority order: treads first to slow it, then weapons

**AI Defender Behaviour — Tier 3 (Future Version — Major Project)**
Intelligent tactical AI:

- Full fleet coordination with role awareness
- Ambush logic — units hold position and wait for Kraken to enter kill zone
- Prioritised system targeting based on Kraken damage state
- Pursuit-interrupt logic — rushes Kraken when repair detected
- Adaptive routing — blocks likely Command Post approach paths
- This tier is a standalone development project, not part of the initial build

**Solo Map Size**

- Full map available
- Optional reduced map (50% size) for faster solo sessions

-----

### 18.2 Mode 2 — Two Player

**"One commands the monster. One commands everything trying to stop it."**

- Player 1: the Kraken — full dashboard, tactical + strategic view
- Player 2: the Defender Commander — controls all fleets simultaneously, acts as general
- No AI involved — pure human vs human
- Ideal for testing, learning the game, and casual competitive play

**Defender Commander Interface (Mode 2 only)**

- Single screen showing all fleets with a tabbed or split interface
- Can issue orders to all units, switch between fleet views, see full friendly map
- Strategic mini-map shows all friendly positions simultaneously
- This is a more complex role than single-fleet play — commanding everything at once
- Recommended for experienced players or specifically for testing balance

**Map Size for Two Player**

- Reduced map recommended — 60% of full size
- Fewer total units on defender side to keep 30-minute session target
- Suggested defender loadout for 2-player: 1× GEV squadron, 1× tank platoon, 1× mobile artillery battery, 1× motorcycle scouts — all controlled by Player 2

**Balance Note for Developer**
Two-player mode will feel different from multiplayer — the Defender Commander has perfect information about all friendly units and no coordination lag. This makes defenders more efficient. Consider slightly increasing Kraken speed or weapon power in this mode, or reducing defender unit count. Flag as a playtesting tuning item.

-----

### 18.3 Mode 3 — Multiplayer (3 to 50 Players)

**"One machine. Many humans. Thirty minutes."**

This is the primary designed experience — full rules as specified throughout this GDD.

- 1 human plays the Kraken
- 2–49 humans each command a fleet
- Low player count (3–6): each defender commands 2–3 fleets
- Medium player count (7–20): each defender commands 1–2 fleets
- Full player count (21–50): each defender commands exactly one fleet
- Session hosted via URL — no app install required
- Players join on any device — mobile or desktop
- 30-minute hard clock, server-authoritative
- Spectator mode available — unlimited viewers, full map visibility, 30s default delay

**Lobby Auto-Assignment (low player count)**
When fewer than 8 defenders join, the lobby auto-suggests fleet assignments to ensure all unit types are represented:

- Minimum viable defending force: at least 1 artillery battery, 1 fast unit (GEV or scouts), 1 tank — even if all controlled by one person
- Assignment priority: artillery → tank → fast → remainder round-robin (§13.6)
- Developer to implement suggested auto-assignment with player override option

-----

### 18.4 Mode Comparison Summary

|Feature          |Solo              |Two Player          |Multiplayer    |
|-----------------|------------------|--------------------|---------------|
|Kraken           |Human             |Human               |Human          |
|Defenders        |AI (Tier 1→2)     |1 Human (all fleets)|2–49 Humans    |
|Map size         |Full or reduced   |Reduced recommended |Full           |
|Session length   |30 min max        |30 min max          |30 min max     |
|Primary purpose  |Practice / testing|Testing / casual    |Full experience|
|Internet required|No                |No (local)          |Yes            |
|AI involvement   |Defenders only    |None                |None           |

-----

## 19. BUILD SEQUENCE *(new in v1.3)*

Each phase ends playable.

**Phase 0 — Engine core (no graphics).** Repo `BrianBarghout/kraken`, built in Claude Code. Hex map model, JSON map format, turn resolver (orders → movement → combat → artillery landing → repair → status), Kraken system/degradation model, LOS algorithm, `units.json` config. Headless and unit-testable.

**Phase 1 — Solo MVP.** React + Three.js with Kenney placeholder assets, one map. Kraken controls, SVG dashboard (colour + shape states), fog of war, repair mechanic, Tier 1 AI per §18.1, win/loss conditions, 30-minute clock. A complete playable game.

**Phase 2 — Two Player.** WebSocket layer (Supabase Realtime) with Mode 2 as the test case. Defender Commander tabbed interface, 60% map. WeGo turns keep netcode simple: server collects orders, resolves, broadcasts state.

**Phase 3 — Multiplayer.** Lobby with auto-assignment, URL join, per-player fleet views, sensor-bleed sharing, spectator mode with delay, event-stream logging.

**Phase 4 — Polish.** Tier 2 AI, custom Kraken model (Meshy.ai), damage textures, remaining two maps, mobile performance pass.

-----

*KRAKEN GDD v1.3 — prepared for development handoff*
*Document filename: KRAKEN-GDD-v1.3.md*