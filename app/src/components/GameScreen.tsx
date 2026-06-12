import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameEvent } from '../../../engine/src/game';
import { hexEquals } from '../../../engine/src/hex';
import { isMissile } from '../../../engine/src/targeting';
import { validKrakenTargets, canKrakenFireAtCommandPost } from '../../../engine/src/targeting';
import { detectedDefenders, krakenVisibleHexKeys } from '../../../engine/src/visibility';
import { SoloController } from '../game/controller';
import { PickResult, SceneSnapshot, TacticalScene } from '../three/scene';
import { TacticalView } from '../three/TacticalView';
import { ControlBar, InputMode } from './ControlBar';
import { Dashboard } from './Dashboard';
import { MiniMap } from './MiniMap';

export function GameScreen({
  controller,
  onGameOver,
}: {
  controller: SoloController;
  onGameOver: () => void;
}) {
  const [, setTick] = useState(0);
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
      highlightUnitIds: new Set(armedTargets.unitIds),
      highlightCp: armedTargets.commandPost,
      cpState: s.commandPost.state,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, mode, busy, controller.state.turn, controller.pending, controller.movePlan]);

  const onPick = useCallback(
    (pick: PickResult) => {
      if (busy || controller.state.outcome) return;
      if (mode === 'move') {
        if (controller.setMoveTarget(pick.hex)) {
          setHint('Course set. End Turn to roll, or arm a weapon.');
        } else {
          setHint('No route to that hex.');
        }
        bump();
        return;
      }
      // a weapon is armed
      const weapon = mode;
      let ok = false;
      if (pick.unitId) {
        ok = controller.queueFire({ weapon, targetUnitId: pick.unitId });
      } else if (hexEquals(pick.hex, controller.state.map.commandPost)) {
        ok = controller.queueFire({ weapon, targetCommandPost: true });
      } else if (isMissile(weapon)) {
        ok = controller.queueFire({ weapon, targetHex: pick.hex });
      }
      if (ok) {
        setHint(`${weapon} locked. Arm another weapon or End Turn.`);
        setMode('move');
      } else {
        setHint('Invalid target for that weapon (range, sensors, or line of sight).');
      }
      bump();
    },
    [busy, controller, mode, bump],
  );

  const endTurn = useCallback(() => {
    if (busy || controller.state.outcome) return;
    setBusy(true);
    const events = controller.endTurn();
    setTicker(describeEvents(events));
    bump();
    const after = () => {
      setBusy(false);
      bump();
      if (controller.state.outcome) setTimeout(onGameOver, 1400);
      else sceneRef.current?.centerOnKraken();
    };
    const scene = sceneRef.current;
    if (scene) scene.playEvents(events).then(after);
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
          setMode={setMode}
          onEndTurn={endTurn}
          busy={busy}
        />
      </div>
    </div>
  );
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
