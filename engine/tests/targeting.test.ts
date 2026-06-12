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
  weaponEnvelope,
} from '../src/targeting';
import { hexKey, offsetToAxial } from '../src/hex';

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

describe('weaponEnvelope — per-hex targeting picture for the UI', () => {
  test('direct weapon: open hexes valid, mountain-shadowed hexes losBlocked', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 41 });
    g.krakenPosition = at(20, 20); // mountains at cols 14-17 block westward
    const env = weaponEnvelope(g, 'mainBattery'); // range 8
    expect(env.get(hexKey(at(24, 20)))).toBe('valid'); // open, dist 4
    expect(env.get(hexKey(at(13, 20)))).toBe('losBlocked'); // behind the wall, dist 7
    expect(env.has(hexKey(at(30, 20)))).toBe(false); // dist 10 — outside range
  });

  test('hexes beyond damaged sensors are outOfSensors', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 43 });
    applySystemDamage(g.kraken, 'sensorArray', 'damage');
    applySystemDamage(g.kraken, 'sensorArray', 'damage'); // red: sensor range 4
    const env = weaponEnvelope(g, 'mainBattery'); // weapon range 8 > sensors 4
    expect(env.get(hexKey(at(38, 14)))).toBe('valid'); // dist 3
    expect(env.get(hexKey(at(35, 14)))).toBe('outOfSensors'); // dist 6, open
  });

  test('missiles ignore LOS and sensors — everything in range is valid', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 47 });
    applySystemDamage(g.kraken, 'sensorArray', 'kill');
    const env = weaponEnvelope(g, 'missileRack1'); // range 12
    expect(env.get(hexKey(at(30, 14)))).toBe('valid'); // dist 11, far beyond dark sensors
    expect(env.has(hexKey(at(28, 14)))).toBe(false); // dist 13 — outside range
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
