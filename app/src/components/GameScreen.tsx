import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameEvent, KrakenFireOrder } from '../../../engine/src/game';
import { Axial, hexEquals } from '../../../engine/src/hex';
import { krakenSensorRange } from '../../../engine/src/kraken';
import { isMissile, validKrakenTargets, weaponEnvelope } from '../../../engine/src/targeting';
import { detectedDefenders, krakenVisibleHexKeys } from '../../../engine/src/visibility';
import { SoloController } from '../game/controller';
import { WEAPON_META, weaponStats } from '../game/weaponMeta';
import { LockedTarget, PickResult, SceneSnapshot, TacticalScene } from '../three/scene';
import { TacticalView } from '../three/TacticalView';
import { ControlBar, InputMode } from './ControlBar';
import { Dashboard } from './Dashboard';
import { MiniMap } from './MiniMap';
import { OrderChecklist } from './OrderChecklist';

/** Name the actual failed check (Phase 1.1 P2.5) — never a list of maybes. */
function blockedMessage(reason: string): string {
  if (reason.includes('sensor')) return 'Blocked: beyond sensor range';
  if (reason.includes('line of sight')) return 'Blocked: line of sight';
  if (reason.includes('range')) return 'Blocked: out of range';
  if (reason.includes('destroyed')) return 'Blocked: weapon destroyed';
  return `Blocked: ${reason}`;
}

export function GameScreen({
  controller,
  onGameOver,
}: {
  controller: SoloController;
  onGameOver: () => void;
}) {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [mode, setMode] = useState<InputMode>('move');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('Tap a hex to set course. Arm a weapon, then tap a target.');
  const [ticker, setTicker] = useState<{ text: string; tone: string }[]>([]);
  const sceneRef = useRef<TacticalScene | null>(null);

  // dev/test seam: ?dev=1 exposes the controller for the headless smoke test
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dev')) {
      (window as unknown as Record<string, unknown>).__kraken = { controller, bump };
    }
  }, [controller, bump]);

  const snapshot: SceneSnapshot = useMemo(() => {
    const s = controller.state;
    const armedTargets =
      mode !== 'move' ? validKrakenTargets(s, mode) : { unitIds: [], commandPost: false };
    const sensors = krakenSensorRange(s.kraken, s.data);
    const lockedTargets: LockedTarget[] = [];
    for (const f of controller.pending.fires) {
      const hex: Axial | undefined = f.targetHex
        ? f.targetHex
        : f.targetCommandPost
          ? s.map.commandPost
          : s.defenders.find((u) => u.id === f.targetUnitId)?.position;
      if (hex) lockedTargets.push({ weapon: f.weapon, color: WEAPON_META[f.weapon].color, hex });
    }
    return {
      krakenPos: s.krakenPosition,
      krakenSystems: { ...s.kraken.systems },
      defenders: detectedDefenders(s).map((u) => ({
        id: u.id,
        type: u.type,
        state: u.state as 'green' | 'amber',
        position: u.position,
      })),
      visibleHexKeys: krakenVisibleHexKeys(s),
      smokeCenters: s.smokeClouds.filter((c) => c.expiresTurn >= s.turn).flatMap((c) => c.hexes),
      pathPreview: controller.movePlan?.path ?? null,
      reachableIndex: controller.movePlan?.reachableIndex ?? 0,
      // a locked unit's ring is REPLACED by its reticle (P1.1)
      highlightUnitIds: new Set(
        armedTargets.unitIds.filter(
          (id) => !controller.pending.fires.some((f) => f.targetUnitId === id),
        ),
      ),
      highlightCp:
        armedTargets.commandPost &&
        !controller.pending.fires.some((f) => f.targetCommandPost),
      cpState: s.commandPost.state,
      envelope: mode !== 'move' && !busy ? weaponEnvelope(s, mode) : null,
      envelopeColor: mode !== 'move' ? WEAPON_META[mode].color : 0xffffff,
      sensorHorizonRadius:
        mode !== 'move' && !busy && !isMissile(mode) && sensors < weaponStats(s.data, mode).range
          ? (sensors + 0.5) * 1.62
          : null,
      lockedTargets,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, mode, busy, tick, controller.state.turn, controller.movePlan]);

  const firstHints = useRef({ arm: false, missile: false, damage: false });

  const armWeapon = useCallback(
    (m: InputMode) => {
      setMode(m);
      if (m !== 'move') {
        if (isMissile(m) && !firstHints.current.missile) {
          firstHints.current.missile = true;
          setHint('Missiles fire indirect: tap ANY hex in range — no line of sight needed.');
        } else if (!firstHints.current.arm) {
          firstHints.current.arm = true;
          setHint('Armed. Ringed targets are valid — tap one to lock. Tap the band to read your reach.');
        }
      }
    },
    [],
  );

  const onPick = useCallback(
    (pick: PickResult) => {
      if (busy) {
        sceneRef.current?.skipPlayback(); // tap to skip resolution (P4.2)
        return;
      }
      if (controller.state.outcome) return;
      if (mode === 'move') {
        if (controller.setMoveTarget(pick.hex)) {
          setHint('Course set. End Turn to roll, or arm a weapon.');
        } else {
          setHint('No route to that hex.');
        }
        bump();
        return;
      }
      // a weapon is armed — build the intended order
      const weapon = mode;
      let order: KrakenFireOrder | null = null;
      if (pick.unitId) {
        order = { weapon, targetUnitId: pick.unitId };
      } else if (hexEquals(pick.hex, controller.state.map.commandPost)) {
        order = { weapon, targetCommandPost: true };
      } else if (isMissile(weapon)) {
        order = { weapon, targetHex: pick.hex };
      }
      if (!order) {
        setHint(`Select a ringed target for ${WEAPON_META[weapon].label}.`);
        bump();
        return;
      }
      // tap the locked target again to unlock (P1.4)
      const existing = controller.pending.fires.find((f) => f.weapon === weapon);
      if (existing && sameTarget(existing, order)) {
        controller.clearFire(weapon);
        setHint(`${WEAPON_META[weapon].label} unlocked.`);
        bump();
        return;
      }
      const reason = controller.fireCheck(order);
      if (reason === null) {
        controller.queueFire(order);
        setHint(`${WEAPON_META[weapon].label} locked. Tap again to unlock, or pick another target.`);
      } else {
        setHint(blockedMessage(reason));
      }
      bump();
    },
    [busy, controller, mode, bump],
  );

  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);

  const endTurn = useCallback(() => {
    if (busy || controller.state.outcome) return;
    setBusy(true);
    const events = controller.endTurn();
    setTicker(describeEvents(events));
    bump();
    if (
      !firstHints.current.damage &&
      events.some((e) => e.type === 'systemStateChanged')
    ) {
      firstHints.current.damage = true;
      setHint('You took damage — tap a RED/DARK system on the dashboard to start repairs.');
    }
    const after = () => {
      setPhaseLabel(null);
      setBusy(false);
      bump();
      if (controller.state.outcome) setTimeout(onGameOver, 1400);
      else sceneRef.current?.centerOnKraken();
    };
    const scene = sceneRef.current;
    if (scene) scene.playEvents(events, setPhaseLabel).then(after);
    else after();
  }, [busy, controller, bump, onGameOver]);

  const remaining = controller.turnsRemaining;
  return (
    <div className="game-root">
      <div className="view-area">
        <TacticalView map={controller.state.map} snapshot={snapshot} onPick={onPick} sceneRef={sceneRef} />
        <MiniMap map={controller.state.map} krakenPos={controller.state.krakenPosition} />
        <div className="turn-banner">
          Turn {controller.state.turn + 1}
          {' · '}
          <span className={remaining <= 10 ? 'warn' : ''}>{remaining} turns left</span>
        </div>
        {phaseLabel && <div className="phase-label rj">{phaseLabel}</div>}
        {!busy && !controller.state.outcome && (
          <OrderChecklist controller={controller} tick={tick} />
        )}
        <div className="event-ticker">
          {ticker.slice(0, 7).map((line, i) => (
            <div key={i} className={line.tone}>
              {line.text}
            </div>
          ))}
        </div>
        <div className="hint-bar">{hint}</div>
      </div>
      <div className="dash-area">
        <Dashboard
          controller={controller}
          onSelectRepair={(sys) => {
            controller.setRepair(controller.pending.repair === sys ? null : sys);
            bump();
          }}
        />
      </div>
      <div className="controls-area">
        <ControlBar
          controller={controller}
          mode={mode}
          setMode={armWeapon}
          onEndTurn={endTurn}
          busy={busy}
        />
      </div>
    </div>
  );
}

function sameTarget(a: KrakenFireOrder, b: KrakenFireOrder): boolean {
  if (a.targetUnitId || b.targetUnitId) return a.targetUnitId === b.targetUnitId;
  if (a.targetCommandPost || b.targetCommandPost) return !!a.targetCommandPost === !!b.targetCommandPost;
  if (a.targetHex && b.targetHex) return hexEquals(a.targetHex, b.targetHex);
  return false;
}

function describeEvents(events: GameEvent[]): { text: string; tone: string }[] {
  const lines: { text: string; tone: string }[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'systemStateChanged':
        lines.push({
          text: `${String(e.system)} hit — now ${String(e.state).toUpperCase()}`,
          tone: 'bad',
        });
        break;
      case 'unitDestroyed':
        lines.push({ text: `${String(e.unitType)} destroyed`, tone: 'good' });
        break;
      case 'commandPostStateChanged':
        lines.push({ text: `COMMAND POST ${String(e.state).toUpperCase()}`, tone: 'good' });
        break;
      case 'shellLanded':
        lines.push({ text: 'Artillery impact', tone: '' });
        break;
      case 'repairCompleted':
        lines.push({ text: `${String(e.system)} repaired`, tone: 'good' });
        break;
      case 'smokeDeployed':
        lines.push({ text: 'Smoke deployed', tone: '' });
        break;
      case 'targetEvaded':
        lines.push({
          text:
            e.attackerId === 'kraken'
              ? `${String(e.targetId)} evaded your ${String(e.weapon)} (${String(e.reason)})`
              : `You evaded ${String(e.attackerId)} (${String(e.reason)})`,
          tone: e.attackerId === 'kraken' ? 'bad' : 'good',
        });
        break;
      default:
        break;
    }
  }
  return lines.reverse();
}
