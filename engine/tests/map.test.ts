import { describe, expect, test } from 'vitest';
import { loadMap, terrainAt, stepCostFor, inBounds } from '../src/map';
import { axial, hexDistance, offsetToAxial, aStar } from '../src/hex';

const map = loadMap('map01');

describe('map01 structure', () => {
  test('all rows have equal width and only legend characters', () => {
    expect(map.rows.length).toBeGreaterThanOrEqual(20);
    const width = map.rows[0]!.length;
    for (const row of map.rows) {
      expect(row.length).toBe(width);
      for (const ch of row) {
        expect(map.legend[ch], `legend missing for '${ch}'`).toBeDefined();
      }
    }
  });

  test('every legend terrain id has a terrain definition', () => {
    for (const id of Object.values(map.legend)) {
      expect(map.terrain[id], `terrain def missing for '${id}'`).toBeDefined();
    }
  });

  test('command post and Kraken spawn are in bounds, on passable ground, far apart', () => {
    expect(inBounds(map, map.commandPost)).toBe(true);
    expect(inBounds(map, map.krakenSpawn)).toBe(true);
    expect(terrainAt(map, map.commandPost).losKind).not.toBe('fullyBlocks');
    // Kraken spawns at the opposite end from the CP (GDD §6.3)
    expect(hexDistance(map.commandPost, map.krakenSpawn)).toBeGreaterThan(30);
  });

  test('defender spawn hexes exist, are in bounds and not on mountains', () => {
    expect(map.defenderSpawns.length).toBeGreaterThanOrEqual(8);
    for (const s of map.defenderSpawns) {
      expect(inBounds(map, s)).toBe(true);
      expect(terrainAt(map, s).id).not.toBe('mountain');
    }
  });

  test('contains the GDD §6.3 designed features: ridge, forest corridor, choke, open ground', () => {
    const counts: Record<string, number> = {};
    for (const row of map.rows) {
      for (const ch of row) {
        const id = map.legend[ch]!;
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    expect(counts['hills']).toBeGreaterThanOrEqual(20); // ridge lines
    expect(counts['forest']).toBeGreaterThanOrEqual(40); // forest corridor
    expect(counts['mountain']).toBeGreaterThanOrEqual(10); // choke point walls
    expect(counts['open']).toBeGreaterThanOrEqual(300); // open kill zone
    expect(counts['river']).toBeGreaterThanOrEqual(15);
    expect(counts['road']).toBeGreaterThanOrEqual(20);
    expect(counts['swamp']).toBeGreaterThanOrEqual(5);
    expect(counts['rubble']).toBeGreaterThanOrEqual(5);
  });
});

describe('terrain movement costs (GDD §6.2)', () => {
  // build a tiny synthetic map to control terrain precisely
  const tiny = {
    ...map,
    rows: ['..fh', 'wsmb', 'r...'],
    legend: map.legend,
  };

  const at = (col: number, row: number) => offsetToAxial(col, row);

  test('base multipliers: open 1, road 0.75, forest 3, rubble 2', () => {
    expect(stepCostFor(tiny, 'heavyTank', at(1, 0), at(0, 0))).toBe(1);
    expect(stepCostFor(tiny, 'heavyTank', at(1, 2), at(0, 2))).toBe(0.75);
    expect(stepCostFor(tiny, 'heavyTank', at(1, 0), at(2, 0))).toBe(3);
    expect(stepCostFor(tiny, 'heavyTank', at(2, 1), at(3, 1))).toBe(2);
  });

  test('river 2.5 and swamp 4 — but GEV ignores both (hovercraft)', () => {
    expect(stepCostFor(tiny, 'heavyTank', at(1, 1), at(0, 1))).toBe(2.5);
    expect(stepCostFor(tiny, 'heavyTank', at(0, 1), at(1, 1))).toBe(4);
    expect(stepCostFor(tiny, 'gev', at(1, 1), at(0, 1))).toBe(1);
    expect(stepCostFor(tiny, 'gev', at(0, 1), at(1, 1))).toBe(1);
  });

  test('hills cost 2 climbing, 1.5 for light tanks, 1 moving hill-to-hill', () => {
    expect(stepCostFor(tiny, 'heavyTank', at(2, 0), at(3, 0))).toBe(2);
    expect(stepCostFor(tiny, 'lightTank', at(2, 0), at(3, 0))).toBe(1.5);
  });

  test('descending from hills into open costs the open rate (1x)', () => {
    expect(stepCostFor(tiny, 'heavyTank', at(3, 0), at(2, 0))).toBe(3); // into forest = forest cost
    expect(stepCostFor(tiny, 'artillery', at(3, 0), at(3, 1))).toBe(2); // into rubble = rubble cost
  });

  test('mountain is impassable to the Kraken, 4x for defenders', () => {
    expect(stepCostFor(tiny, 'kraken', at(1, 1), at(2, 1))).toBeNull();
    expect(stepCostFor(tiny, 'heavyTank', at(1, 1), at(2, 1))).toBe(4);
  });

  test('A* across the real map: Kraken can reach the CP from its spawn', () => {
    const result = aStar(
      map.krakenSpawn,
      map.commandPost,
      (from, to) => (inBounds(map, to) ? stepCostFor(map, 'kraken', from, to) : null),
      80,
    );
    expect(result).not.toBeNull();
    expect(result!.cost).toBeGreaterThan(20);
  });
});
