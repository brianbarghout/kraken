import { useState } from 'react';

export type MapChoice = 'full' | 'small';

export function StartScreen({
  onStart,
}: {
  onStart: (map: MapChoice, seed: number) => void;
}) {
  const [choice, setChoice] = useState<MapChoice>('full');
  return (
    <div className="screen-center">
      <h1>Kraken</h1>
      <div className="tagline">One machine. One objective. Stop it if you can.</div>
      <div className="tagline">
        You are the Kraken. Reach and destroy the Command Post before the defenders
        dismantle you — or before the clock runs out.
      </div>
      <div className="map-choice">
        <button
          className={choice === 'full' ? 'selected' : ''}
          onClick={() => setChoice('full')}
        >
          Gateway — full map
        </button>
        <button
          className={choice === 'small' ? 'selected' : ''}
          onClick={() => setChoice('small')}
        >
          Gateway Compact — 50%
        </button>
      </div>
      <button className="primary" style={{ fontSize: 20, padding: '14px 44px' }}
        onClick={() => onStart(choice, Math.floor(Math.random() * 1_000_000))}
      >
        Begin Assault
      </button>
    </div>
  );
}
