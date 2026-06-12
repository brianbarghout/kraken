import { describe, expect, test } from 'vitest';
import { loadUnitData } from '../src/data';

const data = loadUnitData();

describe('units.json — defender stats match GDD §8.5', () => {
  test('heavy tank', () => {
    const t = data.defenders.heavyTank;
    expect(t.speed).toBe(2);
    expect(t.attack).toBe(4);
    expect(t.range).toBe(4);
    expect(t.armour).toBe(3);
    expect(t.special.mainBatteryGlanceSurvivalChance).toBe(0.5);
  });

  test('light tank', () => {
    const t = data.defenders.lightTank;
    expect(t.speed).toBe(3);
    expect(t.attack).toBe(3);
    expect(t.range).toBe(3);
    expect(t.armour).toBe(2);
    expect(t.special.hillClimbMultiplier).toBe(1.5);
    expect(t.special.autoDamageVsTreads).toBe(true);
  });

  test('GEV', () => {
    const t = data.defenders.gev;
    expect(t.speed).toBe(5);
    expect(t.attack).toBe(2);
    expect(t.range).toBe(3);
    expect(t.armour).toBe(1);
    expect(t.special.ignoresTerrain).toEqual(['river', 'swamp']);
    expect(t.special.shootAndScoot).toBe(true);
  });

  test('artillery SPG', () => {
    const t = data.defenders.artillery;
    expect(t.speed).toBe(2);
    expect(t.attack).toBe(6);
    expect(t.range).toBe(9);
    expect(t.armour).toBe(1);
    expect(t.special.speedOnFiringTurn).toBe(1);
    expect(t.special.ridgeRange).toBe(11);
    expect(t.special.indirect).toBe(true);
  });

  test('scout bike', () => {
    const t = data.defenders.scoutBike;
    expect(t.speed).toBe(6);
    expect(t.attack).toBe(0);
    expect(t.armour).toBe(0);
    expect(t.special.revealRadius).toBe(4);
  });
});

describe('units.json — Kraken stats match GDD §8.5', () => {
  test('movement and sensors', () => {
    expect(data.kraken.speed).toBe(3);
    expect(data.kraken.sensorRangeByState.green).toBe(10);
    // degraded sensor ranges shrink (exact values are engine decisions)
    expect(data.kraken.sensorRangeByState.amber).toBeLessThan(10);
    expect(data.kraken.sensorRangeByState.red).toBeLessThan(data.kraken.sensorRangeByState.amber);
    expect(data.kraken.sensorRangeByState.dark).toBeLessThan(data.kraken.sensorRangeByState.red);
  });

  test('weapons table', () => {
    expect(data.kraken.weapons.mainBattery).toMatchObject({ count: 1, attack: 6, range: 8 });
    expect(data.kraken.weapons.secondary).toMatchObject({ count: 2, attack: 3, range: 5 });
    expect(data.kraken.weapons.antiPersonnel).toMatchObject({ count: 2, attack: 2, range: 3 });
    expect(data.kraken.weapons.missileRack).toMatchObject({
      count: 2,
      attack: 5,
      range: 12,
      indirect: true,
    });
  });

  test('per-system armour', () => {
    expect(data.kraken.systemArmour.tread).toBe(2);
    expect(data.kraken.systemArmour.weapon).toBe(3);
    expect(data.kraken.systemArmour.sensorArray).toBe(2);
    expect(data.kraken.systemArmour.smokeDispensers).toBe(2);
    expect(data.kraken.systemArmour.repairPrinters).toBe(4);
  });

  test('repair times are in turns and ordered per GDD §5.4', () => {
    const r = data.kraken.repair.turnsBySystem;
    // smoke fastest, then sensors, then weapons, treads slowest
    expect(r.smokeDispensers).toBeLessThan(r.sensorArray);
    expect(r.sensorArray).toBeLessThan(r.weapon);
    expect(r.weapon).toBeLessThan(r.tread);
    expect(data.kraken.repair.maxSpeedWhileRepairing).toBe(1);
  });
});

describe('units.json — combat and game constants', () => {
  test('combat resolution thresholds per GDD §8.5', () => {
    expect(data.combat.killMultiplier).toBe(2);
    expect(data.combat.damageRollChance).toBe(0.5);
  });

  test('artillery scatter per GDD §13.3', () => {
    expect(data.artilleryFire.scatter.aimed).toBe(0);
    expect(data.artilleryFire.scatter.spotted).toBe(1);
    expect(data.artilleryFire.scatter.blind).toBe(2);
    expect(data.artilleryFire.landingDelayTurns).toBe(1);
  });

  test('game clock: 85 turns for the 30-minute session', () => {
    expect(data.game.turnLimit).toBe(85);
  });

  test('command post: armour 3, immune to kill results (D13 amendment)', () => {
    expect(data.commandPost.armour).toBe(3);
    expect(data.commandPost.immuneToKill).toBe(true);
  });
});
