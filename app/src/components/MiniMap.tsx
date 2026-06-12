/**
 * Strategic mini-map (GDD §7.1, Kraken side): full battlefield outline,
 * Command Post marker, own position. Canvas, corner overlay.
 */
import { useEffect, useRef } from 'react';
import { TerrainId } from '../../../engine/src/data';
import { axialToOffset, offsetToAxial } from '../../../engine/src/hex';
import { GameMap, terrainAt } from '../../../engine/src/map';
import { Axial } from '../../../engine/src/hex';

const TERRAIN_COLOR: Record<TerrainId, string> = {
  open: '#3c4a35',
  road: '#52564e',
  forest: '#1f3d23',
  hills: '#5c5236',
  mountain: '#4f4f55',
  river: '#1f4364',
  swamp: '#33402e',
  rubble: '#494139',
};

export function MiniMap({ map, krakenPos }: { map: GameMap; krakenPos: Axial }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = Math.max(3, Math.floor(170 / map.width));
  const w = map.width * cell + cell;
  const h = map.height * cell + cell;

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const t = terrainAt(map, offsetToAxial(col, row)).id;
        ctx.fillStyle = TERRAIN_COLOR[t];
        ctx.fillRect(col * cell + (row % 2 ? cell / 2 : 0), row * cell, cell - 0.5, cell - 0.5);
      }
    }
    // command post
    const cp = axialToOffset(map.commandPost);
    ctx.fillStyle = '#6fb9e8';
    ctx.fillRect(cp.col * cell - 1 + (cp.row % 2 ? cell / 2 : 0), cp.row * cell - 1, cell + 2, cell + 2);
    // the Kraken — always visible, it's a 200-tonne machine
    const k = axialToOffset(krakenPos);
    const kx = k.col * cell + (k.row % 2 ? cell / 2 : 0) + cell / 2;
    const ky = k.row * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(kx, ky, cell, 0, Math.PI * 2);
    ctx.strokeStyle = '#59d68b';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(kx, ky, cell / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#59d68b';
    ctx.fill();
  }, [map, krakenPos, cell, w, h]);

  return <canvas ref={ref} className="minimap" width={w} height={h} />;
}
