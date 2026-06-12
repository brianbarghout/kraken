/**
 * Per-weapon display metadata shared by the control bar, dashboard,
 * tactical-view overlays and tooltips. One colour per weapon so locked
 * targeting lines read as a fan of fire (Phase 1.1 P1.2).
 */
import { UnitData } from '../../../engine/src/data';
import { KrakenWeaponId } from '../../../engine/src/kraken';

export interface WeaponMeta {
  label: string;
  fullName: string;
  /** shared by three.js (number) and CSS (string) */
  color: number;
  css: string;
}

export const WEAPON_META: Record<KrakenWeaponId, WeaponMeta> = {
  mainBattery: { label: 'Main', fullName: 'Main Battery', color: 0xff5c57, css: '#ff5c57' },
  secondary1: { label: 'Sec L', fullName: 'Secondary Battery (L)', color: 0xe0a93c, css: '#e0a93c' },
  secondary2: { label: 'Sec R', fullName: 'Secondary Battery (R)', color: 0xff9e3d, css: '#ff9e3d' },
  antiPersonnel1: { label: 'AP L', fullName: 'Anti-Personnel Gun (L)', color: 0x9be05c, css: '#9be05c' },
  antiPersonnel2: { label: 'AP R', fullName: 'Anti-Personnel Gun (R)', color: 0x5cd6c8, css: '#5cd6c8' },
  missileRack1: { label: 'Msl L', fullName: 'Missile Rack (L)', color: 0x6f9dff, css: '#6f9dff' },
  missileRack2: { label: 'Msl R', fullName: 'Missile Rack (R)', color: 0xc77dff, css: '#c77dff' },
};

export function weaponStats(data: UnitData, weapon: KrakenWeaponId): { attack: number; range: number } {
  const w = data.kraken.weapons;
  if (weapon === 'mainBattery') return { attack: w.mainBattery.attack, range: w.mainBattery.range };
  if (weapon === 'secondary1' || weapon === 'secondary2')
    return { attack: w.secondary.attack, range: w.secondary.range };
  if (weapon === 'antiPersonnel1' || weapon === 'antiPersonnel2')
    return { attack: w.antiPersonnel.attack, range: w.antiPersonnel.range };
  return { attack: w.missileRack.attack, range: w.missileRack.range };
}

/** Short tag for lock badges: what the weapon is committed to. */
export function targetTag(order: {
  targetUnitId?: string;
  targetCommandPost?: boolean;
  targetHex?: unknown;
}): string {
  if (order.targetCommandPost) return 'CP';
  if (order.targetUnitId) return order.targetUnitId.toUpperCase();
  if (order.targetHex) return 'HEX';
  return '';
}
