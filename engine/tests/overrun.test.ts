import { describe, expect, test } from 'vitest';
import { spawnDefenderAt, GameState } from '../src/game';
import { createGameFromFiles } from '../src/node';
import { resolveTurn } from '../src/turn';
import { planKrakenMove } from '../src/targeting';
import { hexEquals, offsetToAxial } from '../src/hex';

const at = offsetToAxial;

function newGame(seed = 42): GameState {
  return createGameFromFiles({ mapId: 'map01', seed });
}

describe('overrun (Phase 1.2 P3 — GDD addition, D41)', () => {
  test('soft target (scout) is crushed outright; the Kraken rolls on through', () => {
    const g = newGame(3);
    const scout = spawnDefenderAt(g, 'scoutBike', 'f1', at(40, 14)); // directly in the path
    resolveTurn(g, { defenders: [], kraken: { moveTo: at(38, 14) } });
    expect(scout.state).toBe('dead');
    expect(g.krakenPosition).toEqual(at(38, 14)); // full move, cost unchanged
    const ev = g.events.find((e) => e.type === 'overrun');
    expect(ev).toBeDefined();
    expect(ev!.unitId).toBe(scout.id);
    expect(ev!.result).toBe('killed');
  });

  test('GEVs are soft targets too', () => {
    const g = newGame(5);
    const gev = spawnDefenderAt(g, 'gev', 'f1', at(40, 14));
    resolveTurn(g, { defenders: [], kraken: { moveTo: at(38, 14) } });
    expect(gev.state).toBe('dead');
    expect(g.events.some((e) => e.type === 'overrun' && e.result === 'killed')).toBe(true);
  });

  test('hard target (green tank): 50/50 damaged-or-repelled, Kraken never enters while it lives', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const g = newGame(seed);
      const tank = spawnDefenderAt(g, 'heavyTank', 'f1', at(40, 14));
      resolveTurn(g, { defenders: [], kraken: { moveTo: at(38, 14) } });
      const ev = g.events.find((e) => e.type === 'overrun');
      expect(ev).toBeDefined();
      outcomes.add(ev!.result as string);
      expect(tank.state === 'green' || tank.state === 'amber').toBe(true);
      // grinding stopped the advance — the Kraken holds short of the tank's hex
      expect(hexEquals(g.krakenPosition, at(40, 14))).toBe(false);
      expect(g.krakenPosition).toEqual(at(41, 14));
      expect(ev!.result === 'damaged' ? tank.state === 'amber' : tank.state === 'green').toBe(true);
    }
    expect(outcomes).toEqual(new Set(['damaged', 'repelled']));
  });

  test('a damaged tank overrun again is destroyed and the Kraken passes through', () => {
    const g = newGame(7);
    const tank = spawnDefenderAt(g, 'lightTank', 'f1', at(40, 14));
    tank.state = 'amber';
    resolveTurn(g, { defenders: [], kraken: { moveTo: at(38, 14) } });
    expect(tank.state).toBe('dead');
    expect(g.events.find((e) => e.type === 'overrun')!.result).toBe('killed');
    expect(g.krakenPosition).toEqual(at(38, 14));
  });

  test('each tank overrun risks a tread: ~1 in 3 across seeds', () => {
    let treadHits = 0;
    const runs = 60;
    for (let seed = 100; seed < 100 + runs; seed++) {
      const g = newGame(seed);
      spawnDefenderAt(g, 'heavyTank', 'f1', at(40, 14));
      resolveTurn(g, { defenders: [], kraken: { moveTo: at(38, 14) } });
      if (
        g.events.some(
          (e) =>
            e.type === 'systemStateChanged' &&
            (e.system === 'treadLeft' || e.system === 'treadRight'),
        )
      ) {
        treadHits++;
      }
    }
    expect(treadHits / runs).toBeGreaterThan(0.15);
    expect(treadHits / runs).toBeLessThan(0.55);
  });

  test('soft overruns never risk the treads', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = newGame(seed);
      spawnDefenderAt(g, 'scoutBike', 'f1', at(40, 14));
      resolveTurn(g, { defenders: [], kraken: { moveTo: at(38, 14) } });
      expect(g.events.some((e) => e.type === 'systemStateChanged')).toBe(false);
    }
  });

  test('the CP hex is never enterable, even by the Kraken', () => {
    const g = newGame(11);
    g.krakenPosition = at(6, 14);
    resolveTurn(g, { defenders: [], kraken: { moveTo: g.map.commandPost } });
    expect(hexEquals(g.krakenPosition, g.map.commandPost)).toBe(false);
  });

  test('defenders cannot overrun: a unit ordered through an occupied hex goes around or stops', () => {
    const g = newGame(13);
    spawnDefenderAt(g, 'heavyTank', 'f1', at(20, 12)); // blocker
    const gev = spawnDefenderAt(g, 'gev', 'f2', at(22, 12));
    resolveTurn(g, { defenders: [{ unitId: gev.id, moveTo: at(20, 12) }], kraken: {} });
    expect(g.events.some((e) => e.type === 'overrun')).toBe(false);
    expect(g.defenders.every((u) => u.state !== 'dead')).toBe(true);
  });

  test('planKrakenMove reports overrun hexes for the path preview', () => {
    const g = newGame(17);
    const tank = spawnDefenderAt(g, 'heavyTank', 'f1', at(39, 14));
    const plan = planKrakenMove(g, at(37, 14));
    expect(plan).not.toBeNull();
    expect(plan!.overruns.some((h) => hexEquals(h, at(39, 14)))).toBe(true);
    // defenders never get overrun previews
    expect(tank.state).toBe('green');
  });
});
