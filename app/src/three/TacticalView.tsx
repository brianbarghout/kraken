import { useEffect, useRef } from 'react';
import { GameMap } from '../../../engine/src/map';
import { PickResult, SceneSnapshot, TacticalScene } from './scene';

export function TacticalView({
  map,
  snapshot,
  onPick,
  sceneRef,
}: {
  map: GameMap;
  snapshot: SceneSnapshot;
  onPick: (pick: PickResult) => void;
  sceneRef: React.MutableRefObject<TacticalScene | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new TacticalScene(canvas, map);
    scene.onPick = (p) => onPickRef.current(p);
    sceneRef.current = scene;

    const resize = () => {
      const parent = canvas.parentElement!;
      scene.resize(parent.clientWidth, parent.clientHeight);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    sceneRef.current?.update(snapshot);
  }, [snapshot, sceneRef]);

  return <canvas ref={canvasRef} className="gl" />;
}
