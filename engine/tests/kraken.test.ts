import { beforeEach, describe, expect, test } from 'vitest';
import { loadUnitData } from '../src/node';
import {
  createKraken,
  KrakenState,
  applySystemDamage,
  krakenSpeed,
  krakenSensorRange,
  weaponAttack,
  armourOfSystem,
  startRepair,
  tickRepair,
  isKrakenDestroyed,
  targetableSystems,
  WEAPON_SYSTEMS,
} from '../src/kraken';

const data = loadUnitData();
let k: KrakenState;

beforeEach(() => {
  k = createKraken();
});

describe('initial state', () => {
  test('all systems green, full speed, full sensors', () => {
    expect(Object.values(k.systems).every((s) => s === 'green')).toBe(true);
    expect(krakenSpeed(k, data)).toBe(3);
    expect(krakenSensorRange(k, data)).toBe(10);
    expect(k.printersRevealed).toBe(false);
  });
});

describe('damage state ladder (GDD §5.2/§5.3)', () => {
  test('damage steps green → amber → red → dark', () => {
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(k.systems.mainBattery).toBe('amber');
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(k.systems.mainBattery).toBe('red');
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(k.systems.mainBattery).toBe('dark');
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(k.systems.mainBattery).toBe('dark'); // stays dark
  });

  test('kill result destroys a system outright', () => {
    applySystemDamage(k, 'treadLeft', 'kill');
    expect(k.systems.treadLeft).toBe('dark');
  });
});

describe('degradation effects', () => {
  test('weapon attack degrades with state (floor of multiplier)', () => {
    expect(weaponAttack(k, data, 'mainBattery')).toBe(6);
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(weaponAttack(k, data, 'mainBattery')).toBe(4); // floor(6 * 0.75)
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(weaponAttack(k, data, 'mainBattery')).toBe(3); // floor(6 * 0.5)
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(weaponAttack(k, data, 'mainBattery')).toBe(0); // dark
  });

  test('tread damage reduces speed (GDD §5.2)', () => {
    expect(krakenSpeed(k, data)).toBe(3);
    applySystemDamage(k, 'treadLeft', 'damage'); // amber: 1 + 1.5 = 2.5 -> 2
    expect(krakenSpeed(k, data)).toBe(2);
    applySystemDamage(k, 'treadRight', 'damage'); // amber+amber: 2
    expect(krakenSpeed(k, data)).toBe(2);
    applySystemDamage(k, 'treadLeft', 'damage');
    applySystemDamage(k, 'treadRight', 'damage'); // red+red: 1
    expect(krakenSpeed(k, data)).toBe(1);
  });

  test('asymmetric tread damage causes turning impairment (-1) but never immobilises alone', () => {
    applySystemDamage(k, 'treadLeft', 'kill'); // dark + green: 1.5 -> 1, asym -> but min 1
    expect(krakenSpeed(k, data)).toBe(1);
  });

  test('both treads dark immobilises the Kraken', () => {
    applySystemDamage(k, 'treadLeft', 'kill');
    applySystemDamage(k, 'treadRight', 'kill');
    expect(krakenSpeed(k, data)).toBe(0);
  });

  test('sensor damage shrinks detection range (GDD §5.2/§7.2)', () => {
    applySystemDamage(k, 'sensorArray', 'damage');
    expect(krakenSensorRange(k, data)).toBe(7);
    applySystemDamage(k, 'sensorArray', 'damage');
    expect(krakenSensorRange(k, data)).toBe(4);
    applySystemDamage(k, 'sensorArray', 'damage');
    expect(krakenSensorRange(k, data)).toBe(2);
  });

  test('per-system armour from units.json (GDD §8.5)', () => {
    expect(armourOfSystem(data, 'treadLeft')).toBe(2);
    expect(armourOfSystem(data, 'mainBattery')).toBe(3);
    expect(armourOfSystem(data, 'sensorArray')).toBe(2);
    expect(armourOfSystem(data, 'repairPrinters')).toBe(4);
  });
});

describe('repair mechanic (GDD §5.4)', () => {
  test('repairing a dark system restores it to amber (75% cap), after the configured turns', () => {
    applySystemDamage(k, 'sensorArray', 'kill');
    startRepair(k, data, 'sensorArray');
    const turns = data.kraken.repair.turnsBySystem.sensorArray;
    for (let i = 0; i < turns - 1; i++) {
      tickRepair(k, data);
      expect(k.systems.sensorArray).toBe('dark'); // not done yet
    }
    tickRepair(k, data);
    expect(k.systems.sensorArray).toBe('amber'); // never green — 75% cap
    expect(k.repair).toBeNull();
  });

  test('only one system repairs at a time', () => {
    applySystemDamage(k, 'sensorArray', 'kill');
    applySystemDamage(k, 'mainBattery', 'kill');
    startRepair(k, data, 'sensorArray');
    expect(() => startRepair(k, data, 'mainBattery')).toThrow();
  });

  test('cannot repair past the cap (amber system is not a valid target)', () => {
    applySystemDamage(k, 'mainBattery', 'damage');
    expect(() => startRepair(k, data, 'mainBattery')).toThrow();
  });

  test('no repair when printers are dark', () => {
    applySystemDamage(k, 'repairPrinters', 'kill');
    applySystemDamage(k, 'sensorArray', 'kill');
    expect(() => startRepair(k, data, 'sensorArray')).toThrow();
  });

  test('repairing reveals the printers (GDD §13.5)', () => {
    expect(targetableSystems(k)).not.toContain('repairPrinters');
    applySystemDamage(k, 'sensorArray', 'kill');
    startRepair(k, data, 'sensorArray');
    expect(k.printersRevealed).toBe(true);
    expect(targetableSystems(k)).toContain('repairPrinters');
  });

  test('repair caps speed at 1 (GDD §5.4: cannot sprint)', () => {
    applySystemDamage(k, 'sensorArray', 'kill');
    startRepair(k, data, 'sensorArray');
    expect(krakenSpeed(k, data)).toBe(1);
  });

  test('damage to the repairing system resets progress', () => {
    applySystemDamage(k, 'sensorArray', 'kill');
    startRepair(k, data, 'sensorArray');
    tickRepair(k, data);
    tickRepair(k, data);
    expect(k.repair!.progress).toBe(2);
    applySystemDamage(k, 'sensorArray', 'damage');
    expect(k.repair!.progress).toBe(0);
  });
});

describe('destruction (GDD §3: Kraken fully destroyed)', () => {
  test('destroyed when all weapons and both treads are dark', () => {
    for (const w of WEAPON_SYSTEMS) applySystemDamage(k, w, 'kill');
    expect(isKrakenDestroyed(k)).toBe(false); // still mobile
    applySystemDamage(k, 'treadLeft', 'kill');
    applySystemDamage(k, 'treadRight', 'kill');
    expect(isKrakenDestroyed(k)).toBe(true);
  });

  test('dark systems are no longer targetable', () => {
    applySystemDamage(k, 'mainBattery', 'kill');
    expect(targetableSystems(k)).not.toContain('mainBattery');
  });
});
