/**
 * WeGo turn resolver (GDD §8.1):
 * orders -> movement -> combat -> artillery landing -> repair -> status.
 */
import { resolveAttack } from './combat';
import {
  DefenderOrder,
  GameEvent,
  GameState,
  KrakenOrder,
  Outcome,
  Shell,
  TurnOrders,
  TurnPhase,
} from './game';
import { aStar, Axial, hexDistance, hexEquals, hexKey, hexRange } from './hex';
import {
  applySystemDamage,
  armourOfSystem,
  isKrakenDestroyed,
  krakenSensorRange,
  krakenSpeed,
  startRepair,
  systemKind,
  targetableSystems,
  tickRepair,
  weaponAttack,
  weaponRange,
} from './kraken';
import { hasLineOfSight } from './los';
import { inBounds, stepCostFor, terrainAt, MoverKind } from './map';
import { applyDamageToDefender, defenderAttack, defenderSpeed, DefenderUnit } from './units';

function emit(state: GameState, phase: TurnPhase, type: string, payload: object = {}): GameEvent {
  const event: GameEvent = { type, turn: state.turn, phase, ...payload };
  state.events.push(event);
  return event;
}

function reject(state: GameState, phase: TurnPhase, reason: string, payload: object = {}): void {
  emit(state, phase, 'orderRejected', { reason, ...payload });
}

/** Hexes no unit may enter: every occupied hex plus the Command Post. */
function blockedHexes(state: GameState, except?: string): Set<string> {
  const blocked = new Set<string>([hexKey(state.map.commandPost)]);
  if (except !== 'kraken') blocked.add(hexKey(state.krakenPosition));
  for (const u of state.defenders) {
    if (u.state !== 'dead' && u.id !== except) blocked.add(hexKey(u.position));
  }
  return blocked;
}

/**
 * Move a unit toward `destination` spending at most `mp` movement points.
 * Minimum-move rule (DECISIONS.md): a unit that could not otherwise move
 * may always take one legal step.
 */
function moveUnit(
  state: GameState,
  mover: MoverKind,
  moverId: string,
  from: Axial,
  destination: Axial,
  mp: number,
): { to: Axial; mpSpent: number } | { rejected: string } {
  if (!inBounds(state.map, destination)) return { rejected: 'destination out of bounds' };
  const blocked = blockedHexes(state, moverId);
  if (blocked.has(hexKey(destination))) return { rejected: 'destination occupied' };
  const result = aStar(from, destination, (a, b) => {
    if (!inBounds(state.map, b) || blocked.has(hexKey(b))) return null;
    return stepCostFor(state.map, mover, a, b);
  });
  if (!result || result.path.length < 2) return { rejected: 'no path to destination' };

  let spent = 0;
  let reached = from;
  for (let i = 1; i < result.path.length; i++) {
    const step = stepCostFor(state.map, mover, result.path[i - 1]!, result.path[i]!)!;
    if (spent + step > mp) break;
    spent += step;
    reached = result.path[i]!;
  }
  if (hexEquals(reached, from) && mp > 0) {
    // minimum-move rule: one hex per turn is always possible
    reached = result.path[1]!;
    spent = mp;
  }
  return { to: reached, mpSpent: spent };
}

function defenderById(state: GameState, id: string): DefenderUnit | undefined {
  return state.defenders.find((u) => u.id === id && u.state !== 'dead');
}

function isHexInSmoke(state: GameState, hex: Axial): boolean {
  return state.smokeClouds.some(
    (c) => state.turn <= c.expiresTurn && c.hexes.some((h) => hexEquals(h, hex)),
  );
}

/** A living friendly scout within reveal radius of the hex enables spotted fire (GDD §8.2). */
function isSpotted(state: GameState, hex: Axial): boolean {
  const radius = state.data.defenders.scoutBike.special.revealRadius ?? 0;
  return state.defenders.some(
    (u) => u.type === 'scoutBike' && u.state !== 'dead' && hexDistance(u.position, hex) <= radius,
  );
}

function damageKrakenSystem(
  state: GameState,
  phase: TurnPhase,
  system: Parameters<typeof applySystemDamage>[1],
  result: 'damage' | 'kill',
): void {
  const newState = applySystemDamage(state.kraken, system, result);
  emit(state, phase, 'systemStateChanged', { system, state: newState });
}

function damageDefender(
  state: GameState,
  phase: TurnPhase,
  unit: DefenderUnit,
  result: 'damage' | 'kill',
  opts: { fromMainBattery?: boolean } = {},
): void {
  applyDamageToDefender(unit, result, state.data, state.rng, opts);
  emit(state, phase, 'defenderStateChanged', { unitId: unit.id, state: unit.state });
  if (unit.state === 'dead') {
    emit(state, phase, 'unitDestroyed', { unitId: unit.id, unitType: unit.type });
  }
}

function damageCommandPost(state: GameState, phase: TurnPhase, result: 'damage' | 'kill'): void {
  const cp = state.commandPost;
  cp.state = result === 'kill' || cp.state === 'amber' ? 'destroyed' : 'amber';
  emit(state, phase, 'commandPostStateChanged', { state: cp.state });
}

// ---------------------------------------------------------------- movement

function movementPhase(state: GameState, orders: TurnOrders): void {
  const phase: TurnPhase = 'movement';
  const k = orders.kraken;

  // Kraken first (deterministic processing of simultaneous moves)
  if (k.moveTo) {
    let mp = krakenSpeed(state.kraken, state.data);
    if (k.repair) mp = Math.min(mp, state.data.kraken.repair.maxSpeedWhileRepairing);
    if (mp <= 0) {
      reject(state, phase, 'kraken is immobilised', { unitId: 'kraken' });
    } else {
      const moved = moveUnit(state, 'kraken', 'kraken', state.krakenPosition, k.moveTo, mp);
      if ('rejected' in moved) {
        reject(state, phase, moved.rejected, { unitId: 'kraken' });
      } else {
        const from = state.krakenPosition;
        state.krakenPosition = moved.to;
        emit(state, phase, 'krakenMoved', { from, to: moved.to, mpSpent: moved.mpSpent });
      }
    }
  }

  // Defenders: fastest first, id as deterministic tiebreak
  const moves = orders.defenders
    .filter((o) => o.moveTo && !o.scootTo)
    .map((o) => ({ order: o, unit: defenderById(state, o.unitId) }))
    .filter((m): m is { order: DefenderOrder; unit: DefenderUnit } => m.unit !== undefined)
    .sort(
      (a, b) =>
        defenderSpeed(b.unit, state.data) - defenderSpeed(a.unit, state.data) ||
        a.unit.id.localeCompare(b.unit.id),
    );

  for (const { order, unit } of moves) {
    let mp = defenderSpeed(unit, state.data);
    if (order.bombard && state.data.defenders[unit.type].special.speedOnFiringTurn !== undefined) {
      mp = Math.min(mp, state.data.defenders[unit.type].special.speedOnFiringTurn!);
    }
    const moved = moveUnit(state, unit.type, unit.id, unit.position, order.moveTo!, mp);
    if ('rejected' in moved) {
      reject(state, phase, moved.rejected, { unitId: unit.id });
    } else {
      const from = unit.position;
      unit.position = moved.to;
      emit(state, phase, 'unitMoved', { unitId: unit.id, from, to: moved.to, mpSpent: moved.mpSpent });
    }
  }

  // Smoke deploys at the Kraken's post-movement position
  if (k.deploySmoke) {
    const smoke = state.data.kraken.smoke;
    if (state.kraken.systems.smokeDispensers === 'dark') {
      reject(state, phase, 'smoke dispensers destroyed', { unitId: 'kraken' });
    } else if (state.kraken.smokeCooldown > 0) {
      reject(state, phase, 'smoke dispensers recharging', { unitId: 'kraken' });
    } else {
      const hexes = hexRange(state.krakenPosition, smoke.radius);
      const expiresTurn = state.turn + smoke.durationTurns;
      state.smokeClouds.push({ hexes, expiresTurn });
      state.kraken.smokeCooldown = smoke.cooldownTurns;
      emit(state, phase, 'smokeDeployed', { center: state.krakenPosition, expiresTurn });
    }
  }
}

// ------------------------------------------------------------------ combat

function defenderDirectFire(state: GameState, order: DefenderOrder, unit: DefenderUnit): void {
  const phase: TurnPhase = 'combat';
  const stats = state.data.defenders[unit.type];
  if (stats.special.indirect) {
    return reject(state, phase, 'artillery fires parabolic — use bombard', { unitId: unit.id });
  }
  const attack = defenderAttack(unit, state.data);
  if (attack <= 0) {
    return reject(state, phase, 'unit has no weapon', { unitId: unit.id });
  }
  const system = order.fireAtSystem!;
  const dist = hexDistance(unit.position, state.krakenPosition);
  if (dist > stats.range) {
    return reject(state, phase, 'target out of range', { unitId: unit.id });
  }
  if (!hasLineOfSight(state.map, unit.position, state.krakenPosition)) {
    return reject(state, phase, 'no line of sight', { unitId: unit.id });
  }
  if (!targetableSystems(state.kraken).includes(system)) {
    return reject(state, phase, 'system not targetable', { unitId: unit.id, system });
  }
  const autoDamage =
    stats.special.autoDamageVsTreads === true && systemKind(system) === 'tread';
  const armour = armourOfSystem(state.data, system);
  const result = resolveAttack(attack, armour, state.data, state.rng, { autoDamage });
  emit(state, phase, 'attackResolved', {
    attackerId: unit.id,
    targetSystem: system,
    attack,
    armour,
    result,
  });
  if (result === 'kill' || result === 'damage') {
    damageKrakenSystem(state, phase, system, result);
  }
}

function defenderBombard(state: GameState, order: DefenderOrder, unit: DefenderUnit): void {
  const phase: TurnPhase = 'combat';
  const stats = state.data.defenders[unit.type];
  if (!stats.special.indirect) {
    return reject(state, phase, 'unit cannot bombard', { unitId: unit.id });
  }
  const target = order.bombard!;
  if (!inBounds(state.map, target)) {
    return reject(state, phase, 'bombard target out of bounds', { unitId: unit.id });
  }
  const onHills = terrainAt(state.map, unit.position).id === 'hills';
  const range = onHills ? (stats.special.ridgeRange ?? stats.range) : stats.range;
  if (hexDistance(unit.position, target) > range) {
    return reject(state, phase, 'bombard target out of range', { unitId: unit.id });
  }
  const scatterTable = state.data.artilleryFire.scatter;
  let scatter: number;
  let mode: string;
  if (hasLineOfSight(state.map, unit.position, target)) {
    scatter = scatterTable.aimed;
    mode = 'aimed';
  } else if (isSpotted(state, target)) {
    scatter = scatterTable.spotted;
    mode = 'spotted';
  } else {
    scatter = scatterTable.blind;
    mode = 'blind';
  }
  const shell: Shell = {
    attackerId: unit.id,
    target,
    attack: defenderAttack(unit, state.data),
    scatter,
    landsTurn: state.turn + state.data.artilleryFire.landingDelayTurns,
  };
  state.shells.push(shell);
  emit(state, phase, 'shellFired', {
    attackerId: unit.id,
    target,
    mode,
    scatter,
    landsTurn: shell.landsTurn,
  });
}

function krakenFire(state: GameState, orders: KrakenOrder): void {
  const phase: TurnPhase = 'combat';
  const firedWeapons = new Set<string>();
  for (const fire of orders.fires ?? []) {
    if (firedWeapons.has(fire.weapon)) {
      reject(state, phase, 'weapon already fired this turn', { weapon: fire.weapon });
      continue;
    }
    const attack = weaponAttack(state.kraken, state.data, fire.weapon);
    if (attack <= 0) {
      reject(state, phase, 'weapon destroyed', { weapon: fire.weapon });
      continue;
    }
    firedWeapons.add(fire.weapon);
    const range = weaponRange(state.data, fire.weapon);

    if (fire.targetHex) {
      // indirect — missiles only (GDD §8.5: can fire blind)
      const isMissile = fire.weapon === 'missileRack1' || fire.weapon === 'missileRack2';
      if (!isMissile) {
        reject(state, phase, 'only missiles fire at hexes', { weapon: fire.weapon });
        continue;
      }
      if (!inBounds(state.map, fire.targetHex)) {
        reject(state, phase, 'target hex out of bounds', { weapon: fire.weapon });
        continue;
      }
      if (hexDistance(state.krakenPosition, fire.targetHex) > range) {
        reject(state, phase, 'target hex out of range', { weapon: fire.weapon });
        continue;
      }
      const aimed = hasLineOfSight(state.map, state.krakenPosition, fire.targetHex);
      const scatter = aimed
        ? state.data.artilleryFire.scatter.aimed
        : state.data.artilleryFire.scatter.blind;
      const shell: Shell = {
        attackerId: 'kraken',
        weapon: fire.weapon,
        target: fire.targetHex,
        attack,
        scatter,
        landsTurn: state.turn + state.data.artilleryFire.landingDelayTurns,
      };
      state.shells.push(shell);
      emit(state, phase, 'shellFired', {
        attackerId: 'kraken',
        weapon: fire.weapon,
        target: fire.targetHex,
        mode: aimed ? 'aimed' : 'blind',
        scatter,
        landsTurn: shell.landsTurn,
      });
      continue;
    }

    if (fire.targetCommandPost) {
      const cpHex = state.map.commandPost;
      if (state.commandPost.state === 'destroyed') {
        reject(state, phase, 'command post already destroyed', { weapon: fire.weapon });
        continue;
      }
      if (hexDistance(state.krakenPosition, cpHex) > range) {
        reject(state, phase, 'command post out of range', { weapon: fire.weapon });
        continue;
      }
      if (!hasLineOfSight(state.map, state.krakenPosition, cpHex)) {
        reject(state, phase, 'no line of sight to command post', { weapon: fire.weapon });
        continue;
      }
      const armour = state.data.commandPost.armour;
      const result = resolveAttack(attack, armour, state.data, state.rng);
      emit(state, phase, 'attackResolved', {
        attackerId: 'kraken',
        weapon: fire.weapon,
        target: 'commandPost',
        attack,
        armour,
        result,
      });
      if (result === 'kill' || result === 'damage') {
        damageCommandPost(state, phase, result);
      }
      continue;
    }

    if (fire.targetUnitId) {
      const target = defenderById(state, fire.targetUnitId);
      if (!target) {
        reject(state, phase, 'target gone', { weapon: fire.weapon });
        continue;
      }
      const dist = hexDistance(state.krakenPosition, target.position);
      if (dist > range) {
        reject(state, phase, 'target out of range', { weapon: fire.weapon });
        continue;
      }
      if (dist > krakenSensorRange(state.kraken, state.data)) {
        reject(state, phase, 'target outside sensor range', { weapon: fire.weapon });
        continue;
      }
      if (!hasLineOfSight(state.map, state.krakenPosition, target.position)) {
        reject(state, phase, 'no line of sight', { weapon: fire.weapon });
        continue;
      }
      const armour = state.data.defenders[target.type].armour;
      const result = resolveAttack(attack, armour, state.data, state.rng);
      emit(state, phase, 'attackResolved', {
        attackerId: 'kraken',
        weapon: fire.weapon,
        targetId: target.id,
        attack,
        armour,
        result,
      });
      if (result === 'kill' || result === 'damage') {
        damageDefender(state, 'combat', target, result, {
          fromMainBattery: fire.weapon === 'mainBattery',
        });
      }
      continue;
    }

    reject(state, phase, 'fire order has no target', { weapon: fire.weapon });
  }
}

function combatPhase(state: GameState, orders: TurnOrders): void {
  // defender direct fire, deterministic by unit id
  const sorted = [...orders.defenders].sort((a, b) => a.unitId.localeCompare(b.unitId));
  for (const order of sorted) {
    const unit = defenderById(state, order.unitId);
    if (!unit) continue;
    if (order.fireAtSystem) defenderDirectFire(state, order, unit);
    if (order.bombard) defenderBombard(state, order, unit);
  }

  krakenFire(state, orders.kraken);

  // GEV shoot-and-scoot: move after combat (GDD §8.5)
  for (const order of sorted) {
    if (!order.scootTo) continue;
    const unit = defenderById(state, order.unitId);
    if (!unit) continue;
    if (state.data.defenders[unit.type].special.shootAndScoot !== true) {
      reject(state, 'combat', 'unit cannot shoot-and-scoot', { unitId: unit.id });
      continue;
    }
    const moved = moveUnit(
      state,
      unit.type,
      unit.id,
      unit.position,
      order.scootTo,
      defenderSpeed(unit, state.data),
    );
    if ('rejected' in moved) {
      reject(state, 'combat', moved.rejected, { unitId: unit.id });
    } else {
      const from = unit.position;
      unit.position = moved.to;
      emit(state, 'combat', 'unitScooted', { unitId: unit.id, from, to: moved.to });
    }
  }
}

// ------------------------------------------------------- artillery landing

function artilleryLandingPhase(state: GameState): void {
  const phase: TurnPhase = 'artillery';
  const landing = state.shells.filter((s) => s.landsTurn === state.turn);
  state.shells = state.shells.filter((s) => s.landsTurn !== state.turn);

  for (const shell of landing) {
    let scatter = shell.scatter;
    if (isHexInSmoke(state, shell.target)) {
      scatter += state.data.kraken.smoke.scatterPenalty;
    }
    const candidates = hexRange(shell.target, scatter).filter((h) => inBounds(state.map, h));
    const impact = state.rng.pick(candidates);
    emit(state, phase, 'shellLanded', {
      attackerId: shell.attackerId,
      target: shell.target,
      impact,
      scatter,
    });

    const splashAttack = Math.floor(shell.attack * state.data.artilleryFire.splashAttackMultiplier);
    const zones: { hexes: Axial[]; attack: number }[] = [
      { hexes: [impact], attack: shell.attack },
      {
        hexes: hexRange(impact, state.data.artilleryFire.splashRadius).filter(
          (h) => !hexEquals(h, impact),
        ),
        attack: splashAttack,
      },
    ];

    for (const zone of zones) {
      if (zone.attack <= 0) continue;
      for (const hex of zone.hexes) {
        // Kraken in blast: a random targetable system is struck
        if (hexEquals(state.krakenPosition, hex)) {
          const systems = targetableSystems(state.kraken);
          if (systems.length > 0) {
            const system = state.rng.pick(systems);
            const armour = armourOfSystem(state.data, system);
            const result = resolveAttack(zone.attack, armour, state.data, state.rng);
            emit(state, phase, 'blastHit', {
              target: 'kraken',
              system,
              attack: zone.attack,
              armour,
              result,
            });
            if (result === 'kill' || result === 'damage') {
              damageKrakenSystem(state, phase, system, result);
            }
          }
        }
        // Command post in blast
        if (hexEquals(state.map.commandPost, hex) && state.commandPost.state !== 'destroyed') {
          const result = resolveAttack(zone.attack, state.data.commandPost.armour, state.data, state.rng);
          emit(state, phase, 'blastHit', { target: 'commandPost', attack: zone.attack, result });
          if (result === 'kill' || result === 'damage') {
            damageCommandPost(state, phase, result);
          }
        }
        // Defenders in blast — friendly fire is real (GDD §8.3)
        for (const unit of state.defenders) {
          if (unit.state === 'dead' || !hexEquals(unit.position, hex)) continue;
          const armour = state.data.defenders[unit.type].armour;
          const result = resolveAttack(zone.attack, armour, state.data, state.rng);
          emit(state, phase, 'blastHit', {
            target: unit.id,
            attack: zone.attack,
            armour,
            result,
          });
          if (result === 'kill' || result === 'damage') {
            damageDefender(state, phase, unit, result);
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------ repair

function repairPhase(state: GameState, orders: TurnOrders): void {
  const phase: TurnPhase = 'repair';
  if (orders.kraken.repair) {
    try {
      startRepair(state.kraken, state.data, orders.kraken.repair);
      emit(state, phase, 'repairStarted', {
        system: orders.kraken.repair,
        turnsRequired: state.kraken.repair!.turnsRequired,
      });
    } catch (err) {
      reject(state, phase, (err as Error).message, { system: orders.kraken.repair });
    }
  }
  if (state.kraken.repair) {
    const job = state.kraken.repair;
    tickRepair(state.kraken, state.data);
    if (state.kraken.repair === null) {
      emit(state, phase, 'repairCompleted', {
        system: job.system,
        state: state.kraken.systems[job.system],
      });
    } else {
      emit(state, phase, 'repairTick', {
        system: job.system,
        progress: job.progress,
        turnsRequired: job.turnsRequired,
      });
    }
  }
  if (state.kraken.smokeCooldown > 0) state.kraken.smokeCooldown--;
  state.smokeClouds = state.smokeClouds.filter((c) => c.expiresTurn > state.turn);
}

// ------------------------------------------------------------------ status

export function checkOutcome(state: GameState): Outcome | null {
  const krakenDead = isKrakenDestroyed(state.kraken);
  const cpDead = state.commandPost.state === 'destroyed';
  if (krakenDead && cpDead) return { winner: 'draw', reason: 'mutualDestruction' };
  if (cpDead) return { winner: 'kraken', reason: 'commandPostDestroyed' };
  if (krakenDead) return { winner: 'defenders', reason: 'krakenDestroyed' };
  if (state.turn >= state.data.game.turnLimit) {
    return { winner: 'defenders', reason: 'timeout' };
  }
  return null;
}

function statusPhase(state: GameState): void {
  const phase: TurnPhase = 'status';
  state.defenders = state.defenders.filter((u) => u.state !== 'dead');
  const outcome = checkOutcome(state);
  if (outcome) {
    state.outcome = outcome;
    emit(state, phase, 'gameEnded', { winner: outcome.winner, reason: outcome.reason });
  }
}

// ----------------------------------------------------------------- resolve

export function resolveTurn(state: GameState, orders: TurnOrders): void {
  if (state.outcome) {
    throw new Error(`game is over: ${state.outcome.winner} (${state.outcome.reason})`);
  }
  state.turn++;
  emit(state, 'orders', 'turnStart', {
    ordersIssued: orders.defenders.length + (Object.keys(orders.kraken).length > 0 ? 1 : 0),
  });
  movementPhase(state, orders);
  combatPhase(state, orders);
  artilleryLandingPhase(state);
  repairPhase(state, orders);
  statusPhase(state);
}
