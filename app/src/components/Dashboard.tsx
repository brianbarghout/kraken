/**
 * The Kraken dashboard (GDD §5.3) — top-down SVG schematic. Colour AND
 * shape per state (✓/△/!/✕), spatial L/R treads, live repair bar.
 * Tap a damaged system to queue a repair.
 */
import { SystemState } from '../../../engine/src/data';
import {
  KrakenSystemId,
  krakenSensorRange,
  krakenSpeed,
} from '../../../engine/src/kraken';
import { SoloController } from '../game/controller';

const COLOR: Record<SystemState, string> = {
  green: '#3fae6a',
  amber: '#e0a93c',
  red: '#d9534f',
  dark: '#2e3331',
};
const ICON: Record<SystemState, string> = { green: '✓', amber: '△', red: '!', dark: '✕' };

interface NodeDef {
  id: KrakenSystemId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODES: NodeDef[] = [
  { id: 'mainBattery', label: 'MAIN', x: 130, y: 52, w: 60, h: 40 },
  { id: 'antiPersonnel1', label: 'AP-L', x: 84, y: 56, w: 36, h: 26 },
  { id: 'antiPersonnel2', label: 'AP-R', x: 200, y: 56, w: 36, h: 26 },
  { id: 'secondary1', label: 'SEC-L', x: 84, y: 130, w: 44, h: 34 },
  { id: 'secondary2', label: 'SEC-R', x: 192, y: 130, w: 44, h: 34 },
  { id: 'sensorArray', label: 'SENSORS', x: 132, y: 122, w: 56, h: 50 },
  { id: 'repairPrinters', label: 'PRINTERS', x: 126, y: 196, w: 68, h: 34 },
  { id: 'missileRack1', label: 'MSL-L', x: 84, y: 250, w: 44, h: 38 },
  { id: 'missileRack2', label: 'MSL-R', x: 192, y: 250, w: 44, h: 38 },
  { id: 'smokeDispensers', label: 'SMOKE', x: 130, y: 312, w: 60, h: 30 },
  { id: 'treadLeft', label: 'TREAD L', x: 34, y: 60, w: 30, h: 290 },
  { id: 'treadRight', label: 'TREAD R', x: 256, y: 60, w: 30, h: 290 },
];

export function Dashboard({
  controller,
  onSelectRepair,
}: {
  controller: SoloController;
  onSelectRepair: (s: KrakenSystemId) => void;
}) {
  const k = controller.state.kraken;
  const data = controller.state.data;
  const job = k.repair;
  const pendingRepair = controller.pending.repair;

  const repairable = (id: KrakenSystemId): boolean =>
    id !== 'repairPrinters' &&
    k.repair === null &&
    k.systems.repairPrinters !== 'dark' &&
    (k.systems[id] === 'red' || k.systems[id] === 'dark');

  return (
    <div>
      <div className="dash-title rj">KRAKEN — Systems</div>
      <div className="dash-sub">Tap a RED or DARK system to start repair (max one)</div>
      <svg className="dash-svg" viewBox="0 0 320 400" role="img" aria-label="Kraken system schematic">
        {/* hull */}
        <rect x={72} y={36} width={176} height={330} rx={26} fill="#161d19" stroke="#2a3a31" />
        <line x1={72} y1={100} x2={248} y2={100} stroke="#1f2b24" />
        <line x1={72} y1={300} x2={248} y2={300} stroke="#1f2b24" />
        {NODES.map((n) => {
          const state = k.systems[n.id];
          const hiddenPrinters = n.id === 'repairPrinters' && !k.printersRevealed;
          const isRepairing = job?.system === n.id;
          const isPending = pendingRepair === n.id;
          const canRepair = repairable(n.id);
          return (
            <g
              key={n.id}
              onClick={() => canRepair && onSelectRepair(n.id)}
              style={{ cursor: canRepair ? 'pointer' : 'default' }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={5}
                fill={COLOR[state]}
                fillOpacity={state === 'dark' ? 0.9 : 0.28}
                stroke={isPending ? '#59d68b' : COLOR[state]}
                strokeWidth={isPending ? 2.5 : 1.4}
                strokeDasharray={hiddenPrinters ? '4 3' : undefined}
              />
              <text
                x={n.x + n.w / 2}
                y={n.y + n.h / 2 - 4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="Rajdhani"
                fontWeight={700}
                fill="#cfe3d6"
              >
                {n.label}
              </text>
              <text
                x={n.x + n.w / 2}
                y={n.y + n.h / 2 + 11}
                textAnchor="middle"
                fontSize={12}
                fill={state === 'dark' ? '#8a8f8c' : COLOR[state]}
              >
                {hiddenPrinters ? '◌' : ICON[state]}
              </text>
              {isRepairing && job && (
                <g>
                  <rect x={n.x} y={n.y + n.h + 3} width={n.w} height={5} fill="#1f2b24" rx={2} />
                  <rect
                    x={n.x}
                    y={n.y + n.h + 3}
                    width={(n.w * job.progress) / job.turnsRequired}
                    height={5}
                    fill="#59d68b"
                    rx={2}
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="dash-stats">
        <span>
          Speed <b>{krakenSpeed(k, data)}</b> hex/turn
        </span>
        <span>
          Sensors <b>{krakenSensorRange(k, data)}</b> hex
        </span>
        <span>
          Smoke {k.smokeCooldown > 0 ? <b>recharging {k.smokeCooldown}</b> : <b>ready</b>}
        </span>
        <span>
          Command Post <b>{controller.state.commandPost.state.toUpperCase()}</b>
        </span>
      </div>
      {job && (
        <div className="repair-note">
          Repairing {job.system} — {job.progress}/{job.turnsRequired} turns. Speed capped at 1.
        </div>
      )}
      {pendingRepair && !job && (
        <div className="repair-note">Repair order queued: {pendingRepair} (starts this turn)</div>
      )}
    </div>
  );
}
