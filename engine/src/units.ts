/**
 * Defender unit instances. Stats come from units.json; instances carry
 * position, damage state (green/amber/dead) and per-unit flags.
 */
import type { DefenderType, UnitData } from './data';
import type { AttackResult } from './combat';
import type { Axial } from './hex';
import type { Rng } from './rng';

export type DefenderState = 'green' | 'amber' | 'dead';

export interface DefenderUnit {
  id: string;
  type: DefenderType;
  fleetId: string;
  position: Axial;
  state: DefenderState;
  /** heavy tank: the one main-battery glance has been spent */
  glanceUsed: boolean;
}

export function createDefender(
  id: string,
  type: DefenderType,
  fleetId: string,
  position: Axial,
): DefenderUnit {
  return { id, type, fleetId, position, state: 'green', glanceUsed: false };
}

export function defenderAttack(unit: DefenderUnit, data: UnitData): number {
  const base = data.defenders[unit.type].attack;
  if (unit.state === 'amber') {
    return Math.max(base > 0 ? 1 : 0, Math.floor(base * data.combat.damagedAttackMultiplier));
  }
  return base;
}

export function defenderSpeed(unit: DefenderUnit, data: UnitData): number {
  const base = data.defenders[unit.type].speed;
  if (unit.state === 'amber') {
    return Math.max(1, base - data.combat.damagedSpeedPenalty);
  }
  return base;
}

export interface DefenderDamageOptions {
  /** the hit came from the Kraken main battery (heavy-tank glance rule, GDD §8.5) */
  fromMainBattery?: boolean;
}

/**
 * Apply a combat result to a defender. Damage ladder: green -> amber -> dead.
 * Heavy tanks may survive one main-battery kill as a glance (amber) on a
 * defence roll.
 */
export function applyDamageToDefender(
  unit: DefenderUnit,
  result: AttackResult,
  data: UnitData,
  rng: Rng,
  opts: DefenderDamageOptions = {},
): void {
  if (result === 'ping' || result === 'noEffect') return;
  if (result === 'kill') {
    const glanceChance = data.defenders[unit.type].special.mainBatteryGlanceSurvivalChance;
    if (
      opts.fromMainBattery &&
      glanceChance !== undefined &&
      !unit.glanceUsed &&
      unit.state === 'green' &&
      rng.chance(glanceChance)
    ) {
      unit.state = 'amber';
      unit.glanceUsed = true;
      return;
    }
    unit.state = 'dead';
    return;
  }
  // damage
  unit.state = unit.state === 'green' ? 'amber' : 'dead';
}
