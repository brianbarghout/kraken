/**
 * Single source of truth for "can the Kraken do X?" — used both by the
 * turn resolver (to reject orders) and the UI (to highlight valid targets
 * and preview movement). Check functions return a rejection reason or
 * null when the action is legal.
 */
import { GameState } from './game';
import { aStar, Axial, hexDistance, hexEquals, hexKey, hexRange } from './hex';
import {
  krakenSensorRange,
  krakenSpeed,
  KrakenWeaponId,
  weaponAttack,
  weaponRange,
} from './kraken';
import { hasLineOfSight } from './los';
import { inBounds, MoverKind, stepCostFor } from './map';

/**
 * Hexes the mover may not enter. The Kraken overruns defender-occupied
 * hexes (Phase 1.2 P3, D41), so only the CP blocks it; defenders are
 * blocked by everything occupied.
 */
export function blockedHexes(state: GameState, except?: string): Set<string> {
  const blocked = new Set<string>([hexKey(state.map.commandPost)]);
  if (except === 'kraken') return blocked;
  blocked.add(hexKey(state.krakenPosition));
  for (const u of state.defenders) {
    if (u.state !== 'dead' && u.id !== except) blocked.add(hexKey(u.position));
  }
  return blocked;
}

export function isMissile(weapon: KrakenWeaponId): boolean {
  return weapon === 'missileRack1' || weapon === 'missileRack2';
}

export function krakenFireCheckUnit(
  state: GameState,
  weapon: KrakenWeaponId,
  unitId: string,
): string | null {
  if (weaponAttack(state.kraken, state.data, weapon) <= 0) return 'weapon destroyed';
  const target = state.defenders.find((u) => u.id === unitId && u.state !== 'dead');
  if (!target) return 'target gone';
  const dist = hexDistance(state.krakenPosition, target.position);
  if (dist > weaponRange(state.data, weapon)) return 'target out of range';
  if (dist > krakenSensorRange(state.kraken, state.data)) return 'target outside sensor range';
  if (!hasLineOfSight(state.map, state.krakenPosition, target.position)) return 'no line of sight';
  return null;
}

export function krakenFireCheckCommandPost(
  state: GameState,
  weapon: KrakenWeaponId,
): string | null {
  if (weaponAttack(state.kraken, state.data, weapon) <= 0) return 'weapon destroyed';
  if (state.commandPost.state === 'destroyed') return 'command post already destroyed';
  const cpHex = state.map.commandPost;
  if (hexDistance(state.krakenPosition, cpHex) > weaponRange(state.data, weapon)) {
    return 'command post out of range';
  }
  if (!hasLineOfSight(state.map, state.krakenPosition, cpHex)) {
    return 'no line of sight to command post';
  }
  return null;
}

export function krakenFireCheckHex(
  state: GameState,
  weapon: KrakenWeaponId,
  hex: Axial,
): string | null {
  if (!isMissile(weapon)) return 'only missiles fire at hexes';
  if (weaponAttack(state.kraken, state.data, weapon) <= 0) return 'weapon destroyed';
  if (!inBounds(state.map, hex)) return 'target hex out of bounds';
  if (hexDistance(state.krakenPosition, hex) > weaponRange(state.data, weapon)) {
    return 'target hex out of range';
  }
  return null;
}

export function canKrakenFireAtUnit(
  state: GameState,
  weapon: KrakenWeaponId,
  unitId: string,
): boolean {
  return krakenFireCheckUnit(state, weapon, unitId) === null;
}

export function canKrakenFireAtCommandPost(state: GameState, weapon: KrakenWeaponId): boolean {
  return krakenFireCheckCommandPost(state, weapon) === null;
}

export function canMissileTargetHex(
  state: GameState,
  weapon: KrakenWeaponId,
  hex: Axial,
): boolean {
  return krakenFireCheckHex(state, weapon, hex) === null;
}

export interface ValidTargets {
  unitIds: string[];
  commandPost: boolean;
}

export function validKrakenTargets(state: GameState, weapon: KrakenWeaponId): ValidTargets {
  return {
    unitIds: state.defenders
      .filter((u) => u.state !== 'dead' && canKrakenFireAtUnit(state, weapon, u.id))
      .map((u) => u.id),
    commandPost: canKrakenFireAtCommandPost(state, weapon),
  };
}

export type EnvelopeStatus = 'valid' | 'losBlocked' | 'outOfSensors';

/**
 * Per-hex targeting picture for one weapon: every in-bounds hex within
 * weapon range, classified. Missiles are indirect (GDD §8.5): no LOS or
 * sensor requirement. Reusable for defender-side threat rings later.
 */
export function weaponEnvelope(
  state: GameState,
  weapon: KrakenWeaponId,
): Map<string, EnvelopeStatus> {
  const result = new Map<string, EnvelopeStatus>();
  if (weaponAttack(state.kraken, state.data, weapon) <= 0) return result;
  const range = weaponRange(state.data, weapon);
  const sensors = krakenSensorRange(state.kraken, state.data);
  const indirect = isMissile(weapon);
  for (const hex of hexRange(state.krakenPosition, range)) {
    if (!inBounds(state.map, hex)) continue;
    let status: EnvelopeStatus = 'valid';
    if (!indirect) {
      if (hexDistance(state.krakenPosition, hex) > sensors) status = 'outOfSensors';
      else if (!hasLineOfSight(state.map, state.krakenPosition, hex)) status = 'losBlocked';
    }
    result.set(hexKey(hex), status);
  }
  return result;
}

export interface MovePlan {
  /** full A* path, start hex included */
  path: Axial[];
  /** index into path of the furthest hex reachable this turn */
  reachableIndex: number;
  totalCost: number;
  /** defender-occupied hexes the path drives through (Kraken overruns, D41) */
  overruns: Axial[];
}

/**
 * A* preview of a move order — same pathing rules the resolver applies.
 * `repairPlanned` caps speed the way an issued repair order will.
 */
export function planMove(
  state: GameState,
  mover: MoverKind,
  moverId: string,
  from: Axial,
  destination: Axial,
  mp: number,
): MovePlan | null {
  if (!inBounds(state.map, destination)) return null;
  const blocked = blockedHexes(state, moverId);
  const destinationOccupied = blocked.has(hexKey(destination));
  const result = aStar(from, destination, (a, b) => {
    if (!inBounds(state.map, b)) return null;
    if (blocked.has(hexKey(b)) && !(destinationOccupied && hexEquals(b, destination))) return null;
    return stepCostFor(state.map, mover, a, b);
  });
  if (!result || result.path.length < 2) return null;
  const path = destinationOccupied ? result.path.slice(0, -1) : result.path;
  if (path.length < 2) return null;

  let spent = 0;
  let reachableIndex = 0;
  for (let i = 1; i < path.length; i++) {
    const step = stepCostFor(state.map, mover, path[i - 1]!, path[i]!)!;
    if (spent + step > mp) break;
    spent += step;
    reachableIndex = i;
  }
  if (reachableIndex === 0 && mp > 0) reachableIndex = 1; // minimum-move rule

  const overruns: Axial[] = [];
  if (mover === 'kraken') {
    for (const hex of path.slice(1)) {
      if (state.defenders.some((u) => u.state !== 'dead' && hexEquals(u.position, hex))) {
        overruns.push(hex);
      }
    }
  }
  return { path, reachableIndex, totalCost: result.cost, overruns };
}

export function planKrakenMove(
  state: GameState,
  destination: Axial,
  repairPlanned = false,
): MovePlan | null {
  let mp = krakenSpeed(state.kraken, state.data);
  if (repairPlanned) mp = Math.min(mp, state.data.kraken.repair.maxSpeedWhileRepairing);
  if (mp <= 0) return null;
  return planMove(state, 'kraken', 'kraken', state.krakenPosition, destination, mp);
}
