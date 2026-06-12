/**
 * Types + pure parser for engine/data/units.json — the single home of every
 * numeric stat (GDD §8.5: "All values live in units.json — playtest-tunable
 * without code changes"). Browser-safe: no node imports here; the Node
 * file loader lives in node.ts.
 */

export type SystemState = 'green' | 'amber' | 'red' | 'dark';

export type DefenderType = 'heavyTank' | 'lightTank' | 'gev' | 'artillery' | 'scoutBike';

export type TerrainId =
  | 'open'
  | 'road'
  | 'forest'
  | 'hills'
  | 'mountain'
  | 'river'
  | 'swamp'
  | 'rubble';

export interface DefenderStats {
  name: string;
  speed: number;
  attack: number;
  range: number;
  armour: number;
  special: {
    mainBatteryGlanceSurvivalChance?: number;
    hillClimbMultiplier?: number;
    autoDamageVsTreads?: boolean;
    ignoresTerrain?: TerrainId[];
    shootAndScoot?: boolean;
    speedOnFiringTurn?: number;
    ridgeRange?: number;
    indirect?: boolean;
    revealRadius?: number;
  };
}

export interface KrakenWeaponStats {
  count: number;
  attack: number;
  range: number;
  indirect?: boolean;
}

export interface UnitData {
  game: { turnLimit: number; secondsPerTurn: number };
  combat: {
    killMultiplier: number;
    damageRollChance: number;
    damagedAttackMultiplier: number;
    damagedSpeedPenalty: number;
  };
  overrun: {
    /** units with armour >= this resist overrun (tanks); below it are crushed */
    hardArmourThreshold: number;
    /** chance per tank overrun of one damage step to a Kraken tread */
    treadRiskChance: number;
  };
  artilleryFire: {
    landingDelayTurns: number;
    scatter: { aimed: number; spotted: number; blind: number };
    splashRadius: number;
    splashAttackMultiplier: number;
  };
  commandPost: { armour: number; immuneToKill: boolean };
  defenders: Record<DefenderType, DefenderStats>;
  kraken: {
    speed: number;
    sensorRangeByState: Record<SystemState, number>;
    weapons: {
      mainBattery: KrakenWeaponStats;
      secondary: KrakenWeaponStats;
      antiPersonnel: KrakenWeaponStats;
      missileRack: KrakenWeaponStats;
    };
    systemArmour: {
      tread: number;
      weapon: number;
      sensorArray: number;
      smokeDispensers: number;
      repairPrinters: number;
    };
    stateAttackMultiplier: Record<SystemState, number>;
    treadSpeedContribution: Record<SystemState, number>;
    treadAsymmetryPenaltyThreshold: number;
    repair: {
      turnsBySystem: {
        smokeDispensers: number;
        sensorArray: number;
        weapon: number;
        tread: number;
      };
      maxSpeedWhileRepairing: number;
      repairedStateCap: SystemState;
    };
    smoke: {
      durationTurns: number;
      cooldownTurns: number;
      radius: number;
      scatterPenalty: number;
    };
  };
}

/** Parse already-loaded JSON (bundler import or file read) into UnitData. */
export function parseUnitData(raw: unknown): UnitData {
  const data = raw as UnitData;
  if (!data?.game?.turnLimit || !data?.defenders || !data?.kraken) {
    throw new Error('units.json: missing required sections');
  }
  return data;
}
