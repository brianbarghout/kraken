/**
 * Combat resolution (GDD §8.5): attack vs armour, single server-side roll.
 *   attack >= 2x armour  -> kill
 *   attack >= armour     -> 50/50 damage roll
 *   attack <  armour     -> ping
 */
import type { UnitData } from './data';
import type { Rng } from './rng';

export type AttackResult = 'kill' | 'damage' | 'noEffect' | 'ping';

export interface ResolveOptions {
  /** Light tank vs treads: any hit damages — the 50/50 bracket becomes certain damage. */
  autoDamage?: boolean;
}

export function resolveAttack(
  attack: number,
  armour: number,
  data: UnitData,
  rng: Rng,
  opts: ResolveOptions = {},
): AttackResult {
  if (attack <= 0) return 'ping';
  if (attack >= armour * data.combat.killMultiplier) return 'kill';
  if (attack >= armour) {
    if (opts.autoDamage) return 'damage';
    return rng.chance(data.combat.damageRollChance) ? 'damage' : 'noEffect';
  }
  return 'ping';
}
