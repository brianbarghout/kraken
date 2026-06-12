/**
 * Node-only file loaders (tests, CLI sim). The browser app imports JSON
 * through its bundler and uses the pure parsers + createGame directly.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUnitData, UnitData } from './data';
import { CreateGameOptions, createGame, GameState } from './game';
import { GameMap, parseMap } from './map';

const here = dirname(fileURLToPath(import.meta.url));

export function loadUnitData(): UnitData {
  return parseUnitData(JSON.parse(readFileSync(join(here, '..', 'data', 'units.json'), 'utf-8')));
}

export function loadMap(id: string): GameMap {
  return parseMap(
    JSON.parse(readFileSync(join(here, '..', 'data', 'maps', `${id}.json`), 'utf-8')),
  );
}

export function createGameFromFiles(
  opts: Omit<CreateGameOptions, 'map' | 'data'> & { mapId: string },
): GameState {
  return createGame({ ...opts, map: loadMap(opts.mapId), data: loadUnitData() });
}
