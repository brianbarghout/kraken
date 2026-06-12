/**
 * Line of sight — hex raycast honouring GDD §6.2:
 * forest blocks, mountain fully blocks, hills extend LOS from the top,
 * rubble is partial (accumulates).
 *
 * Model (see docs/DECISIONS.md): each intervening hex has an obstacle
 * height — terrain elevation, +1 if its losKind is 'blocks' (tree canopy),
 * Infinity if 'fullyBlocks'. Sight is blocked when an intervening hex's
 * obstacle height exceeds the higher of the two endpoint elevations.
 * 'partial' hexes never block alone; two or more block ground-level sight.
 */
import { Axial, hexLine } from './hex';
import { GameMap, terrainAt } from './map';

type LosMap = Pick<GameMap, 'rows' | 'legend' | 'terrain'>;

function obstacleHeight(map: LosMap, hex: Axial): number {
  const t = terrainAt(map, hex);
  if (t.losKind === 'fullyBlocks') return Infinity;
  if (t.losKind === 'blocks') return t.elevation + 1;
  return t.elevation;
}

export function hasLineOfSight(map: LosMap, from: Axial, to: Axial): boolean {
  const line = hexLine(from, to);
  if (line.length <= 2) return true; // self or adjacent

  const eyeLevel = Math.max(terrainAt(map, from).elevation, terrainAt(map, to).elevation);
  let partialCount = 0;

  for (const hex of line.slice(1, -1)) {
    const t = terrainAt(map, hex);
    if (obstacleHeight(map, hex) > eyeLevel) return false;
    if (t.losKind === 'partial') {
      partialCount++;
      if (partialCount >= 2 && eyeLevel === 0) return false;
    }
  }
  return true;
}
