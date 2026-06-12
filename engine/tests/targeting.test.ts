import { describe, expect, test } from 'vitest';
import { spawnDefenderAt } from '../src/game';
import { createGameFromFiles } from '../src/node';
import { applySystemDamage } from '../src/kraken';
import {
  canKrakenFireAtUnit,
  canKrakenFireAtCommandPost,
  canMissileTargetHex,
  validKrakenTargets,
  planKrakenMove,
} from '../src/targeting';
import { offsetToAxial } from '../src/hex';

const at = offsetToAxial;

describe('valid-target computation mirrors resolver rules', () => {
  test('unit in range + sensor + LOS is a valid main battery target', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(36, 14)); // 5 hexes, open
    expect(canKrakenFireAtUnit(g, 'mainBattery', u.id)).toBe(true);
    expect(validKrakenTargets(g, 'mainBattery').unitIds).toContain(u.id);
  });

  test('AP guns (range 3) cannot reach a unit 5 hexes out', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(36, 14));
    expect(canKrakenFireAtUnit(g, 'antiPersonnel1', u.id)).toBe(false);
  });

  test('a dark weapon has no valid targets', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(39, 14));
    applySystemDamage(g.kraken, 'mainBattery', 'kill');
    expect(canKrakenFireAtUnit(g, 'mainBattery', u.id)).toBe(false);
    expect(validKrakenTargets(g, 'mainBattery').unitIds).toHaveLength(0);
  });

  test('sensor damage blinds the long guns: target beyond shrunken sensors is invalid', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    const u = spawnDefenderAt(g, 'heavyTank', 'f1', at(36, 14)); // 5 hexes
    applySystemDamage(g.kraken, 'sensorArray', 'damage');
    applySystemDamage(g.kraken, 'sensorArray', 'damage'); // sensors red: range 4
    expect(canKrakenFireAtUnit(g, 'mainBattery', u.id)).toBe(false);
  });

  test('command post targeting needs range + LOS only', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    expect(canKrakenFireAtCommandPost(g, 'mainBattery')).toBe(false); // across the map
    g.krakenPosition = at(9, 14);
    expect(canKrakenFireAtCommandPost(g, 'mainBattery')).toBe(true);
  });

  test('missiles can target hexes within 12, LOS not required', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    expect(canMissileTargetHex(g, 'missileRack1', at(32, 20))).toBe(true); // 12 away
    expect(canMissileTargetHex(g, 'missileRack1', at(20, 14))).toBe(false); // too far
    expect(canMissileTargetHex(g, 'mainBattery' as never, at(40, 14))).toBe(false); // not a missile
  });
});

describe('planKrakenMove — A* path preview for the UI', () => {
  test('returns the full path and how far this turn reaches', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    const plan = planKrakenMove(g, at(35, 14));
    expect(plan).not.toBeNull();
    expect(plan!.path.length).toBeGreaterThan(3);
    // speed 3: at least 3 hexes reachable (more if A* takes the cheap road)
    expect(plan!.reachableIndex).toBeGreaterThanOrEqual(3);
    expect(plan!.reachableIndex).toBeLessThan(plan!.path.length);
  });

  test('returns null for an unreachable destination (mountain)', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 3 });
    expect(planKrakenMove(g, at(15, 5))).toBeNull();
  });
});
