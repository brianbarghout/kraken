/**
 * The Kraken — systems & degradation model (GDD §5).
 * No hit points: individual systems walk a green → amber → red → dark
 * ladder and the machine's capabilities degrade with them.
 */
import type { SystemState, UnitData } from './data';

export type KrakenSystemId =
  | 'mainBattery'
  | 'secondary1'
  | 'secondary2'
  | 'antiPersonnel1'
  | 'antiPersonnel2'
  | 'missileRack1'
  | 'missileRack2'
  | 'smokeDispensers'
  | 'treadLeft'
  | 'treadRight'
  | 'sensorArray'
  | 'repairPrinters';

export const WEAPON_SYSTEMS = [
  'mainBattery',
  'secondary1',
  'secondary2',
  'antiPersonnel1',
  'antiPersonnel2',
  'missileRack1',
  'missileRack2',
] as const;

export type KrakenWeaponId = (typeof WEAPON_SYSTEMS)[number];

export const ALL_SYSTEMS: readonly KrakenSystemId[] = [
  ...WEAPON_SYSTEMS,
  'smokeDispensers',
  'treadLeft',
  'treadRight',
  'sensorArray',
  'repairPrinters',
];

export interface RepairJob {
  system: KrakenSystemId;
  progress: number;
  turnsRequired: number;
}

export interface KrakenState {
  systems: Record<KrakenSystemId, SystemState>;
  repair: RepairJob | null;
  printersRevealed: boolean;
  smokeCooldown: number;
}

const STATE_ORDER: SystemState[] = ['green', 'amber', 'red', 'dark'];

function stateIndex(s: SystemState): number {
  return STATE_ORDER.indexOf(s);
}

export function createKraken(): KrakenState {
  const systems = Object.fromEntries(ALL_SYSTEMS.map((id) => [id, 'green'])) as Record<
    KrakenSystemId,
    SystemState
  >;
  return { systems, repair: null, printersRevealed: false, smokeCooldown: 0 };
}

type SystemKind = 'tread' | 'weapon' | 'sensorArray' | 'smokeDispensers' | 'repairPrinters';

export function systemKind(id: KrakenSystemId): SystemKind {
  if (id === 'treadLeft' || id === 'treadRight') return 'tread';
  if (id === 'sensorArray' || id === 'smokeDispensers' || id === 'repairPrinters') return id;
  return 'weapon';
}

export function armourOfSystem(data: UnitData, id: KrakenSystemId): number {
  return data.kraken.systemArmour[systemKind(id)];
}

/** Apply a combat result to a system. 'damage' = one step down, 'kill' = dark. */
export function applySystemDamage(
  k: KrakenState,
  id: KrakenSystemId,
  result: 'damage' | 'kill',
): SystemState {
  const current = k.systems[id];
  const next: SystemState =
    result === 'kill' ? 'dark' : STATE_ORDER[Math.min(stateIndex(current) + 1, 3)]!;
  k.systems[id] = next;
  // battlefield damage disrupts an in-progress repair of the same system
  if (k.repair && k.repair.system === id) k.repair.progress = 0;
  return next;
}

/**
 * Speed from tread condition (GDD §5.2): each tread contributes per
 * units.json; asymmetric damage (>= threshold steps apart) costs a further
 * -1 for turning impairment, but a Kraken with any working tread always
 * crawls at >= 1. Repairing caps speed (GDD §5.4: cannot sprint).
 */
export function krakenSpeed(k: KrakenState, data: UnitData): number {
  const contrib = data.kraken.treadSpeedContribution;
  const left = k.systems.treadLeft;
  const right = k.systems.treadRight;
  const sum = contrib[left] + contrib[right];
  if (sum === 0) return 0;
  const asym =
    Math.abs(stateIndex(left) - stateIndex(right)) >= data.kraken.treadAsymmetryPenaltyThreshold
      ? 1
      : 0;
  let speed = Math.max(1, Math.floor(sum) - asym);
  if (k.repair) speed = Math.min(speed, data.kraken.repair.maxSpeedWhileRepairing);
  return speed;
}

export function krakenSensorRange(k: KrakenState, data: UnitData): number {
  return data.kraken.sensorRangeByState[k.systems.sensorArray];
}

function weaponBaseAttack(data: UnitData, id: KrakenWeaponId): number {
  if (id === 'mainBattery') return data.kraken.weapons.mainBattery.attack;
  if (id === 'secondary1' || id === 'secondary2') return data.kraken.weapons.secondary.attack;
  if (id === 'antiPersonnel1' || id === 'antiPersonnel2')
    return data.kraken.weapons.antiPersonnel.attack;
  return data.kraken.weapons.missileRack.attack;
}

export function weaponRange(data: UnitData, id: KrakenWeaponId): number {
  if (id === 'mainBattery') return data.kraken.weapons.mainBattery.range;
  if (id === 'secondary1' || id === 'secondary2') return data.kraken.weapons.secondary.range;
  if (id === 'antiPersonnel1' || id === 'antiPersonnel2')
    return data.kraken.weapons.antiPersonnel.range;
  return data.kraken.weapons.missileRack.range;
}

/** Effective attack of a weapon system in its current state. */
export function weaponAttack(k: KrakenState, data: UnitData, id: KrakenWeaponId): number {
  return Math.floor(weaponBaseAttack(data, id) * data.kraken.stateAttackMultiplier[k.systems[id]]);
}

export function startRepair(k: KrakenState, data: UnitData, id: KrakenSystemId): void {
  if (k.systems.repairPrinters === 'dark') {
    throw new Error('repair printers are destroyed — no self-repair (GDD §5.4)');
  }
  if (k.repair) {
    throw new Error(`already repairing ${k.repair.system} — one system at a time (GDD §5.4)`);
  }
  const cap = data.kraken.repair.repairedStateCap;
  if (stateIndex(k.systems[id]) <= stateIndex(cap)) {
    throw new Error(`${id} is at or above the ${cap} repair cap (GDD §5.4: 75% maximum)`);
  }
  const turnsRequired = data.kraken.repair.turnsBySystem[systemKind(id) as never] as
    | number
    | undefined;
  if (turnsRequired === undefined) {
    throw new Error(`${id} cannot be repaired`);
  }
  k.repair = { system: id, progress: 0, turnsRequired };
  k.printersRevealed = true; // the act of repairing reveals the printers (GDD §13.5)
}

/** Advance the active repair one turn; completes to the 75% cap (amber). */
export function tickRepair(k: KrakenState, data: UnitData): void {
  if (!k.repair) return;
  k.repair.progress++;
  if (k.repair.progress >= k.repair.turnsRequired) {
    k.systems[k.repair.system] = data.kraken.repair.repairedStateCap;
    k.repair = null;
  }
}

/** GDD §3 'Kraken fully destroyed' — all weapons gone and immobilised. */
export function isKrakenDestroyed(k: KrakenState): boolean {
  return (
    WEAPON_SYSTEMS.every((w) => k.systems[w] === 'dark') &&
    k.systems.treadLeft === 'dark' &&
    k.systems.treadRight === 'dark'
  );
}

/** Systems a defender may currently aim at (GDD §8.5, §13.5). */
export function targetableSystems(k: KrakenState): KrakenSystemId[] {
  return ALL_SYSTEMS.filter((id) => {
    if (k.systems[id] === 'dark') return false;
    if (id === 'repairPrinters' && !k.printersRevealed) return false;
    return true;
  });
}
