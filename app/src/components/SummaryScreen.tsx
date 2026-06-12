import { SoloController } from '../game/controller';

const REASON_TEXT: Record<string, string> = {
  commandPostDestroyed: 'The Command Post is rubble. Mission complete.',
  krakenDestroyed: 'All weapons dark, treads gone. The Kraken is a monument now.',
  timeout: 'The clock ran out with the Command Post still standing.',
  mutualDestruction: 'Mutual annihilation. Nobody is coming back from this one.',
};

export function SummaryScreen({
  controller,
  onRestart,
}: {
  controller: SoloController;
  onRestart: () => void;
}) {
  const s = controller.summary();
  const playerWon = s.winner === 'kraken';
  const draw = s.winner === 'draw';
  return (
    <div className="screen-center">
      <div className={`verdict ${playerWon ? 'win' : 'loss'}`}>
        {draw ? 'DRAW' : playerWon ? 'VICTORY' : 'DEFEAT'}
      </div>
      <div className="tagline">
        {REASON_TEXT[s.reason] ?? s.reason} — turn {s.turns} of{' '}
        {controller.state.data.game.turnLimit}
      </div>
      <div className="summary-panel">
        <h3>System damage log</h3>
        <ul>
          {s.damageLog.length === 0 && <li>Not a scratch.</li>}
          {s.damageLog.map((e, i) => (
            <li key={i}>
              T{e.turn} —{' '}
              {e.type === 'commandPostStateChanged'
                ? `Command Post ${String(e.state).toUpperCase()}`
                : `${String(e.system)} → ${String(e.state).toUpperCase()}`}
            </li>
          ))}
        </ul>
        <h3>Kill feed</h3>
        <ul>
          {s.killFeed.length === 0 && <li>No defender losses.</li>}
          {s.killFeed.map((e, i) => (
            <li key={i}>
              T{e.turn} — {String(e.unitId)} ({String(e.unitType)}) destroyed
            </li>
          ))}
        </ul>
      </div>
      <button className="primary" onClick={onRestart}>
        Back to start
      </button>
    </div>
  );
}
