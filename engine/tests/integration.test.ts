import { describe, expect, test } from 'vitest';
import { createGame, DefenderOrder, GameState, spawnDefenderAt } from '../src/game';
import { resolveTurn } from '../src/turn';
import { hexDistance, hexNeighbors, offsetToAxial } from '../src/hex';
import { hasLineOfSight } from '../src/los';
import { inBounds, stepCostFor } from '../src/map';
import { krakenSensorRange, weaponAttack } from '../src/kraken';
import { defenderAttack } from '../src/units';

const at = offsetToAxial;

describe('integration: full headless games', () => {
  test('an unopposed Kraken reaches and destroys the Command Post well inside 85 turns', () => {
    const g = createGame({ mapId: 'map01', seed: 1001 });
    const cp = g.map.commandPost;
    const approach = hexNeighbors(cp).find(
      (h) => inBounds(g.map, h) && stepCostFor(g.map, 'kraken', cp, h) !== null,
    )!;
    for (let t = 0; t < g.data.game.turnLimit && !g.outcome; t++) {
      const inRange =
        hexDistance(g.krakenPosition, cp) <= g.data.kraken.weapons.mainBattery.range &&
        hasLineOfSight(g.map, g.krakenPosition, cp);
      resolveTurn(g, {
        defenders: [],
        kraken: inRange
          ? { fires: [{ weapon: 'mainBattery', targetCommandPost: true }] }
          : { moveTo: approach },
      });
    }
    expect(g.outcome).toEqual({ winner: 'kraken', reason: 'commandPostDestroyed' });
    expect(g.turn).toBeLessThan(85);
  });

  /** Deterministic rule-based scripted battle, GDD Tier-1-AI flavoured. */
  function playFullBattle(seed: number): GameState {
    const g = createGame({ mapId: 'map01', seed });
    const spawns = g.map.defenderSpawns;
    const force = [
      ['heavyTank', 'tanks'],
      ['heavyTank', 'tanks'],
      ['lightTank', 'lights'],
      ['lightTank', 'lights'],
      ['lightTank', 'lights'],
      ['gev', 'gevs'],
      ['gev', 'gevs'],
      ['gev', 'gevs'],
      ['artillery', 'guns'],
      ['artillery', 'guns'],
      ['scoutBike', 'scouts'],
      ['scoutBike', 'scouts'],
    ] as const;
    force.forEach(([type, fleet], i) => spawnDefenderAt(g, type, fleet, spawns[i % spawns.length]!));

    const cp = g.map.commandPost;
    const approach = hexNeighbors(cp).find(
      (h) => inBounds(g.map, h) && stepCostFor(g.map, 'kraken', cp, h) !== null,
    )!;

    while (!g.outcome) {
      const defenders: DefenderOrder[] = [];
      for (const u of g.defenders) {
        const stats = g.data.defenders[u.type];
        const dist = hexDistance(u.position, g.krakenPosition);
        if (u.type === 'artillery') {
          if (dist <= stats.range) defenders.push({ unitId: u.id, bombard: g.krakenPosition });
          continue;
        }
        if (u.type === 'scoutBike') {
          if (dist > (stats.special.revealRadius ?? 4)) {
            defenders.push({ unitId: u.id, moveTo: nearKraken(g, u.position) });
          }
          continue;
        }
        if (
          dist <= stats.range &&
          defenderAttack(u, g.data) > 0 &&
          hasLineOfSight(g.map, u.position, g.krakenPosition)
        ) {
          defenders.push({ unitId: u.id, fireAtSystem: 'treadLeft' });
        } else {
          defenders.push({ unitId: u.id, moveTo: nearKraken(g, u.position) });
        }
      }

      // Kraken: shoot the nearest visible defender with the main battery, keep rolling
      const visible = g.defenders
        .filter(
          (u) =>
            hexDistance(g.krakenPosition, u.position) <=
              Math.min(
                g.data.kraken.weapons.mainBattery.range,
                krakenSensorRange(g.kraken, g.data),
              ) && hasLineOfSight(g.map, g.krakenPosition, u.position),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const cpInRange =
        hexDistance(g.krakenPosition, cp) <= g.data.kraken.weapons.mainBattery.range &&
        hasLineOfSight(g.map, g.krakenPosition, cp);
      resolveTurn(g, {
        defenders,
        kraken: {
          moveTo: approach,
          fires: cpInRange
            ? [{ weapon: 'mainBattery', targetCommandPost: true }]
            : weaponAttack(g.kraken, g.data, 'mainBattery') > 0 && visible.length > 0
              ? [{ weapon: 'mainBattery', targetUnitId: visible[0]!.id }]
              : [],
        },
      });
      if (g.turn > g.data.game.turnLimit) throw new Error('resolver failed to enforce timeout');
    }
    return g;
  }

  test('a full scripted battle always reaches a GDD §3 outcome within the 85-turn limit', () => {
    const g = playFullBattle(2024);
    expect(g.outcome).not.toBeNull();
    expect(['defenders', 'kraken', 'draw']).toContain(g.outcome!.winner);
    expect(g.turn).toBeLessThanOrEqual(g.data.game.turnLimit);
    // the log is substantial and fully JSON-serialisable (GDD §13.8)
    expect(g.events.length).toBeGreaterThan(100);
    expect(() => JSON.stringify(g.events)).not.toThrow();
  });

  test('the same seed replays to an identical event log (determinism end-to-end)', () => {
    const a = playFullBattle(777);
    const b = playFullBattle(777);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.outcome).toEqual(b.outcome);
  });
});

/** Pick a free hex adjacent to the Kraken as a pursuit destination. */
function nearKraken(g: GameState, from: ReturnType<typeof at>) {
  const options = hexNeighbors(g.krakenPosition)
    .filter((h) => inBounds(g.map, h))
    .filter((h) => !g.defenders.some((u) => u.state !== 'dead' && hexDistance(u.position, h) === 0))
    .sort((x, y) => hexDistance(from, x) - hexDistance(from, y));
  return options[0] ?? g.krakenPosition;
}
