/**
 * Game state, orders and the JSON event log (GDD §13.8: every event
 * logged from day one — a game is replayable from seed + orders).
 */
import { DefenderType, UnitData } from './data';
import { Axial } from './hex';
import { createKraken, KrakenState, KrakenSystemId, KrakenWeaponId } from './kraken';
import { GameMap } from './map';
import { createRng, Rng } from './rng';
import { createDefender, DefenderUnit } from './units';

export type TurnPhase = 'orders' | 'movement' | 'combat' | 'artillery' | 'repair' | 'status';

export interface GameEvent {
  type: string;
  turn: number;
  phase: TurnPhase;
  [key: string]: unknown;
}

export interface Shell {
  attackerId: string; // unit id or 'kraken'
  weapon?: KrakenWeaponId;
  target: Axial;
  attack: number;
  scatter: number;
  landsTurn: number;
}

export interface SmokeCloud {
  hexes: Axial[];
  expiresTurn: number;
}

export type CommandPostState = 'green' | 'amber' | 'red' | 'destroyed';

export interface Outcome {
  winner: 'defenders' | 'kraken' | 'draw';
  reason: 'krakenDestroyed' | 'commandPostDestroyed' | 'timeout' | 'mutualDestruction';
}

export interface GameState {
  map: GameMap;
  data: UnitData;
  rng: Rng;
  seed: number;
  turn: number;
  kraken: KrakenState;
  krakenPosition: Axial;
  defenders: DefenderUnit[];
  commandPost: { state: CommandPostState };
  shells: Shell[];
  smokeClouds: SmokeCloud[];
  events: GameEvent[];
  outcome: Outcome | null;
  nextUnitId: number;
}

export interface DefenderOrder {
  unitId: string;
  moveTo?: Axial;
  /** direct fire at a Kraken system (tanks, GEVs) */
  fireAtSystem?: KrakenSystemId;
  /** artillery parabolic fire at a hex (aimed / spotted / blind) */
  bombard?: Axial;
  /** GEV only: move after firing (shoot-and-scoot) */
  scootTo?: Axial;
}

export interface KrakenFireOrder {
  weapon: KrakenWeaponId;
  targetUnitId?: string;
  /** missiles only: indirect fire at a hex */
  targetHex?: Axial;
  targetCommandPost?: boolean;
}

export interface KrakenOrder {
  moveTo?: Axial;
  fires?: KrakenFireOrder[];
  repair?: KrakenSystemId;
  deploySmoke?: boolean;
}

export interface TurnOrders {
  defenders: DefenderOrder[];
  kraken: KrakenOrder;
}

export interface CreateGameOptions {
  seed: number;
  /** parsed map + unit data — browser-safe; Node callers can use createGameFromFiles */
  map: GameMap;
  data: UnitData;
}

export function createGame(opts: CreateGameOptions): GameState {
  const { map, data } = opts;
  const state: GameState = {
    map,
    data,
    rng: createRng(opts.seed),
    seed: opts.seed,
    turn: 0,
    kraken: createKraken(),
    krakenPosition: map.krakenSpawn,
    defenders: [],
    commandPost: { state: 'green' },
    shells: [],
    smokeClouds: [],
    events: [],
    outcome: null,
    nextUnitId: 1,
  };
  state.events.push({
    type: 'gameCreated',
    turn: 0,
    phase: 'status',
    mapId: map.id,
    seed: opts.seed,
  });
  return state;
}

export function spawnDefenderAt(
  state: GameState,
  type: DefenderType,
  fleetId: string,
  position: Axial,
): DefenderUnit {
  const unit = createDefender(`u${state.nextUnitId++}`, type, fleetId, position);
  state.defenders.push(unit);
  state.events.push({
    type: 'unitSpawned',
    turn: state.turn,
    phase: 'status',
    unitId: unit.id,
    unitType: type,
    fleetId,
    position,
  });
  return unit;
}

export function livingDefenders(state: GameState): DefenderUnit[] {
  return state.defenders.filter((u) => u.state !== 'dead');
}
