/**
 * Fog of war from the Kraken's seat (GDD §7): a hex is visible when it is
 * within current sensor range AND line of sight. Sensor damage shrinks
 * the bubble; defenders render only when detected.
 */
import { GameState } from './game';
import { hexKey, hexRange } from './hex';
import { krakenSensorRange } from './kraken';
import { hasLineOfSight } from './los';
import { inBounds } from './map';
import { DefenderUnit } from './units';

export function krakenVisibleHexKeys(state: GameState): Set<string> {
  const range = krakenSensorRange(state.kraken, state.data);
  const visible = new Set<string>();
  for (const hex of hexRange(state.krakenPosition, range)) {
    if (!inBounds(state.map, hex)) continue;
    if (hasLineOfSight(state.map, state.krakenPosition, hex)) visible.add(hexKey(hex));
  }
  return visible;
}

export function detectedDefenders(state: GameState): DefenderUnit[] {
  const visible = krakenVisibleHexKeys(state);
  return state.defenders.filter((u) => u.state !== 'dead' && visible.has(hexKey(u.position)));
}
