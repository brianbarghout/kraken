import { describe, expect, test } from 'vitest';
import { spawnDefenderAt, GameState } from '../src/game';
import { createGameFromFiles } from '../src/node';
import { resolveTurn, checkOutcome } from '../src/turn';
import { applySystemDamage, WEAPON_SYSTEMS } from '../src/kraken';
import { axial, hexDistance, offsetToAxial } from '../src/hex';

const at = offsetToAxial;

function newGame(seed = 42): GameState {
  return createGameFromFiles({ mapId: 'map01', seed });
}

describe('WeGo phase order (GDD §8.1)', () => {
  test('events carry phases in the canonical order within a turn', () => {
    const g = newGame();
    spawnDefenderAt(g, 'heavyTank', 'f1', at(36, 12));
    resolveTurn(g, {
      defenders: [{ unitId: 'u1', moveTo: at(37, 12) }],
      kraken: { moveTo: at(40, 14) },
    });
    const phases = g.events.filter((e) => e.turn === 1).map((e) => e.phase);
    const order = ['orders', 'movement', 'combat', 'artillery', 'repair', 'status'];
    let last = -1;
    for (const p of phases) {
      const idx = order.indexOf(p);
      expect(idx, `unknown phase ${p}`).toBeGreaterThanOrEqual(0);
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });
});

describe('movement phase', () => {
  test('a heavy tank (2 MP) moves 2 hexes along a road (0.75 each)', () => {
    const g = newGame();
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(7, 15));
    resolveTurn(g, { defenders: [{ unitId: u.id, moveTo: at(3, 15) }], kraken: {} });
    expect(u.position).toEqual(at(5, 15));
  });

  test('GEV crosses river at 1 MP per hex (hovercraft)', () => {
    const g = newGame();
    const u = spawnDefenderAt(g, 'gev', 'f1', at(35, 1));
    resolveTurn(g, { defenders: [{ unitId: u.id, moveTo: at(32, 1) }], kraken: {} });
    expect(u.position).toEqual(at(32, 1));
  });

  test('minimum-move rule: heavy tank can enter a river hex even though 2.5 > 2 MP', () => {
    const g = newGame();
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(35, 1));
    resolveTurn(g, { defenders: [{ unitId: u.id, moveTo: at(34, 1) }], kraken: {} });
    expect(u.position).toEqual(at(34, 1));
  });

  test('units cannot enter an occupied hex (GDD §8.3: no collision)', () => {
    const g = newGame();
    const blocker = spawnDefenderAt(g, 'heavyTank', 'f1', at(20, 12));
    const mover = spawnDefenderAt(g, 'gev', 'f2', at(22, 12));
    resolveTurn(g, { defenders: [{ unitId: mover.id, moveTo: at(20, 12) }], kraken: {} });
    expect(mover.position).not.toEqual(blocker.position);
  });

  test('an order onto an occupied hex still advances the unit, stopping short', () => {
    const g = newGame();
    const blocker = spawnDefenderAt(g, 'heavyTank', 'f1', at(20, 12));
    const mover = spawnDefenderAt(g, 'gev', 'f2', at(25, 12));
    resolveTurn(g, { defenders: [{ unitId: mover.id, moveTo: at(20, 12) }], kraken: {} });
    expect(mover.position).not.toEqual(blocker.position);
    expect(hexDistance(mover.position, blocker.position)).toBeLessThan(5); // moved closer
    expect(g.events.some((e) => e.type === 'unitMoved' && e.unitId === mover.id)).toBe(true);
  });

  test('the Kraken moves at most its current speed in MP', () => {
    const g = newGame();
    const start = g.krakenPosition;
    resolveTurn(g, { defenders: [], kraken: { moveTo: at(35, 14) } });
    // speed 3 over open ground -> exactly 3 hexes closer
    expect(hexDistance(start, g.krakenPosition)).toBe(3);
  });

  test('tread damage slows the Kraken on the map', () => {
    const g = newGame();
    applySystemDamage(g.kraken, 'treadLeft', 'damage'); // speed 2
    const start = g.krakenPosition;
    resolveTurn(g, { defenders: [], kraken: { moveTo: at(35, 14) } });
    expect(hexDistance(start, g.krakenPosition)).toBe(2);
  });
});

describe('combat phase — direct fire', () => {
  test('heavy tank in range with LOS damages a targeted Kraken system', () => {
    const g = newGame(7);
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(38, 14)); // 3 hexes from spawn (41,14)
    resolveTurn(g, {
      defenders: [{ unitId: u.id, fireAtSystem: 'treadLeft' }],
      kraken: {},
    });
    // attack 4 vs tread armour 2 -> kill (>= 2x)
    expect(g.kraken.systems.treadLeft).toBe('dark');
    const hit = g.events.find((e) => e.type === 'attackResolved' && e.attackerId === u.id);
    expect(hit).toBeDefined();
    expect(hit!.result).toBe('kill');
  });

  test('fire beyond weapon range is rejected', () => {
    const g = newGame();
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(30, 14)); // 11 hexes away, range 4
    resolveTurn(g, { defenders: [{ unitId: u.id, fireAtSystem: 'treadLeft' }], kraken: {} });
    expect(g.kraken.systems.treadLeft).toBe('green');
    expect(g.events.some((e) => e.type === 'orderRejected')).toBe(true);
  });

  test('Kraken main battery fire at a defender; light tank dies with no glance roll', () => {
    const g = newGame(11);
    const u = spawnDefenderAt(g, 'lightTank', 'f1', at(38, 14));
    resolveTurn(g, {
      defenders: [],
      kraken: { fires: [{ weapon: 'mainBattery', targetUnitId: u.id }] },
    });
    expect(u.state).toBe('dead');
  });

  test('light tank auto-damages treads on any hit (no 50/50)', () => {
    // attack 3 vs tread armour 2 is the damage-roll bracket; special makes it certain
    for (let seed = 0; seed < 10; seed++) {
      const g = newGame(seed);
      const u = spawnDefenderAt(g, 'lightTank', 'f1', at(39, 14));
      resolveTurn(g, { defenders: [{ unitId: u.id, fireAtSystem: 'treadRight' }], kraken: {} });
      expect(g.kraken.systems.treadRight).toBe('amber');
    }
  });

  test('GEV shoot-and-scoot: fires, then moves after combat', () => {
    const g = newGame(13);
    const u = spawnDefenderAt(g, 'gev', 'f1', at(39, 14)); // 2 hexes from Kraken
    resolveTurn(g, {
      defenders: [{ unitId: u.id, fireAtSystem: 'treadLeft', scootTo: at(39, 10) }],
      kraken: {},
    });
    const fired = g.events.some((e) => e.type === 'attackResolved' && e.attackerId === u.id);
    expect(fired).toBe(true);
    expect(u.position).not.toEqual(at(39, 14)); // scooted away
  });
});

describe('artillery (GDD §8.2)', () => {
  test('shells land one turn after firing', () => {
    const g = newGame(17);
    const u = spawnDefenderAt(g, 'artillery', 'f1', at(38, 10));
    const target = at(38, 14);
    resolveTurn(g, { defenders: [{ unitId: u.id, bombard: target }], kraken: {} });
    expect(g.events.some((e) => e.type === 'shellFired' && e.turn === 1)).toBe(true);
    expect(g.events.some((e) => e.type === 'shellLanded')).toBe(false);
    resolveTurn(g, { defenders: [], kraken: {} });
    expect(g.events.some((e) => e.type === 'shellLanded' && e.turn === 2)).toBe(true);
  });

  test('aimed fire (LOS) has scatter 0; the shell lands on target', () => {
    const g = newGame(19);
    const u = spawnDefenderAt(g, 'artillery', 'f1', at(38, 10));
    const target = at(38, 14);
    resolveTurn(g, { defenders: [{ unitId: u.id, bombard: target }], kraken: {} });
    const fired = g.events.find((e) => e.type === 'shellFired')!;
    expect(fired.scatter).toBe(0);
    resolveTurn(g, { defenders: [], kraken: {} });
    const landed = g.events.find((e) => e.type === 'shellLanded')!;
    expect(landed.impact).toEqual(target);
  });

  test('blind fire (no LOS) has 2-hex scatter; spotted fire (scout near target) has 1', () => {
    // mountains at cols 14-17 rows 18+ block LOS along row 20
    const g = newGame(23);
    const arty = spawnDefenderAt(g, 'artillery', 'f1', at(10, 20));
    const target = at(18, 20);
    resolveTurn(g, { defenders: [{ unitId: arty.id, bombard: target }], kraken: {} });
    expect(g.events.find((e) => e.type === 'shellFired')!.scatter).toBe(2);

    const g2 = newGame(23);
    const arty2 = spawnDefenderAt(g2, 'artillery', 'f1', at(10, 20));
    spawnDefenderAt(g2, 'scoutBike', 'f2', at(19, 20)); // within 4 of target
    resolveTurn(g2, { defenders: [{ unitId: arty2.id, bombard: target }], kraken: {} });
    expect(g2.events.find((e) => e.type === 'shellFired')!.scatter).toBe(1);
  });

  test('artillery on hills reaches ridge range (11), beyond base range 9', () => {
    const g = newGame(29);
    const arty = spawnDefenderAt(g, 'artillery', 'f1', at(25, 11)); // ridge hills
    const target = at(34, 16);
    expect(hexDistance(at(25, 11), target)).toBeGreaterThan(9);
    expect(hexDistance(at(25, 11), target)).toBeLessThanOrEqual(11);
    resolveTurn(g, { defenders: [{ unitId: arty.id, bombard: target }], kraken: {} });
    expect(g.events.some((e) => e.type === 'shellFired')).toBe(true);
  });

  test('friendly fire: a friendly unit in the blast radius takes damage (GDD §8.3)', () => {
    const g = newGame(31);
    const arty = spawnDefenderAt(g, 'artillery', 'f1', at(38, 10));
    const friend = spawnDefenderAt(g, 'scoutBike', 'f2', at(38, 14)); // armour 0, on the target hex
    resolveTurn(g, { defenders: [{ unitId: arty.id, bombard: at(38, 14) }], kraken: {} });
    resolveTurn(g, { defenders: [], kraken: {} });
    expect(friend.state).toBe('dead');
  });

  test('artillery blast against the Kraken damages a random targetable system', () => {
    const g = newGame(37);
    const arty = spawnDefenderAt(g, 'artillery', 'f1', at(38, 10));
    resolveTurn(g, { defenders: [{ unitId: arty.id, bombard: g.krakenPosition }], kraken: {} });
    resolveTurn(g, { defenders: [], kraken: {} });
    // attack 6 vs any system armour (2-4) is at least a damage roll, vs armour <= 3 a kill
    const blast = g.events.find((e) => e.type === 'blastHit' && e.target === 'kraken');
    expect(blast).toBeDefined();
    expect(Object.values(g.kraken.systems).some((s) => s !== 'green')).toBe(true);
  });

  test('Kraken missiles use the indirect pipeline: blind fire at a hex, lands next turn', () => {
    const g = newGame(41);
    spawnDefenderAt(g, 'artillery', 'f1', at(32, 20)); // far away, range 12 exactly
    resolveTurn(g, {
      defenders: [],
      kraken: { fires: [{ weapon: 'missileRack1', targetHex: at(32, 20) }] },
    });
    expect(g.events.some((e) => e.type === 'shellFired' && e.attackerId === 'kraken')).toBe(true);
    resolveTurn(g, { defenders: [], kraken: {} });
    expect(g.events.some((e) => e.type === 'shellLanded' && e.turn === 2)).toBe(true);
  });
});

describe('smoke (GDD §5.2)', () => {
  test('deploying smoke adds scatter to shells landing in the cloud', () => {
    const g = newGame(43);
    const arty = spawnDefenderAt(g, 'artillery', 'f1', at(38, 10));
    // aimed shot at the Kraken hex; Kraken pops smoke and holds position
    resolveTurn(g, {
      defenders: [{ unitId: arty.id, bombard: g.krakenPosition }],
      kraken: { deploySmoke: true },
    });
    expect(g.events.some((e) => e.type === 'smokeDeployed')).toBe(true);
    resolveTurn(g, { defenders: [], kraken: {} });
    const landed = g.events.find((e) => e.type === 'shellLanded')!;
    expect(landed.scatter).toBe(1); // 0 aimed + 1 smoke penalty
  });
});

describe('repair flow in the turn cycle (GDD §5.4)', () => {
  test('repair order starts a job, progresses each repair phase, completes to amber', () => {
    const g = newGame(47);
    applySystemDamage(g.kraken, 'sensorArray', 'kill');
    const turns = g.data.kraken.repair.turnsBySystem.sensorArray;
    resolveTurn(g, { defenders: [], kraken: { repair: 'sensorArray' } });
    expect(g.events.some((e) => e.type === 'repairStarted')).toBe(true);
    for (let i = 1; i < turns; i++) {
      resolveTurn(g, { defenders: [], kraken: {} });
    }
    expect(g.kraken.systems.sensorArray).toBe('amber');
    expect(g.events.some((e) => e.type === 'repairCompleted')).toBe(true);
  });

  test('the Kraken cannot sprint while repairing (speed capped at 1)', () => {
    const g = newGame(53);
    applySystemDamage(g.kraken, 'sensorArray', 'kill');
    const start = g.krakenPosition;
    resolveTurn(g, {
      defenders: [],
      kraken: { moveTo: at(35, 14), repair: 'sensorArray' },
    });
    expect(hexDistance(start, g.krakenPosition)).toBeLessThanOrEqual(1);
  });
});

describe('win conditions (GDD §3)', () => {
  test('the CP is immune to kill results: each successful hit steps green -> amber -> red -> destroyed', () => {
    const g = newGame(59);
    g.krakenPosition = at(9, 14); // within main battery range 8 of the CP with LOS
    const fire = {
      defenders: [],
      kraken: { fires: [{ weapon: 'mainBattery' as const, targetCommandPost: true }] },
    };
    // main battery 6 vs armour 3 is the kill bracket — every hit lands, but only one step each
    resolveTurn(g, fire);
    expect(g.commandPost.state).toBe('amber');
    expect(g.outcome).toBeNull();
    resolveTurn(g, fire);
    expect(g.commandPost.state).toBe('red');
    expect(g.outcome).toBeNull();
    resolveTurn(g, fire);
    expect(g.commandPost.state).toBe('destroyed');
    expect(g.outcome).toEqual({ winner: 'kraken', reason: 'commandPostDestroyed' });
  });

  test('defenders win when the Kraken is fully destroyed', () => {
    const g = newGame(61);
    for (const w of WEAPON_SYSTEMS) applySystemDamage(g.kraken, w, 'kill');
    applySystemDamage(g.kraken, 'treadLeft', 'kill');
    applySystemDamage(g.kraken, 'treadRight', 'damage');
    applySystemDamage(g.kraken, 'treadRight', 'damage'); // red — one good hit left
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(39, 14));
    resolveTurn(g, { defenders: [{ unitId: u.id, fireAtSystem: 'treadRight' }], kraken: {} });
    expect(g.outcome).toEqual({ winner: 'defenders', reason: 'krakenDestroyed' });
  });

  test('timeout: defenders win when the turn limit expires with both alive', () => {
    const g = newGame(67);
    for (let i = 0; i < g.data.game.turnLimit; i++) {
      resolveTurn(g, { defenders: [], kraken: {} });
    }
    expect(g.outcome).toEqual({ winner: 'defenders', reason: 'timeout' });
    expect(() => resolveTurn(g, { defenders: [], kraken: {} })).toThrow();
  });

  test('draw when both are destroyed simultaneously', () => {
    const g = newGame(71);
    for (const w of WEAPON_SYSTEMS) applySystemDamage(g.kraken, w, 'kill');
    applySystemDamage(g.kraken, 'treadLeft', 'kill');
    applySystemDamage(g.kraken, 'treadRight', 'kill');
    g.commandPost.state = 'destroyed';
    expect(checkOutcome(g)).toEqual({ winner: 'draw', reason: 'mutualDestruction' });
  });
});

describe('determinism & event log (GDD §13.8)', () => {
  function playScript(seed: number): string {
    const g = createGameFromFiles({ mapId: 'map01', seed });
    const tank = spawnDefenderAt(g, 'heavyTank', 'f1', at(38, 12));
    const arty = spawnDefenderAt(g, 'artillery', 'f2', at(38, 10));
    resolveTurn(g, {
      defenders: [
        { unitId: tank.id, moveTo: at(39, 13) },
        { unitId: arty.id, bombard: at(41, 14) },
      ],
      kraken: { moveTo: at(35, 14), fires: [{ weapon: 'mainBattery', targetUnitId: tank.id }] },
    });
    resolveTurn(g, {
      defenders: [{ unitId: tank.id, fireAtSystem: 'treadLeft' }],
      kraken: { deploySmoke: true },
    });
    resolveTurn(g, { defenders: [], kraken: { moveTo: at(30, 14) } });
    return JSON.stringify(g.events);
  }

  test('same seed + same orders => identical event logs (replayable)', () => {
    expect(playScript(12345)).toBe(playScript(12345));
  });

  test('every event is JSON-serialisable and stamped with turn and phase', () => {
    const g = newGame(73);
    spawnDefenderAt(g, 'heavyTank', 'f1', at(38, 12));
    resolveTurn(g, { defenders: [{ unitId: 'u1', fireAtSystem: 'treadLeft' }], kraken: {} });
    for (const e of g.events) {
      expect(typeof e.type).toBe('string');
      expect(typeof e.turn).toBe('number');
      expect(typeof e.phase).toBe('string');
      expect(() => JSON.stringify(e)).not.toThrow();
    }
  });
});
