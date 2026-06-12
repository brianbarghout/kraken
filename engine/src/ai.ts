/**
 * Tier 1 defender AI — exactly GDD §18.1:
 *   - units move toward the Kraken's last known position
 *   - fire when the target enters weapon range
 *   - artillery moves to nearest high ground, then fires
 *   - scouts advance to sensor (reveal) range, then hold and report
 *   - no inter-fleet coordination, no terrain exploitation, no retreat
 *
 * Issues orders through the same public API as a human player so later
 * phases can reuse it unchanged. The Kraken is always visible on the
 * strategic layer (GDD §7.1), so "last known position" is its current hex.
 */
import { DefenderOrder, GameState } from './game';
import { Axial, hexDistance, hexKey, hexLine, offsetToAxial } from './hex';
import { hasLineOfSight } from './los';
import { targetableSystems } from './kraken';
import { inBounds, terrainAt } from './map';
import { createRng } from './rng';
import { defenderAttack, DefenderUnit } from './units';

export interface Tier1AI {
  ordersFor(state: GameState): DefenderOrder[];
}

function hillHexes(state: GameState): Axial[] {
  const hills: Axial[] = [];
  for (let row = 0; row < state.map.height; row++) {
    for (let col = 0; col < state.map.width; col++) {
      const hex = offsetToAxial(col, row);
      if (terrainAt(state.map, hex).id === 'hills') hills.push(hex);
    }
  }
  return hills;
}

export function createTier1AI(seed: number): Tier1AI {
  const rng = createRng(seed ^ 0x7ae1);
  let hillsCache: Axial[] | null = null;

  function nearestHill(state: GameState, from: Axial): Axial | null {
    hillsCache ??= hillHexes(state);
    let best: Axial | null = null;
    let bestDist = Infinity;
    for (const h of hillsCache) {
      const d = hexDistance(from, h);
      if (d < bestDist || (d === bestDist && best && hexKey(h) < hexKey(best))) {
        best = h;
        bestDist = d;
      }
    }
    return best;
  }

  function scoutOrder(state: GameState, unit: DefenderUnit): DefenderOrder | null {
    const reveal = state.data.defenders.scoutBike.special.revealRadius ?? 4;
    const dist = hexDistance(unit.position, state.krakenPosition);
    if (dist <= reveal) return null; // hold and report
    // advance to a hex at reveal range on the line toward the Kraken
    const line = hexLine(state.krakenPosition, unit.position);
    const holdHex = line.find((h, i) => i >= reveal && inBounds(state.map, h));
    return { unitId: unit.id, moveTo: holdHex ?? state.krakenPosition };
  }

  function artilleryOrder(state: GameState, unit: DefenderUnit): DefenderOrder | null {
    const stats = state.data.defenders.artillery;
    const onHills = terrainAt(state.map, unit.position).id === 'hills';
    if (!onHills) {
      const hill = nearestHill(state, unit.position);
      return hill ? { unitId: unit.id, moveTo: hill } : null;
    }
    const range = stats.special.ridgeRange ?? stats.range;
    if (hexDistance(unit.position, state.krakenPosition) <= range) {
      return { unitId: unit.id, bombard: state.krakenPosition };
    }
    // dug in but out of range: lumber toward the threat (no cleverness at Tier 1)
    return { unitId: unit.id, moveTo: state.krakenPosition };
  }

  function combatOrder(state: GameState, unit: DefenderUnit): DefenderOrder | null {
    const stats = state.data.defenders[unit.type];
    const dist = hexDistance(unit.position, state.krakenPosition);
    if (
      dist <= stats.range &&
      defenderAttack(unit, state.data) > 0 &&
      hasLineOfSight(state.map, unit.position, state.krakenPosition)
    ) {
      const targets = targetableSystems(state.kraken);
      if (targets.length > 0) {
        // Tier 1 has no system priorities — uniform pick
        return { unitId: unit.id, fireAtSystem: rng.pick(targets) };
      }
    }
    return { unitId: unit.id, moveTo: state.krakenPosition };
  }

  return {
    ordersFor(state: GameState): DefenderOrder[] {
      const orders: DefenderOrder[] = [];
      // deterministic processing order
      const units = [...state.defenders].sort((a, b) => a.id.localeCompare(b.id));
      for (const unit of units) {
        if (unit.state === 'dead') continue;
        const order =
          unit.type === 'scoutBike'
            ? scoutOrder(state, unit)
            : unit.type === 'artillery'
              ? artilleryOrder(state, unit)
              : combatOrder(state, unit);
        if (order) orders.push(order);
      }
      return orders;
    },
  };
}
