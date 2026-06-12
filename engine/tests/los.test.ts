import { describe, expect, test } from 'vitest';
import { hasLineOfSight } from '../src/los';
import { loadMap } from '../src/map';
import { offsetToAxial } from '../src/hex';

const base = loadMap('map01');

/** Single-row synthetic map: offset row 0 is a straight axial line. */
function rowMap(row: string) {
  return { ...base, rows: [row] };
}

const at = (col: number) => offsetToAxial(col, 0);

describe('hasLineOfSight (GDD §6.2)', () => {
  test('clear open ground: visible', () => {
    const m = rowMap('......');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(true);
  });

  test('adjacent hexes are always visible', () => {
    const m = rowMap('fm');
    expect(hasLineOfSight(m, at(0), at(1))).toBe(true);
  });

  test('forest between two ground units blocks', () => {
    const m = rowMap('..f...');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(false);
  });

  test('a unit standing in forest can still be seen (only intervening hexes block)', () => {
    const m = rowMap('....f');
    expect(hasLineOfSight(m, at(0), at(4))).toBe(true);
  });

  test('observer on hills sees over forest — extended LOS from the top', () => {
    const m = rowMap('h..f...');
    expect(hasLineOfSight(m, at(0), at(6))).toBe(true);
  });

  test('target on hills is visible over forest (symmetry)', () => {
    const m = rowMap('...f..h');
    expect(hasLineOfSight(m, at(0), at(6))).toBe(true);
  });

  test('hills between two ground units block', () => {
    const m = rowMap('...h..');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(false);
  });

  test('observer on hills sees over an intervening hill', () => {
    const m = rowMap('h..h..');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(true);
  });

  test('mountain fully blocks, even hill-to-hill', () => {
    const ground = rowMap('..m...');
    expect(hasLineOfSight(ground, at(0), at(5))).toBe(false);
    const hills = rowMap('h.m..h');
    expect(hasLineOfSight(hills, at(0), at(5))).toBe(false);
  });

  test('rubble is partial: one intervening rubble hex does not block', () => {
    const m = rowMap('..b...');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(true);
  });

  test('rubble is partial: two intervening rubble hexes block ground-level sight', () => {
    const m = rowMap('.b.b..');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(false);
  });

  test('elevated observer sees over accumulated rubble', () => {
    const m = rowMap('hb.b..');
    expect(hasLineOfSight(m, at(0), at(5))).toBe(true);
  });
});
