# KRAKEN

*One machine. One objective. Stop it if you can.*

Asymmetric tactical wargame — one player drives the Kraken, a vast
cybernetic war machine, toward the Command Post; everyone else tries to
strip its systems before it gets there. Design reference:
[docs/KRAKEN-GDD-v1.3.md](docs/KRAKEN-GDD-v1.3.md).

## Status — Phase 0 complete

Headless, fully unit-tested engine core (GDD §19). No graphics, no
networking — those are Phases 1–3.

- Hex grid (axial), A* with terrain costs and unit exceptions
- Line of sight per GDD §6.2
- Kraken systems & degradation model, repair printers, smoke
- WeGo turn resolver: orders → movement → combat → artillery → repair → status
- Artillery with 1-turn flight, aimed/spotted/blind scatter, friendly fire
- Win conditions incl. the 85-turn (30-minute) timeout
- Deterministic seeded RNG + full JSON event log (replayable)

Every stat lives in [engine/data/units.json](engine/data/units.json);
maps are data-driven JSON ([engine/data/maps/map01.json](engine/data/maps/map01.json)).
Judgement calls beyond the GDD: [docs/DECISIONS.md](docs/DECISIONS.md).

## Commands

```bash
npm install
npm test               # full unit + integration suite
npm run sim            # watch a random-orders game in the terminal
npm run sim -- --seed 42 --log game.json   # replayable, with event log dump
npm run typecheck
```

Requires Node 20+.
