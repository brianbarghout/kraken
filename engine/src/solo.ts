/**
 * Solo mode setup (GDD §18.1): human Kraken vs Tier 1 AI fleets.
 * Default opposing force per the Phase 1 brief — one fleet of each type,
 * sized within the GDD §4.2 fleet ranges.
 */
import { DefenderType, UnitData } from './data';
import { CreateGameOptions, createGame, GameState, spawnDefenderAt } from './game';
import { Axial, hexKey, hexNeighbors } from './hex';
import { GameMap, inBounds, terrainAt } from './map';

export interface SoloForce {
  gev: number;
  heavyTank: number;
  lightTank: number;
  artillery: number;
  scoutBike: number;
}

export const DEFAULT_SOLO_FORCE: SoloForce = {
  gev: 3,
  heavyTank: 2,
  lightTank: 3,
  artillery: 2,
  scoutBike: 4,
};

const FLEET_NAMES: Record<keyof SoloForce, string> = {
  gev: 'gev-squadron',
  heavyTank: 'tank-platoon',
  lightTank: 'light-tank-troop',
  artillery: 'artillery-battery',
  scoutBike: 'scout-section',
};

export function createSoloGame(
  opts: CreateGameOptions & { force?: SoloForce },
): GameState {
  const state = createGame(opts);
  const force = opts.force ?? DEFAULT_SOLO_FORCE;
  const taken = new Set<string>();
  const spawnQueue = [...state.map.defenderSpawns];

  const nextFreeHex = (): Axial => {
    while (spawnQueue.length > 0) {
      const hex = spawnQueue.shift()!;
      if (!taken.has(hexKey(hex)) && isSpawnable(state.map, hex)) return hex;
    }
    // more units than listed spawns: spill onto free neighbours of taken spawns
    for (const spawn of state.map.defenderSpawns) {
      for (const n of hexNeighbors(spawn)) {
        if (inBounds(state.map, n) && !taken.has(hexKey(n)) && isSpawnable(state.map, n)) {
          return n;
        }
      }
    }
    throw new Error('no free spawn hexes left');
  };

  for (const type of Object.keys(force) as (keyof SoloForce)[]) {
    for (let i = 0; i < force[type]; i++) {
      const hex = nextFreeHex();
      taken.add(hexKey(hex));
      spawnDefenderAt(state, type as DefenderType, FLEET_NAMES[type], hex);
    }
  }
  return state;
}

function isSpawnable(map: GameMap, hex: Axial): boolean {
  const t = terrainAt(map, hex);
  return t.id !== 'mountain' && t.id !== 'river';
}
