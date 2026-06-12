/**
 * Solo game controller — all UI logic that doesn't touch the DOM.
 * Wraps the engine: assembles the player's Kraken orders, validates them
 * through engine targeting (single source of truth), resolves turns
 * against the Tier 1 AI, and derives summary data from the event log.
 */
import { createTier1AI, Tier1AI } from '../../../engine/src/ai';
import { UnitData } from '../../../engine/src/data';
import { GameEvent, GameState, KrakenFireOrder } from '../../../engine/src/game';
import { Axial } from '../../../engine/src/hex';
import { KrakenSystemId } from '../../../engine/src/kraken';
import { GameMap } from '../../../engine/src/map';
import { createSoloGame, SoloForce } from '../../../engine/src/solo';
import {
  krakenFireCheckCommandPost,
  krakenFireCheckHex,
  krakenFireCheckUnit,
  MovePlan,
  planKrakenMove,
} from '../../../engine/src/targeting';
import { resolveTurn } from '../../../engine/src/turn';

export interface PendingOrders {
  moveTo: Axial | null;
  fires: KrakenFireOrder[];
  repair: KrakenSystemId | null;
  deploySmoke: boolean;
}

export interface GameSummary {
  winner: string;
  reason: string;
  turns: number;
  damageLog: GameEvent[];
  killFeed: GameEvent[];
}

export interface SoloControllerOptions {
  map: GameMap;
  data: UnitData;
  seed: number;
  force?: SoloForce;
}

export class SoloController {
  readonly state: GameState;
  pending: PendingOrders = emptyOrders();
  movePlan: MovePlan | null = null;
  lastTurnEvents: GameEvent[] = [];
  private readonly ai: Tier1AI;

  constructor(opts: SoloControllerOptions) {
    this.state = createSoloGame(opts);
    this.ai = createTier1AI(opts.seed);
  }

  get turnsRemaining(): number {
    return this.state.data.game.turnLimit - this.state.turn;
  }

  /** Returns true and stores the path plan if the destination is reachable. */
  setMoveTarget(hex: Axial | null): boolean {
    if (hex === null) {
      this.pending.moveTo = null;
      this.movePlan = null;
      return true;
    }
    const plan = planKrakenMove(this.state, hex, this.pending.repair !== null);
    if (!plan) {
      this.pending.moveTo = null;
      this.movePlan = null;
      return false;
    }
    this.pending.moveTo = hex;
    this.movePlan = plan;
    return true;
  }

  /** Validates through engine targeting; one pending order per weapon (replaces). */
  queueFire(order: KrakenFireOrder): boolean {
    const err = order.targetHex
      ? krakenFireCheckHex(this.state, order.weapon, order.targetHex)
      : order.targetCommandPost
        ? krakenFireCheckCommandPost(this.state, order.weapon)
        : order.targetUnitId
          ? krakenFireCheckUnit(this.state, order.weapon, order.targetUnitId)
          : 'no target';
    if (err) return false;
    this.pending.fires = this.pending.fires.filter((f) => f.weapon !== order.weapon);
    this.pending.fires.push(order);
    return true;
  }

  clearFire(weapon: KrakenFireOrder['weapon']): void {
    this.pending.fires = this.pending.fires.filter((f) => f.weapon !== weapon);
  }

  /** Repair target must be red/dark with working printers (engine rules). */
  setRepair(system: KrakenSystemId | null): boolean {
    if (system === null) {
      this.pending.repair = null;
      return true;
    }
    const k = this.state.kraken;
    const cap = this.state.data.kraken.repair.repairedStateCap;
    const order = ['green', 'amber', 'red', 'dark'];
    const repairable =
      k.systems.repairPrinters !== 'dark' &&
      k.repair === null &&
      system !== 'repairPrinters' &&
      order.indexOf(k.systems[system]) > order.indexOf(cap);
    if (!repairable) return false;
    this.pending.repair = system;
    // a repair order caps movement — replan if a move is queued
    if (this.pending.moveTo) this.setMoveTarget(this.pending.moveTo);
    return true;
  }

  setSmoke(deploy: boolean): boolean {
    if (deploy && (this.state.kraken.smokeCooldown > 0 || this.state.kraken.systems.smokeDispensers === 'dark')) {
      return false;
    }
    this.pending.deploySmoke = deploy;
    return true;
  }

  /** Resolve the WeGo turn: player's pending orders vs Tier 1 AI. */
  endTurn(): GameEvent[] {
    const before = this.state.events.length;
    resolveTurn(this.state, {
      defenders: this.ai.ordersFor(this.state),
      kraken: {
        moveTo: this.pending.moveTo ?? undefined,
        fires: this.pending.fires,
        repair: this.pending.repair ?? undefined,
        deploySmoke: this.pending.deploySmoke || undefined,
      },
    });
    this.pending = emptyOrders();
    this.movePlan = null;
    this.lastTurnEvents = this.state.events.slice(before);
    return this.lastTurnEvents;
  }

  summary(): GameSummary {
    const outcome = this.state.outcome;
    return {
      winner: outcome?.winner ?? 'undecided',
      reason: outcome?.reason ?? '',
      turns: this.state.turn,
      damageLog: this.state.events.filter(
        (e) => e.type === 'systemStateChanged' || e.type === 'commandPostStateChanged',
      ),
      killFeed: this.state.events.filter((e) => e.type === 'unitDestroyed'),
    };
  }
}

function emptyOrders(): PendingOrders {
  return { moveTo: null, fires: [], repair: null, deploySmoke: false };
}
