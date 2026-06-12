/**
 * Map loading + terrain movement costs (GDD §6.2/§6.3). Maps are
 * data-driven JSON: odd-r offset rows of single-char terrain codes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefenderType, TerrainId } from './data';
import { Axial, axialToOffset, offsetToAxial } from './hex';

export type LosKind = 'clear' | 'blocks' | 'fullyBlocks' | 'partial' | 'extendsFromTop';
export type CoverKind = 'none' | 'partial' | 'good' | 'full';

export interface TerrainDef {
  move: number;
  losKind: LosKind;
  cover: CoverKind;
  elevation: number;
  krakenImpassable?: boolean;
}

export interface GameMap {
  id: string;
  name: string;
  legend: Record<string, TerrainId>;
  terrain: Record<TerrainId, TerrainDef>;
  rows: string[];
  width: number;
  height: number;
  commandPost: Axial;
  krakenSpawn: Axial;
  defenderSpawns: Axial[];
}

interface RawMap {
  id: string;
  name: string;
  legend: Record<string, TerrainId>;
  terrain: Record<TerrainId, TerrainDef>;
  rows: string[];
  commandPost: { col: number; row: number };
  krakenSpawn: { col: number; row: number };
  defenderSpawns: { col: number; row: number }[];
}

const here = dirname(fileURLToPath(import.meta.url));

export function loadMap(id: string): GameMap {
  const raw = JSON.parse(
    readFileSync(join(here, '..', 'data', 'maps', `${id}.json`), 'utf-8'),
  ) as RawMap;
  return {
    id: raw.id,
    name: raw.name,
    legend: raw.legend,
    terrain: raw.terrain,
    rows: raw.rows,
    width: raw.rows[0]?.length ?? 0,
    height: raw.rows.length,
    commandPost: offsetToAxial(raw.commandPost.col, raw.commandPost.row),
    krakenSpawn: offsetToAxial(raw.krakenSpawn.col, raw.krakenSpawn.row),
    defenderSpawns: raw.defenderSpawns.map((s) => offsetToAxial(s.col, s.row)),
  };
}

export function inBounds(map: Pick<GameMap, 'rows'>, hex: Axial): boolean {
  const { col, row } = axialToOffset(hex);
  return row >= 0 && row < map.rows.length && col >= 0 && col < (map.rows[row]?.length ?? 0);
}

export function terrainAt(
  map: Pick<GameMap, 'rows' | 'legend' | 'terrain'>,
  hex: Axial,
): TerrainDef & { id: TerrainId } {
  const { col, row } = axialToOffset(hex);
  const ch = map.rows[row]?.[col];
  if (ch === undefined) throw new Error(`hex out of bounds: ${hex.q},${hex.r}`);
  const id = map.legend[ch];
  if (id === undefined) throw new Error(`no legend entry for '${ch}'`);
  return { id, ...map.terrain[id] };
}

export type MoverKind = DefenderType | 'kraken';

/**
 * MP cost of one step from an adjacent hex, honouring GDD §6.2 unit
 * exceptions: GEVs ignore river/swamp; light tanks climb hills at 1.5x;
 * hills cost applies when climbing, 1x when traversing at equal/higher
 * elevation; mountains are impassable to the Kraken.
 */
export function stepCostFor(
  map: Pick<GameMap, 'rows' | 'legend' | 'terrain'>,
  mover: MoverKind,
  from: Axial,
  to: Axial,
): number | null {
  const target = terrainAt(map, to);
  const source = terrainAt(map, from);

  if (target.id === 'mountain' && mover === 'kraken') return null;

  if (mover === 'gev' && (target.id === 'river' || target.id === 'swamp')) {
    return 1;
  }

  if (target.id === 'hills') {
    if (target.elevation > source.elevation) {
      // climbing
      if (mover === 'lightTank') return 1.5;
      return target.move;
    }
    return 1; // traversing the ridge or descending onto it
  }

  return target.move;
}
