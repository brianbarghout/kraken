/**
 * KRAKEN headless sim — plays a random-orders game and prints a
 * turn-by-turn log so the engine can be eyeballed before any UI exists.
 *
 *   npm run sim                  random seed
 *   npm run sim -- --seed 42     fixed seed (replayable)
 *   npm run sim -- --log out.json  also dump the full JSON event log
 */
import { writeFileSync } from 'node:fs';
import { DefenderOrder, GameState, KrakenFireOrder, spawnDefenderAt } from '../engine/src/game';
import { createGameFromFiles } from '../engine/src/node';
import { checkOutcome, resolveTurn } from '../engine/src/turn';
import { axialToOffset, hexDistance, hexNeighbors, hexRange, offsetToAxial } from '../engine/src/hex';
import { hasLineOfSight } from '../engine/src/los';
import { inBounds, stepCostFor } from '../engine/src/map';
import {
  ALL_SYSTEMS,
  krakenSensorRange,
  krakenSpeed,
  targetableSystems,
  weaponAttack,
  weaponRange,
  WEAPON_SYSTEMS,
} from '../engine/src/kraken';
import { createRng } from '../engine/src/rng';
import { defenderAttack } from '../engine/src/units';
import type { Axial } from '../engine/src/hex';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const seed = Number(arg('seed') ?? Math.floor(Math.random() * 1_000_000));
const mapId = arg('map') ?? 'map01';
const logPath = arg('log');

const g = createGameFromFiles({ mapId, seed });
const ordersRng = createRng(seed ^ 0x5eed);

// standard defending force on the map's spawn hexes
const force = [
  'heavyTank',
  'heavyTank',
  'lightTank',
  'lightTank',
  'lightTank',
  'gev',
  'gev',
  'gev',
  'artillery',
  'artillery',
  'scoutBike',
  'scoutBike',
] as const;
force.forEach((type, i) =>
  spawnDefenderAt(g, type, `fleet-${type}`, g.map.defenderSpawns[i % g.map.defenderSpawns.length]!),
);

const fmt = (h: Axial) => {
  const { col, row } = axialToOffset(h);
  return `(${col},${row})`;
};

function freeHexNear(center: Axial, radius: number): Axial | undefined {
  const candidates = hexRange(center, radius).filter(
    (h) =>
      inBounds(g.map, h) &&
      !g.defenders.some((u) => u.state !== 'dead' && hexDistance(u.position, h) === 0) &&
      hexDistance(g.krakenPosition, h) > 0,
  );
  return candidates.length > 0 ? ordersRng.pick(candidates) : undefined;
}

// The choke gate on the road and the overlook hills beside it — where a
// defending force that reads the map would stand (GDD §8.4).
const GATE = offsetToAxial(13, 15);
const OVERLOOKS = [offsetToAxial(12, 9), offsetToAxial(13, 9), offsetToAxial(12, 18), offsetToAxial(13, 18)];

function defenderOrders(): DefenderOrder[] {
  const orders: DefenderOrder[] = [];
  for (const u of g.defenders) {
    const stats = g.data.defenders[u.type];
    const dist = hexDistance(u.position, g.krakenPosition);
    if (u.type === 'artillery') {
      const onHills = OVERLOOKS.some((h) => hexDistance(u.position, h) === 0);
      if (!onHills && !OVERLOOKS.every((h) => g.defenders.some((d) => hexDistance(d.position, h) === 0))) {
        const spot = OVERLOOKS.find((h) => !g.defenders.some((d) => hexDistance(d.position, h) === 0));
        if (spot && hexDistance(u.position, spot) > 0) {
          orders.push({ unitId: u.id, moveTo: spot, ...(dist <= stats.range ? { bombard: g.krakenPosition } : {}) });
          continue;
        }
      }
      const range = onHills ? (stats.special.ridgeRange ?? stats.range) : stats.range;
      if (dist <= range) {
        // lead the target by up to a hex
        const lead = ordersRng.pick(hexRange(g.krakenPosition, 1));
        orders.push({ unitId: u.id, bombard: hexDistance(u.position, lead) <= range ? lead : g.krakenPosition });
      }
      continue;
    }
    if (u.type === 'scoutBike') {
      const stalk = freeHexNear(g.krakenPosition, 3);
      if (dist > 3 && stalk) orders.push({ unitId: u.id, moveTo: stalk });
      continue;
    }
    const canShoot =
      dist <= stats.range &&
      defenderAttack(u, g.data) > 0 &&
      hasLineOfSight(g.map, u.position, g.krakenPosition);
    if (canShoot) {
      const targets = targetableSystems(g.kraken);
      const treads = targets.filter((s) => s === 'treadLeft' || s === 'treadRight');
      const system = treads.length > 0 && ordersRng.chance(0.7) ? ordersRng.pick(treads) : ordersRng.pick(targets);
      const order: DefenderOrder = { unitId: u.id, fireAtSystem: system };
      if (u.type === 'gev' && ordersRng.chance(0.7)) {
        const away = freeHexNear(u.position, 4);
        if (away && hexDistance(away, g.krakenPosition) > dist) order.scootTo = away;
      }
      orders.push(order);
    } else if (hexDistance(g.krakenPosition, GATE) > 8 && hexDistance(u.position, GATE) > 2) {
      // Kraken still far out: hold the gate instead of chasing
      const dest = freeHexNear(GATE, 2);
      if (dest) orders.push({ unitId: u.id, moveTo: dest });
    } else {
      const dest = freeHexNear(g.krakenPosition, 2);
      if (dest) orders.push({ unitId: u.id, moveTo: dest });
    }
  }
  return orders;
}

function krakenOrders() {
  const cp = g.map.commandPost;
  const fires: KrakenFireOrder[] = [];
  const sensor = krakenSensorRange(g.kraken, g.data);

  const cpVisible =
    hexDistance(g.krakenPosition, cp) <= weaponRange(g.data, 'mainBattery') &&
    hasLineOfSight(g.map, g.krakenPosition, cp);

  for (const weapon of WEAPON_SYSTEMS) {
    if (weaponAttack(g.kraken, g.data, weapon) <= 0) continue;
    if (weapon === 'mainBattery' && cpVisible) {
      fires.push({ weapon, targetCommandPost: true });
      continue;
    }
    const range = Math.min(weaponRange(g.data, weapon), sensor);
    const inRange = g.defenders.filter(
      (u) =>
        u.state !== 'dead' &&
        hexDistance(g.krakenPosition, u.position) <= range &&
        hasLineOfSight(g.map, g.krakenPosition, u.position),
    );
    if (inRange.length > 0) {
      fires.push({ weapon, targetUnitId: ordersRng.pick(inRange).id });
    } else if (
      (weapon === 'missileRack1' || weapon === 'missileRack2') &&
      g.defenders.length > 0 &&
      ordersRng.chance(0.25)
    ) {
      const victim = ordersRng.pick(g.defenders);
      if (hexDistance(g.krakenPosition, victim.position) <= weaponRange(g.data, weapon)) {
        fires.push({ weapon, targetHex: victim.position }); // counter-battery by last known position
      }
    }
  }

  // occasionally repair the worst system when hurt, or pop smoke under fire
  let repair;
  if (!g.kraken.repair && ordersRng.chance(0.3)) {
    const hurt = ALL_SYSTEMS.filter(
      (s) =>
        s !== 'repairPrinters' &&
        (g.kraken.systems[s] === 'red' || g.kraken.systems[s] === 'dark'),
    );
    if (hurt.length > 0) repair = ordersRng.pick(hurt);
  }
  const deploySmoke =
    g.kraken.smokeCooldown === 0 &&
    g.kraken.systems.smokeDispensers !== 'dark' &&
    ordersRng.chance(0.15);

  // advance on the CP
  const approach = hexNeighbors(cp).find(
    (h) => inBounds(g.map, h) && stepCostFor(g.map, 'kraken', cp, h) !== null,
  )!;
  return { moveTo: approach, fires, repair, deploySmoke };
}

const INTERESTING = new Set([
  'krakenMoved',
  'attackResolved',
  'targetEvaded',
  'overrun',
  'shellFired',
  'shellLanded',
  'blastHit',
  'systemStateChanged',
  'defenderStateChanged',
  'unitDestroyed',
  'smokeDeployed',
  'repairStarted',
  'repairCompleted',
  'commandPostStateChanged',
  'unitScooted',
  'gameEnded',
]);

function describeEvent(e: Record<string, unknown>): string | null {
  switch (e.type) {
    case 'krakenMoved':
      return `KRAKEN advances ${fmt(e.from as Axial)} -> ${fmt(e.to as Axial)}`;
    case 'unitScooted':
      return `${e.unitId} scoots away to ${fmt(e.to as Axial)}`;
    case 'attackResolved': {
      const target =
        e.target === 'commandPost'
          ? 'the COMMAND POST'
          : e.targetSystem
            ? `Kraken ${e.targetSystem}`
            : `${e.targetId}`;
      const who = e.attackerId === 'kraken' ? `KRAKEN ${e.weapon}` : `${e.attackerId}`;
      return `${who} fires at ${target} (atk ${e.attack} vs arm ${e.armour}) -> ${String(e.result).toUpperCase()}`;
    }
    case 'shellFired':
      return `${e.attackerId === 'kraken' ? `KRAKEN ${e.weapon}` : e.attackerId} fires ${e.mode} at ${fmt(e.target as Axial)} (scatter ${e.scatter}, lands T${e.landsTurn})`;
    case 'shellLanded':
      return `  shell from ${e.attackerId} lands at ${fmt(e.impact as Axial)} (aimed at ${fmt(e.target as Axial)})`;
    case 'blastHit':
      return `  blast hits ${e.target === 'kraken' ? `Kraken ${e.system}` : e.target} -> ${String(e.result).toUpperCase()}`;
    case 'systemStateChanged':
      return `  KRAKEN ${e.system} is now ${String(e.state).toUpperCase()}`;
    case 'defenderStateChanged':
      return e.state === 'dead' ? null : `  ${e.unitId} is now ${String(e.state).toUpperCase()}`;
    case 'unitDestroyed':
      return `  ${e.unitId} (${e.unitType}) DESTROYED`;
    case 'smokeDeployed':
      return `KRAKEN pops smoke at ${fmt(e.center as Axial)}`;
    case 'overrun':
      return `KRAKEN OVERRUNS ${e.unitType} ${e.unitId} -> ${String(e.result).toUpperCase()}`;
    case 'targetEvaded':
      return e.attackerId === 'kraken'
        ? `  ${e.targetId} EVADES KRAKEN ${e.weapon} (${e.reason})`
        : `  KRAKEN evades ${e.attackerId} (${e.reason})`;
    case 'repairStarted':
      return `KRAKEN printers start repairing ${e.system} (${e.turnsRequired} turns)`;
    case 'repairCompleted':
      return `KRAKEN ${e.system} repaired to ${String(e.state).toUpperCase()}`;
    case 'commandPostStateChanged':
      return `COMMAND POST is ${String(e.state).toUpperCase()}`;
    case 'gameEnded':
      return `GAME OVER — ${e.winner} win (${e.reason})`;
    default:
      return null;
  }
}

console.log(`=== KRAKEN sim — ${g.map.id} '${g.map.name}', seed ${seed} ===`);
console.log(
  `Kraken spawns ${fmt(g.krakenPosition)}; Command Post ${fmt(g.map.commandPost)}; ${g.defenders.length} defenders\n`,
);

while (!g.outcome) {
  const before = g.events.length;
  resolveTurn(g, { defenders: defenderOrders(), kraken: krakenOrders() });
  const hurt = Object.entries(g.kraken.systems)
    .filter(([, s]) => s !== 'green')
    .map(([id, s]) => `${id}:${s}`);
  console.log(
    `--- Turn ${g.turn} | Kraken ${fmt(g.krakenPosition)} spd ${krakenSpeed(g.kraken, g.data)} | ` +
      `CP ${hexDistance(g.krakenPosition, g.map.commandPost)} hexes | ` +
      `defenders ${g.defenders.length} | ${hurt.length ? hurt.join(' ') : 'all systems green'}`,
  );
  for (const e of g.events.slice(before)) {
    if (!INTERESTING.has(e.type)) continue;
    const line = describeEvent(e);
    if (line) console.log(`  ${line}`);
  }
}

const o = g.outcome ?? checkOutcome(g);
console.log(`\n=== RESULT: ${o!.winner.toUpperCase()} — ${o!.reason} on turn ${g.turn} ===`);
console.log(
  `Surviving defenders: ${g.defenders.length}; Kraken systems dark: ${
    Object.values(g.kraken.systems).filter((s) => s === 'dark').length
  }/12; events logged: ${g.events.length}`,
);

if (logPath) {
  writeFileSync(logPath, JSON.stringify({ seed, mapId, events: g.events }, null, 2));
  console.log(`Event log written to ${logPath}`);
}
