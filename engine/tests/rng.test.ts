import { describe, expect, test } from 'vitest';
import { createRng } from '../src/rng';

describe('createRng', () => {
  test('same seed produces identical sequences', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  test('different seeds produce different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  test('next returns values in [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('int returns integers within inclusive bounds and hits both ends', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(0, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  test('pick returns elements from the array', () => {
    const rng = createRng(42);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  test('chance(1) always true, chance(0) always false', () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) {
      expect(rng.chance(1)).toBe(true);
      expect(rng.chance(0)).toBe(false);
    }
  });

  test('exposes the seed it was created with', () => {
    expect(createRng(777).seed).toBe(777);
  });
});
