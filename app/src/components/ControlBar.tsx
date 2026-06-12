import { KrakenWeaponId, weaponAttack, WEAPON_SYSTEMS } from '../../../engine/src/kraken';
import { SoloController } from '../game/controller';

const WEAPON_LABEL: Record<KrakenWeaponId, string> = {
  mainBattery: 'Main',
  secondary1: 'Sec L',
  secondary2: 'Sec R',
  antiPersonnel1: 'AP L',
  antiPersonnel2: 'AP R',
  missileRack1: 'Msl L',
  missileRack2: 'Msl R',
};

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
        const usable = weaponAttack(state.kraken, state.data, w) > 0;
        const queued = pending.fires.some((f) => f.weapon === w);
        return (
          <button
            key={w}
            className={mode === w ? 'armed' : queued ? 'primary' : ''}
            disabled={busy || !usable}
            onClick={() => {
              if (queued) controller.clearFire(w);
              setMode(mode === w ? 'move' : w);
            }}
            title={queued ? 'queued — tap to clear' : ''}
          >
            {WEAPON_LABEL[w]}
            {queued ? ' ✓' : ''}
          </button>
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
