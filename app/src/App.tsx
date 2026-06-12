import { useCallback, useState } from 'react';
import { parseUnitData } from '../../engine/src/data';
import { parseMap } from '../../engine/src/map';
import rawUnits from '../../engine/data/units.json';
import rawMapFull from '../../engine/data/maps/map01.json';
import rawMapSmall from '../../engine/data/maps/map01-small.json';
import { SoloController } from './game/controller';
import { StartScreen, MapChoice } from './components/StartScreen';
import { GameScreen } from './components/GameScreen';
import { SummaryScreen } from './components/SummaryScreen';

const data = parseUnitData(rawUnits);
const maps = {
  full: () => parseMap(rawMapFull),
  small: () => parseMap(rawMapSmall),
};

type Screen = 'start' | 'game' | 'summary';

export function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [controller, setController] = useState<SoloController | null>(null);

  const startGame = useCallback((choice: MapChoice, seed: number) => {
    setController(new SoloController({ map: maps[choice](), data, seed }));
    setScreen('game');
  }, []);

  const onGameOver = useCallback(() => setScreen('summary'), []);
  const backToStart = useCallback(() => {
    setController(null);
    setScreen('start');
  }, []);

  if (screen === 'game' && controller) {
    return <GameScreen controller={controller} onGameOver={onGameOver} onAbandon={backToStart} />;
  }
  if (screen === 'summary' && controller) {
    return <SummaryScreen controller={controller} onRestart={backToStart} />;
  }
  return <StartScreen onStart={startGame} />;
}
