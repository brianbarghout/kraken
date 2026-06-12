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
import { Axial, hexDistance, hexEquals, hexRange } from './hex';
import {
  applySystemDamage,
  armourOfSystem,
  isKrakenDestroyed,
  krakenSpeed,
  startRepair,
  systemKind,
  targetableSystems,
  tickRepair,
  weaponAttack,
} from './kraken';
import { hasLineOfSight } from './los';
import { inBounds, stepCostFor, terrainAt, MoverKind } from './map';
import {
  krakenFireCheckCommandPost,
  krakenFireCheckHex,
  krakenFireCheckUnit,
  planMove,
} from './targeting';
import { applyDamageToDefender, defenderAttack, defenderSpeed, DefenderUnit } from './units';

function emit(state: GameState, phase: TurnPhase, type: string, payload: object = {}): GameEvent {
  const event: GameEvent = { type, turn: state.turn, phase, ...payload };
  state.events.push(event);
  return event;
}

function reject(state: GameState, phase: TurnPhase, reason: string, payload: object = {}): void {
  emit(state, phase, 'orderRejected', { reason, ...payload });
}

/**
 * Move a unit toward `destination` spending at most `mp` movement points,
 * using the shared planMove pathing (same logic the UI previews).
 */
function moveUnit(
  state: GameState,
  mover: MoverKind,
  moverId: string,
  from: Axial,
  destination: Axial,
  mp: number,
): { to: Axial; mpSpent: number } | { rejected: string } {
  const plan = planMove(state, mover, moverId, from, destination, mp);
  if (!plan) return { rejected: 'no legal path to destination' };
  let spent = 0;
  for (let i = 1; i <= plan.reachableIndex; i++) {
    spent += stepCostFor(state.map, mover, plan.path[i - 1]!, plan.path[i]!)!;
  }
  return { to: plan.path[plan.reachableIndex]!, mpSpent: Math.min(spent, mp) };
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

const CP_LADDER = ['green', 'amber', 'red', 'destroyed'] as const;

/**
 * The CP is a hardened structure: immune to outright kill results — every
 * successful hit steps it one rung down green -> amber -> red -> destroyed
 * (DECISIONS.md D13). ~3 main-battery hits or sustained secondary fire.
 */
function damageCommandPost(state: GameState, phase: TurnPhase, result: 'damage' | 'kill'): void {
  const cp = state.commandPost;
  if (state.data.commandPost.immuneToKill) {
    cp.state = CP_LADDER[Math.min(CP_LADDER.indexOf(cp.state) + 1, 3)]!;
  } else {
    cp.state = result === 'kill' || cp.state !== 'green' ? 'destroyed' : 'amber';
  }
  emit(state, phase, 'commandPostStateChanged', { state: cp.state });
}

// ---------------------------------------------------------------- movement

/**
 * Resolve the Kraken grinding through a defender's hex (P3, D41).
 * Soft targets (armour below the threshold) are crushed outright; tanks
 * get a 50/50 damage roll and block the advance while they live — a
 * damaged tank overrun again dies. Every tank overrun risks a tread.
 */
function resolveOverrun(state: GameState, unit: DefenderUnit): 'passed' | 'blocked' {
  const phase: TurnPhase = 'movement';
  const armour = state.data.defenders[unit.type].armour;
  const hard = armour >= state.data.overrun.hardArmourThreshold;
  let result: 'killed' | 'damaged' | 'repelled';
  if (!hard) {
    result = 'killed';
  } else if (unit.state === 'amber') {
    result = 'killed'; // already broken — ground under the treads
  } else {
    result = state.rng.chance(state.data.combat.damageRollChance) ? 'damaged' : 'repelled';
  }
  emit(state, phase, 'overrun', {
    unitId: unit.id,
    unitType: unit.type,
    result,
    hex: unit.position,
  });
  if (result === 'killed') damageDefender(state, phase, unit, 'kill');
  if (result === 'damaged') damageDefender(state, phase, unit, 'damage');
  // grinding through armour chews the running gear
  if (hard && state.rng.chance(state.data.overrun.treadRiskChance)) {
    const treads = (['treadLeft', 'treadRight'] as const).filter(
      (t) => state.kraken.systems[t] !== 'dark',
    );
    if (treads.length > 0) {
      damageKrakenSystem(state, phase, state.rng.pick(treads), 'damage');
    }
  }
  return result === 'killed' ? 'passed' : 'blocked';
}

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
      const plan = planMove(state, 'kraken', 'kraken', state.krakenPosition, k.moveTo, mp);
      if (!plan) {
        reject(state, phase, 'no legal path to destination', { unitId: 'kraken' });
      } else {
        // step-walk: overruns resolve hex by hex as the machine advances
        const from = state.krakenPosition;
        let current = from;
        let spent = 0;
        for (let i = 1; i <= plan.reachableIndex; i++) {
          const next = plan.path[i]!;
          const occupant = state.defenders.find(
            (u) => u.state !== 'dead' && hexEquals(u.position, next),
          );
          if (occupant && resolveOverrun(state, occupant) === 'blocked') break;
          spent += stepCostFor(state.map, 'kraken', current, next)!;
          current = next;
        }
        if (!hexEquals(current, from)) {
          state.krakenPosition = current;
          emit(state, phase, 'krakenMoved', { from, to: current, mpSpent: Math.min(spent, mp) });
        }
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
  // direct fire re-validates against the post-movement position — a target
  // out of envelope at resolution has evaded (DECISIONS.md D36)
  if (dist > stats.range) {
    emit(state, phase, 'targetEvaded', {
      attackerId: unit.id,
      target: 'kraken',
      reason: 'out of range',
    });
    return;
  }
  if (!hasLineOfSight(state.map, unit.position, state.krakenPosition)) {
    emit(state, phase, 'targetEvaded', {
      attackerId: unit.id,
      target: 'kraken',
      reason: 'no line of sight',
    });
    return;
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

    if (fire.targetHex) {
      // indirect — missiles only (GDD §8.5: can fire blind)
      const err = krakenFireCheckHex(state, fire.weapon, fire.targetHex);
      if (err) {
        reject(state, phase, err, { weapon: fire.weapon });
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
      const err = krakenFireCheckCommandPost(state, fire.weapon);
      if (err) {
        reject(state, phase, err, { weapon: fire.weapon });
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
      const err = krakenFireCheckUnit(state, fire.weapon, fire.targetUnitId);
      if (err) {
        // range/sensor/LOS failures at resolution mean the target evaded
        // (positions are post-movement, re-validated — D36)
        if (err === 'target out of range' || err === 'target outside sensor range' || err === 'no line of sight') {
          emit(state, phase, 'targetEvaded', {
            attackerId: 'kraken',
            weapon: fire.weapon,
            targetId: fire.targetUnitId,
            reason: err,
          });
        } else {
          reject(state, phase, err, { weapon: fire.weapon });
        }
        continue;
      }
      const target = defenderById(state, fire.targetUnitId)!;
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
