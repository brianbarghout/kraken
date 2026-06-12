import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseUnitData } from '../src/data';
import { parseMap } from '../src/map';
import { createGame } from '../src/game';
import { resolveTurn } from '../src/turn';

// The browser app imports JSON via the bundler and must be able to build a
// game with zero node:fs involvement. These tests exercise that path.

const rawUnits = JSON.parse(readFileSync(join(__dirname, '../data/units.json'), 'utf-8'));
const rawMap = JSON.parse(readFileSync(join(__dirname, '../data/maps/map01.json'), 'utf-8'));

describe('pure parsers (browser path)', () => {
  test('parseUnitData returns the same data as the Node loader', () => {
    const data = parseUnitData(rawUnits);
    expect(data.game.turnLimit).toBe(85);
    expect(data.defenders.heavyTank.attack).toBe(4);
  });

  test('parseMap converts offsets to axial like the Node loader', () => {
    const map = parseMap(rawMap);
    expect(map.id).toBe('map01');
    expect(map.width).toBe(44);
    expect(map.height).toBe(30);
    expect(map.defenderSpawns.length).toBeGreaterThan(0);
  });

  test('createGame accepts injected map + data and plays a turn without fs', () => {
    const g = createGame({ seed: 5, map: parseMap(rawMap), data: parseUnitData(rawUnits) });
    resolveTurn(g, { defenders: [], kraken: { moveTo: g.map.commandPost } });
    expect(g.turn).toBe(1);
  });
});
