import { describe, expect, test } from 'vitest';
import {
  axial,
  hexKey,
  parseHexKey,
  hexEquals,
  hexNeighbors,
  hexDistance,
  hexLine,
  hexRange,
  offsetToAxial,
  aStar,
} from '../src/hex';

describe('coordinates', () => {
  test('hexKey and parseHexKey round-trip', () => {
    const h = axial(-3, 7);
    expect(parseHexKey(hexKey(h))).toEqual(h);
  });

  test('offsetToAxial converts odd-r offset coordinates', () => {
    // row 0 is unshifted
    expect(offsetToAxial(0, 0)).toEqual(axial(0, 0));
    expect(offsetToAxial(4, 0)).toEqual(axial(4, 0));
    // odd rows shift: col 4, row 3 -> q = 4 - (3-1)/2 = 3
    expect(offsetToAxial(4, 3)).toEqual(axial(3, 3));
    // even rows: col 4, row 2 -> q = 4 - (2-0)/2 = 3
    expect(offsetToAxial(4, 2)).toEqual(axial(3, 2));
  });
});

describe('hexNeighbors', () => {
  test('returns exactly six distinct neighbours at distance 1', () => {
    const h = axial(2, -1);
    const ns = hexNeighbors(h);
    expect(ns).toHaveLength(6);
    const keys = new Set(ns.map(hexKey));
    expect(keys.size).toBe(6);
    for (const n of ns) {
      expect(hexDistance(h, n)).toBe(1);
    }
  });
});

describe('hexDistance', () => {
  test('distance to self is 0', () => {
    expect(hexDistance(axial(3, 3), axial(3, 3))).toBe(0);
  });

  test('matches known axial distances', () => {
    expect(hexDistance(axial(0, 0), axial(3, 0))).toBe(3);
    expect(hexDistance(axial(0, 0), axial(0, -4))).toBe(4);
    expect(hexDistance(axial(0, 0), axial(2, -5))).toBe(5);
    expect(hexDistance(axial(-2, 1), axial(3, -3))).toBe(5);
  });
});

describe('hexLine', () => {
  test('includes both endpoints and has distance+1 hexes', () => {
    const a = axial(0, 0);
    const b = axial(5, -2);
    const line = hexLine(a, b);
    expect(line[0]).toEqual(a);
    expect(line[line.length - 1]).toEqual(b);
    expect(line).toHaveLength(hexDistance(a, b) + 1);
  });

  test('consecutive hexes on the line are adjacent', () => {
    const line = hexLine(axial(-3, 1), axial(4, -4));
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1]!, line[i]!)).toBe(1);
    }
  });
});

describe('hexRange', () => {
  test('radius 0 is just the centre', () => {
    expect(hexRange(axial(1, 1), 0)).toEqual([axial(1, 1)]);
  });

  test('radius 1 has 7 hexes, radius 2 has 19', () => {
    expect(hexRange(axial(0, 0), 1)).toHaveLength(7);
    expect(hexRange(axial(0, 0), 2)).toHaveLength(19);
  });
});

describe('aStar', () => {
  const uniform = () => 1;

  test('finds a straight path on uniform cost', () => {
    const result = aStar(axial(0, 0), axial(4, 0), uniform);
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(4);
    expect(result!.path[0]).toEqual(axial(0, 0));
    expect(result!.path[result!.path.length - 1]).toEqual(axial(4, 0));
  });

  test('routes around impassable hexes', () => {
    // wall of impassable hexes at q=2 except r=3
    const cost = (_from: ReturnType<typeof axial>, to: ReturnType<typeof axial>) => {
      if (to.q === 2 && to.r !== 3) return null;
      return 1;
    };
    const result = aStar(axial(0, 0), axial(4, 0), cost);
    expect(result).not.toBeNull();
    // must pass through the gap at (2,3)
    expect(result!.path.some((h) => h.q === 2 && h.r === 3)).toBe(true);
  });

  test('prefers cheap terrain over short expensive terrain', () => {
    // hexes with r === 0 cost 3 (forest), everything else costs 1
    const cost = (_from: ReturnType<typeof axial>, to: ReturnType<typeof axial>) =>
      to.r === 0 ? 3 : 1;
    const result = aStar(axial(0, 0), axial(4, 0), cost);
    expect(result).not.toBeNull();
    // direct path along r=0 would cost 12; detour is cheaper
    expect(result!.cost).toBeLessThan(12);
    expect(result!.path.slice(1, -1).every((h) => h.r !== 0)).toBe(true);
  });

  test('returns null when the goal is unreachable', () => {
    const cost = (_f: ReturnType<typeof axial>, to: ReturnType<typeof axial>) => {
      if (hexDistance(axial(4, 4), to) <= 1 && !hexEquals(to, axial(4, 4))) return null;
      return 1;
    };
    expect(aStar(axial(0, 0), axial(4, 4), cost)).toBeNull();
  });

  test('returns empty-step path when start equals goal', () => {
    const result = aStar(axial(2, 2), axial(2, 2), uniform);
    expect(result).not.toBeNull();
    expect(result!.path).toEqual([axial(2, 2)]);
    expect(result!.cost).toBe(0);
  });
});
