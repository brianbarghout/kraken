import { describe, expect, test } from 'vitest';
import { SoloController } from '../src/game/controller';
import { loadMap, loadUnitData } from '../../engine/src/node';
import { offsetToAxial } from '../../engine/src/hex';

const at = offsetToAxial;

function makeController(seed = 9, mapId = 'map01-small') {
  return new SoloController({ map: loadMap(mapId), data: loadUnitData(), seed });
}

describe('SoloController — order assembly', () => {
  test('starts on turn 0 with a fresh solo game and empty pending orders', () => {
    const c = makeController();
    expect(c.state.turn).toBe(0);
    expect(c.state.defenders.length).toBeGreaterThan(10);
    expect(c.pending.moveTo).toBeNull();
    expect(c.pending.fires).toHaveLength(0);
  });

  test('setMoveTarget stores a path plan for legal destinations and clears for illegal', () => {
    const c = makeController();
    const ok = c.setMoveTarget(at(18, 7)); // open ground near spawn
    expect(ok).toBe(true);
    expect(c.movePlan).not.toBeNull();
    expect(c.pending.moveTo).toEqual(at(18, 7));

    const bad = c.setMoveTarget(at(8, 3)); // mountain
    expect(bad).toBe(false);
    expect(c.movePlan).toBeNull();
    expect(c.pending.moveTo).toBeNull();
  });

  test('queueFire accepts only engine-valid targets, one order per weapon', () => {
    const c = makeController();
    // nothing in range at spawn: firing at a far defender is rejected
    const far = c.state.defenders[0]!;
    expect(c.queueFire({ weapon: 'mainBattery', targetUnitId: far.id })).toBe(false);
    // missiles at a nearby hex are valid
    expect(c.queueFire({ weapon: 'missileRack1', targetHex: at(15, 7) })).toBe(true);
    expect(c.queueFire({ weapon: 'missileRack1', targetHex: at(14, 7) })).toBe(true); // replaces
    expect(c.pending.fires).toHaveLength(1);
    expect(c.pending.fires[0]!.targetHex).toEqual(at(14, 7));
  });

  test('endTurn resolves with AI opposition and clears pending orders', () => {
    const c = makeController();
    c.setMoveTarget(at(16, 7));
    const events = c.endTurn();
    expect(c.state.turn).toBe(1);
    expect(events.some((e) => e.type === 'krakenMoved')).toBe(true);
    // the AI did something too
    expect(events.some((e) => e.type === 'unitMoved' || e.type === 'attackResolved')).toBe(true);
    expect(c.pending.moveTo).toBeNull();
    expect(c.pending.fires).toHaveLength(0);
  });

  test('repair order is validated and survives into the resolved turn', () => {
    const c = makeController();
    expect(c.setRepair('sensorArray')).toBe(false); // green system — invalid
    c.state.kraken.systems.sensorArray = 'dark';
    expect(c.setRepair('sensorArray')).toBe(true);
    c.endTurn();
    expect(c.state.kraken.repair).not.toBeNull();
  });

  test('a passive Kraken loses eventually; summary data is available', () => {
    const c = makeController(31);
    while (!c.state.outcome) c.endTurn();
    expect(c.state.outcome!.winner).toBe('defenders');
    const s = c.summary();
    expect(s.winner).toBe('defenders');
    expect(s.turns).toBe(c.state.turn);
    expect(Array.isArray(s.damageLog)).toBe(true);
    expect(Array.isArray(s.killFeed)).toBe(true);
  });

  test('fireCheck surfaces the exact failed check for the UI', () => {
    const c = makeController();
    const far = c.state.defenders[0]!; // across the map
    expect(c.fireCheck({ weapon: 'mainBattery', targetUnitId: far.id })).toContain('range');
    expect(c.fireCheck({ weapon: 'mainBattery', targetCommandPost: true })).toContain('range');
    expect(c.fireCheck({ weapon: 'missileRack1', targetHex: at(15, 7) })).toBeNull();
  });

  test('turnsRemaining counts down from the 85-turn limit', () => {
    const c = makeController();
    expect(c.turnsRemaining).toBe(85);
    c.endTurn();
    expect(c.turnsRemaining).toBe(84);
  });
});
