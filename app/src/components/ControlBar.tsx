import { useState } from 'react';
import { KrakenWeaponId, weaponAttack, WEAPON_SYSTEMS } from '../../../engine/src/kraken';
import { SoloController } from '../game/controller';
import { targetTag, WEAPON_META, weaponStats } from '../game/weaponMeta';

export type InputMode = 'move' | KrakenWeaponId;

export function ControlBar({
  controller,
  mode,
  setMode,
  onEndTurn,
  busy,
}: {
  controller: SoloController;
  mode: InputMode;
  setMode: (m: InputMode) => void;
  onEndTurn: () => void;
  busy: boolean;
}) {
  const { state, pending } = controller;
  const [tooltip, setTooltip] = useState<KrakenWeaponId | null>(null);
  const smokeReady =
    state.kraken.smokeCooldown === 0 && state.kraken.systems.smokeDispensers !== 'dark';
  return (
    <>
      <button
        className={mode === 'move' ? 'primary' : ''}
        disabled={busy}
        onClick={() => setMode('move')}
      >
        Move
      </button>
      {WEAPON_SYSTEMS.map((w) => {
        const meta = WEAPON_META[w];
        const usable = weaponAttack(state.kraken, state.data, w) > 0;
        const lock = pending.fires.find((f) => f.weapon === w);
        const armed = mode === w;
        // bar reads as the fire plan: idle / armed / locked (P1.3)
        const className = armed ? 'armed' : lock ? 'locked' : '';
        const style =
          lock || armed ? { borderColor: meta.css, color: meta.css } : undefined;
        return (
          <span key={w} style={{ position: 'relative' }}>
            <button
              className={className}
              style={style}
              disabled={busy || !usable}
              onClick={() => setMode(armed ? 'move' : w)}
              onMouseEnter={() => setTooltip(w)}
              onMouseLeave={() => setTooltip(null)}
              onTouchStart={() => setTooltip(w)}
              onTouchEnd={() => setTimeout(() => setTooltip(null), 1200)}
            >
              {meta.label}
              {lock ? ` ◉ ${targetTag(lock)}` : ''}
            </button>
            {tooltip === w && (
              <span className="weapon-tip">
                {meta.fullName} · ATK {weaponStats(state.data, w).attack} · RNG{' '}
                {weaponStats(state.data, w).range}
              </span>
            )}
          </span>
        );
      })}
      <button
        className={pending.deploySmoke ? 'primary' : ''}
        disabled={busy || !smokeReady}
        onClick={() => controller.setSmoke(!pending.deploySmoke)}
      >
        Smoke{pending.deploySmoke ? ' ✓' : ''}
      </button>
      <span style={{ flex: 1 }} />
      <button
        className="primary"
        style={{ fontSize: 17, padding: '10px 26px' }}
        disabled={busy}
        onClick={onEndTurn}
      >
        {busy ? 'Resolving…' : 'End Turn'}
      </button>
    </>
  );
}
