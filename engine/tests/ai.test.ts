import { describe, expect, test } from 'vitest';
import { createTier1AI } from '../src/ai';
import { createSoloGame, DEFAULT_SOLO_FORCE } from '../src/solo';
import { spawnDefenderAt } from '../src/game';
import { createGameFromFiles, loadMap, loadUnitData } from '../src/node';
import { resolveTurn } from '../src/turn';
import { hexDistance, offsetToAxial } from '../src/hex';
import { terrainAt } from '../src/map';

const at = offsetToAxial;

describe('Tier 1 AI (GDD §18.1 — exactly these behaviours)', () => {
  test('combat units out of range move toward the Kraken; the gap closes over turns', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 11 });
    const tank = spawnDefenderAt(g, 'heavyTank', 'tanks', at(20, 12));
    const ai = createTier1AI(11);
    const d0 = hexDistance(tank.position, g.krakenPosition);
    for (let i = 0; i < 4; i++) resolveTurn(g, { defenders: ai.ordersFor(g), kraken: {} });
    expect(hexDistance(tank.position, g.krakenPosition)).toBeLessThan(d0);
  });

  test('units fire when the Kraken is in weapon range with LOS', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 13 });
    const tank = spawnDefenderAt(g, 'heavyTank', 'tanks', at(38, 14)); // 3 hexes, range 4
    const ai = createTier1AI(13);
    const orders = ai.ordersFor(g);
    const order = orders.find((o) => o.unitId === tank.id)!;
    expect(order.fireAtSystem).toBeDefined();
    resolveTurn(g, { defenders: orders, kraken: {} });
    expect(g.events.some((e) => e.type === 'attackResolved' && e.attackerId === tank.id)).toBe(true);
  });

  test('artillery seeks the nearest high ground, then fires from it', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 17 });
    const arty = spawnDefenderAt(g, 'artillery', 'guns', at(20, 12)); // off-hill, ridge nearby
    const ai = createTier1AI(17);
    let turnsToHill = 0;
    for (let i = 0; i < 12 && terrainAt(g.map, arty.position).id !== 'hills'; i++) {
      resolveTurn(g, { defenders: ai.ordersFor(g), kraken: {} });
      turnsToHill++;
    }
    expect(terrainAt(g.map, arty.position).id).toBe('hills');
    // now in ridge range of the Kraken spawn area? march the Kraken into range and expect fire
    g.krakenPosition = at(28, 14); // well within ridge range 11 of the ridge
    const orders = ai.ordersFor(g);
    expect(orders.find((o) => o.unitId === arty.id)?.bombard).toBeDefined();
  });

  test('scouts advance to reveal range, then hold and report (no closer)', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 19 });
    const scout = spawnDefenderAt(g, 'scoutBike', 'scouts', at(30, 14));
    const ai = createTier1AI(19);
    for (let i = 0; i < 6; i++) resolveTurn(g, { defenders: ai.ordersFor(g), kraken: {} });
    const dist = hexDistance(scout.position, g.krakenPosition);
    expect(dist).toBeLessThanOrEqual(4);
    expect(dist).toBeGreaterThanOrEqual(2); // holds — does not ride into the AP guns
  });

  test('same seed, same state => identical orders (deterministic)', () => {
    const a = createGameFromFiles({ mapId: 'map01', seed: 23 });
    const b = createGameFromFiles({ mapId: 'map01', seed: 23 });
    for (const game of [a, b]) {
      spawnDefenderAt(game, 'heavyTank', 'tanks', at(38, 14));
      spawnDefenderAt(game, 'lightTank', 'lights', at(39, 12));
    }
    expect(JSON.stringify(createTier1AI(5).ordersFor(a))).toBe(
      JSON.stringify(createTier1AI(5).ordersFor(b)),
    );
  });
});

describe('solo game setup', () => {
  test('default force per the Phase 1 brief: GEVs, heavy + light tanks, artillery, scouts', () => {
    const g = createSoloGame({ map: loadMap('map01'), data: loadUnitData(), seed: 7 });
    const byType = (t: string) => g.defenders.filter((u) => u.type === t).length;
    expect(byType('gev')).toBe(DEFAULT_SOLO_FORCE.gev);
    expect(byType('heavyTank')).toBe(DEFAULT_SOLO_FORCE.heavyTank);
    expect(byType('lightTank')).toBe(DEFAULT_SOLO_FORCE.lightTank);
    expect(byType('artillery')).toBe(DEFAULT_SOLO_FORCE.artillery);
    expect(byType('scoutBike')).toBe(DEFAULT_SOLO_FORCE.scoutBike);
  });

  test('all units spawn on distinct legal hexes', () => {
    const g = createSoloGame({ map: loadMap('map01'), data: loadUnitData(), seed: 7 });
    const keys = new Set(g.defenders.map((u) => `${u.position.q},${u.position.r}`));
    expect(keys.size).toBe(g.defenders.length);
  });

  test('a full AI-vs-passive-Kraken solo game runs headless to an outcome', () => {
    const g = createSoloGame({ map: loadMap('map01-small'), data: loadUnitData(), seed: 31 });
    const ai = createTier1AI(31);
    while (!g.outcome) resolveTurn(g, { defenders: ai.ordersFor(g), kraken: {} });
    // passive Kraken: defenders either destroy it or win on timeout
    expect(g.outcome!.winner).toBe('defenders');
  });
});

describe('map01-small (50% reduced map, GDD §18.1)', () => {
  test('loads with valid structure and required features', () => {
    const m = loadMap('map01-small');
    expect(m.rows.every((r) => r.length === m.width)).toBe(true);
    const all = m.rows.join('');
    for (const ch of all) expect(m.legend[ch]).toBeDefined();
    expect(all).toContain('m'); // choke
    expect(all).toContain('h'); // ridge
    expect(all).toContain('f'); // forest
    expect(all).toContain('w'); // river
    expect(m.defenderSpawns.length).toBeGreaterThanOrEqual(6);
    expect(hexDistance(m.commandPost, m.krakenSpawn)).toBeGreaterThan(12);
  });
});
