import { describe, expect, test } from 'vitest';
import { spawnDefenderAt } from '../src/game';
import { createGameFromFiles } from '../src/node';
import { applySystemDamage } from '../src/kraken';
import { krakenVisibleHexKeys, detectedDefenders } from '../src/visibility';
import { hexKey, offsetToAxial } from '../src/hex';

const at = offsetToAxial;

describe('Kraken fog of war (GDD §7)', () => {
  test('visible set contains own hex and nearby open ground, bounded by sensor range', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 1 });
    const visible = krakenVisibleHexKeys(g);
    expect(visible.has(hexKey(g.krakenPosition))).toBe(true);
    expect(visible.has(hexKey(at(38, 14)))).toBe(true); // 3 hexes, open
    expect(visible.has(hexKey(at(20, 14)))).toBe(false); // 17 hexes — beyond sensors
  });

  test('terrain blocks vision inside sensor range (mountains/forest)', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 1 });
    g.krakenPosition = at(20, 20); // west of it: mountain wall cols 14-17
    const visible = krakenVisibleHexKeys(g);
    expect(visible.has(hexKey(at(12, 20)))).toBe(false); // behind the wall
    expect(visible.has(hexKey(at(24, 20)))).toBe(true); // open approach is visible
  });

  test('sensor damage visibly shrinks the bubble', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 1 });
    const before = krakenVisibleHexKeys(g).size;
    applySystemDamage(g.kraken, 'sensorArray', 'damage'); // 10 -> 7
    const amber = krakenVisibleHexKeys(g).size;
    applySystemDamage(g.kraken, 'sensorArray', 'damage'); // 7 -> 4
    const red = krakenVisibleHexKeys(g).size;
    expect(amber).toBeLessThan(before);
    expect(red).toBeLessThan(amber);
  });

  test('defenders are detected only inside the visible set', () => {
    const g = createGameFromFiles({ mapId: 'map01', seed: 1 });
    const near = spawnDefenderAt(g, 'heavyTank', 'f1', at(38, 14)); // 3 hexes, open
    const far = spawnDefenderAt(g, 'heavyTank', 'f1', at(10, 14)); // across the map
    const detected = detectedDefenders(g).map((u) => u.id);
    expect(detected).toContain(near.id);
    expect(detected).not.toContain(far.id);
  });
});
