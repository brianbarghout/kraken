/**
 * Hex grid primitives — axial coordinates (pointy-top, odd-r offset storage
 * in map files). GDD §6.3: hexagonal grid, wargame-native.
 */

export interface Axial {
  readonly q: number;
  readonly r: number;
}

export function axial(q: number, r: number): Axial {
  return { q, r };
}

export function hexKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q: q!, r: r! };
}

export function hexEquals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

/** Map-file storage is odd-r offset (rows of strings); engine works in axial. */
export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(h: Axial): { col: number; row: number } {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(h: Axial): Axial[] {
  return HEX_DIRECTIONS.map((d) => hexAdd(h, d));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

interface Cube {
  x: number;
  y: number;
  z: number;
}

function axialToCube(h: Axial): Cube {
  return { x: h.q, y: -h.q - h.r, z: h.r };
}

function cubeRound(c: Cube): Axial {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x);
  const dy = Math.abs(ry - c.y);
  const dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx + 0, r: rz + 0 }; // +0 normalises IEEE negative zero
}

/**
 * Hexes on the straight line from a to b inclusive — the raycast used by
 * line-of-sight (GDD §6.2). A tiny epsilon nudge avoids ambiguous midpoints.
 */
export function hexLine(a: Axial, b: Axial): Axial[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  const results: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    results.push(
      cubeRound({
        x: ac.x + (bc.x - ac.x) * t + 1e-6,
        y: ac.y + (bc.y - ac.y) * t + 2e-6,
        z: ac.z + (bc.z - ac.z) * t - 3e-6,
      }),
    );
  }
  return results;
}

/** All hexes within `radius` of `center`, centre included. */
export function hexRange(center: Axial, radius: number): Axial[] {
  const results: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

/**
 * Movement cost of stepping from one hex to an adjacent hex.
 * Return null for impassable. Direction-aware so hill climb/descend
 * can differ (GDD §6.2).
 */
export type StepCost = (from: Axial, to: Axial) => number | null;

export interface PathResult {
  path: Axial[];
  cost: number;
}

/**
 * A* on the hex grid. Search is bounded to hexes within `maxRadius` of the
 * straight start→goal corridor so unreachable goals terminate.
 */
export function aStar(
  start: Axial,
  goal: Axial,
  stepCost: StepCost,
  maxRadius = 50,
): PathResult | null {
  if (hexEquals(start, goal)) return { path: [start], cost: 0 };

  const startKey = hexKey(start);
  const goalKey = hexKey(goal);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, string>();
  const hexes = new Map<string, Axial>([[startKey, start]]);
  // simple binary-heap-free open list; engine maps are small enough
  const open: { key: string; f: number }[] = [{ key: startKey, f: hexDistance(start, goal) }];
  const closed = new Set<string>();

  const inBounds = (h: Axial) =>
    hexDistance(h, start) + hexDistance(h, goal) <= hexDistance(start, goal) + 2 * maxRadius;

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0]!;
    if (current.key === goalKey) {
      const path: Axial[] = [];
      let k: string | undefined = goalKey;
      while (k !== undefined) {
        path.unshift(hexes.get(k)!);
        k = cameFrom.get(k);
      }
      return { path, cost: gScore.get(goalKey)! };
    }
    if (closed.has(current.key)) continue;
    closed.add(current.key);

    const currentHex = hexes.get(current.key)!;
    for (const nb of hexNeighbors(currentHex)) {
      if (!inBounds(nb)) continue;
      const nbKey = hexKey(nb);
      if (closed.has(nbKey)) continue;
      const step = stepCost(currentHex, nb);
      if (step === null) continue;
      const tentative = gScore.get(current.key)! + step;
      if (tentative < (gScore.get(nbKey) ?? Infinity)) {
        gScore.set(nbKey, tentative);
        cameFrom.set(nbKey, current.key);
        hexes.set(nbKey, nb);
        open.push({ key: nbKey, f: tentative + hexDistance(nb, goal) });
      }
    }
  }
  return null;
}
