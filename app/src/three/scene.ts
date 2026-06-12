/**
 * Three.js tactical view (GDD §7 layer 2). Instanced hex terrain with
 * live fog-of-war dimming, primitive unit models (Kenney upgrade path —
 * see docs/ASSETS.md), parabolic shell arcs, particle explosions, smoke.
 * Pure imperative class — React wraps it in TacticalView.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SystemState, TerrainId } from '../../../engine/src/data';
import { GameEvent } from '../../../engine/src/game';
import { Axial, axialToOffset, hexKey, offsetToAxial, parseHexKey as parseKey } from '../../../engine/src/hex';
import { KrakenSystemId } from '../../../engine/src/kraken';
import { GameMap, terrainAt } from '../../../engine/src/map';
import { DefenderType } from '../../../engine/src/data';

const SQRT3 = Math.sqrt(3);

export function hexToWorld(h: Axial): THREE.Vector3 {
  return new THREE.Vector3(SQRT3 * (h.q + h.r / 2), 0, 1.5 * h.r);
}

function worldToHex(x: number, z: number): Axial {
  const r = (z * 2) / 3;
  const q = (x * SQRT3) / 3 - z / 3;
  // cube round
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - (-q - r));
  if (dq > dr && dq > ds) rq = -rs - rr;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

const TERRAIN_STYLE: Record<TerrainId, { color: number; height: number }> = {
  open: { color: 0x5f7050, height: 0.12 },
  road: { color: 0x4d524a, height: 0.1 },
  forest: { color: 0x2d5232, height: 0.16 },
  hills: { color: 0x8a7a4f, height: 0.6 },
  mountain: { color: 0x70707a, height: 1.25 },
  river: { color: 0x2b5d8a, height: 0.06 },
  swamp: { color: 0x46583f, height: 0.1 },
  rubble: { color: 0x6b6259, height: 0.18 },
};

const STATE_COLOR: Record<SystemState, number> = {
  green: 0x5d7a68,
  amber: 0xe0a93c,
  red: 0xd9534f,
  dark: 0x17191b,
};

const DEFENDER_COLOR: Record<DefenderType, number> = {
  heavyTank: 0x3c6e47,
  lightTank: 0x7a9a3c,
  gev: 0x4fa6b8,
  artillery: 0xa07840,
  scoutBike: 0xd6c14f,
};

/** Kenney CC0 GLBs (docs/ASSETS.md) — distinct silhouette per unit type. */
const MODEL_FILES = {
  heavyTankBase: 'car-kit/tractor-shovel',
  lightTankBase: 'car-kit/suv',
  gev: 'car-kit/race-future',
  artilleryBase: 'car-kit/truck-flat',
  scout: 'car-kit/kart-oobi',
  turret: 'tower-defense-kit/weapon-turret',
  cannon: 'tower-defense-kit/weapon-cannon',
  cpBottom: 'tower-defense-kit/tower-square-bottom-a',
  cpTop: 'tower-defense-kit/tower-square-top-a',
} as const;

type ModelKey = keyof typeof MODEL_FILES;

/** Clone a template with unique materials, tinted toward the faction colour. */
function instantiate(template: THREE.Object3D, tint: number, lerp = 0.6): THREE.Object3D {
  const clone = template.clone(true);
  const tintColor = new THREE.Color(tint);
  clone.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.length === 1 ? mats[0]!.clone() : mats.map((m) => m.clone());
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const lm = m as THREE.MeshStandardMaterial;
        if (lm.color) lm.color.lerp(tintColor, lerp);
      }
    }
  });
  return clone;
}

/** Scale so the footprint's longest side equals `size`, bottom resting on y=0. */
function normalize(obj: THREE.Object3D, size: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const s = size / Math.max(dims.x, dims.z);
  const wrapper = new THREE.Group();
  obj.scale.setScalar(s);
  obj.position.set(
    -((box.min.x + box.max.x) / 2) * s,
    -box.min.y * s,
    -((box.min.z + box.max.z) / 2) * s,
  );
  wrapper.add(obj);
  return wrapper;
}

export interface SnapshotDefender {
  id: string;
  type: DefenderType;
  state: 'green' | 'amber';
  position: Axial;
}

export interface LockedTarget {
  weapon: string;
  color: number;
  hex: Axial;
}

export interface SceneSnapshot {
  krakenPos: Axial;
  krakenSystems: Record<KrakenSystemId, SystemState>;
  defenders: SnapshotDefender[];
  visibleHexKeys: Set<string>;
  smokeCenters: Axial[];
  pathPreview: Axial[] | null;
  reachableIndex: number;
  highlightUnitIds: Set<string>;
  highlightCp: boolean;
  cpState: string;
  /** armed-weapon targeting picture: hexKey -> 'valid' | 'losBlocked' | 'outOfSensors' */
  envelope: Map<string, string> | null;
  envelopeColor: number;
  /** world-space radius of the sensor horizon ring, when tighter than weapon range */
  sensorHorizonRadius: number | null;
  lockedTargets: LockedTarget[];
}

export interface PickResult {
  hex: Axial;
  unitId?: string;
}

interface Anim {
  delay: number;
  duration: number;
  update: (t: number) => void;
  done?: () => void;
  elapsed?: number;
}

export class TacticalScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private map: GameMap;

  private terrainMeshes: Partial<Record<TerrainId, THREE.InstancedMesh>> = {};
  private hexInstance = new Map<string, { terrain: TerrainId; index: number }>();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private kraken!: THREE.Group;
  private krakenParts = new Map<string, THREE.Mesh>();
  private defenderMeshes = new Map<string, THREE.Group>();
  private cpGroup!: THREE.Group;
  private pathLine: THREE.Line | null = null;
  private highlightRings: THREE.Mesh[] = [];
  private smokeGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private envelopeGroup = new THREE.Group();
  private lockGroup = new THREE.Group();
  private reticles: THREE.Group[] = [];

  private animations: Anim[] = [];
  private lookTarget = new THREE.Vector3();
  private camDist = 18;
  private disposed = false;
  private lastSnapshot: SceneSnapshot | null = null;
  private clock = new THREE.Clock();

  /** Particle quality 0..1 — degraded automatically before anything else. */
  particleScale = 1;
  private fpsSamples: number[] = [];

  onPick: ((pick: PickResult) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, map: GameMap) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x0b0f0d);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);

    this.scene.add(new THREE.HemisphereLight(0xcfe8d8, 0x20261f, 1.0));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(30, 60, 10);
    this.scene.add(sun);
    this.scene.add(this.smokeGroup);
    this.scene.add(this.fxGroup);
    this.scene.add(this.envelopeGroup);
    this.scene.add(this.lockGroup);
    this.envelopeGroup.traverse((o) => (o.raycast = () => {}));

    this.buildTerrain();
    this.buildKraken();
    this.buildCommandPost();
    this.attachInput(canvas);
    void this.loadModels();

    this.lookTarget.copy(hexToWorld(map.krakenSpawn));
    this.renderLoop();
  }

  // ------------------------------------------------------------ terrain

  private buildTerrain(): void {
    const byTerrain = new Map<TerrainId, Axial[]>();
    for (let row = 0; row < this.map.height; row++) {
      for (let col = 0; col < this.map.width; col++) {
        const hex = offsetToAxial(col, row);
        const id = terrainAt(this.map, hex).id;
        if (!byTerrain.has(id)) byTerrain.set(id, []);
        byTerrain.get(id)!.push(hex);
      }
    }
    const dummy = new THREE.Object3D();
    for (const [terrain, hexes] of byTerrain) {
      const style = TERRAIN_STYLE[terrain];
      const geo = new THREE.CylinderGeometry(0.96, 0.96, style.height, 6);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, hexes.length);
      hexes.forEach((hex, i) => {
        const p = hexToWorld(hex);
        // CylinderGeometry's first vertex sits on +z — already pointy-top
        dummy.position.set(p.x, style.height / 2, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new THREE.Color(style.color));
        this.hexInstance.set(hexKey(hex), { terrain, index: i });
      });
      mesh.userData.terrain = terrain;
      this.terrainMeshes[terrain] = mesh;
      this.scene.add(mesh);
    }
    // forest canopy cones
    const forest = byTerrain.get('forest') ?? [];
    if (forest.length > 0) {
      const cone = new THREE.ConeGeometry(0.34, 0.8, 6);
      const mat = new THREE.MeshLambertMaterial({ color: 0x234728 });
      const trees = new THREE.InstancedMesh(cone, mat, forest.length * 2);
      let i = 0;
      for (const hex of forest) {
        const p = hexToWorld(hex);
        for (const [dx, dz] of [
          [-0.3, 0.18],
          [0.32, -0.22],
        ]) {
          dummy.position.set(p.x + dx!, 0.55, p.z + dz!);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          trees.setMatrixAt(i++, dummy.matrix);
        }
      }
      trees.raycast = () => {}; // trees never swallow hex picks
      this.scene.add(trees);
    }
  }

  private setFog(visible: Set<string>): void {
    const color = new THREE.Color();
    for (const [key, { terrain, index }] of this.hexInstance) {
      const base = TERRAIN_STYLE[terrain].color;
      color.set(base);
      if (!visible.has(key)) color.multiplyScalar(0.32);
      this.terrainMeshes[terrain]!.setColorAt(index, color);
    }
    for (const mesh of Object.values(this.terrainMeshes)) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------- models

  private part(name: string, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, parent: THREE.Group): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    if (name) this.krakenParts.set(name, mesh);
    return mesh;
  }

  private buildKraken(): void {
    const g = new THREE.Group();
    // hull, glacis and skirts — it should read as a fortress on treads
    this.part('', new THREE.BoxGeometry(1.7, 0.62, 2.7), 0x46544c, 0, 0.62, 0, g);
    const glacis = this.part('', new THREE.BoxGeometry(1.5, 0.34, 0.7), 0x3c4a42, 0, 0.5, -1.45, g);
    glacis.rotation.x = 0.4;
    this.part('', new THREE.BoxGeometry(1.86, 0.2, 1.6), 0x515f57, 0, 0.98, 0.3, g); // deck
    this.part('treadLeft', new THREE.BoxGeometry(0.5, 0.5, 3.0), STATE_COLOR.green, -1.08, 0.38, 0, g);
    this.part('treadRight', new THREE.BoxGeometry(0.5, 0.5, 3.0), STATE_COLOR.green, 1.08, 0.38, 0, g);
    const turret = this.part('mainBattery', new THREE.CylinderGeometry(0.48, 0.58, 0.4, 8), STATE_COLOR.green, 0, 1.15, -0.5, g);
    for (const bx of [-0.12, 0.12]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6),
        turret.material as THREE.Material,
      );
      barrel.rotation.x = Math.PI / 2 - 0.1;
      barrel.position.set(bx, 0.12, -1.1);
      turret.add(barrel);
    }
    this.part('secondary1', new THREE.BoxGeometry(0.34, 0.26, 0.56), STATE_COLOR.green, -0.72, 1.18, 0.2, g);
    this.part('secondary2', new THREE.BoxGeometry(0.34, 0.26, 0.56), STATE_COLOR.green, 0.72, 1.18, 0.2, g);
    this.part('antiPersonnel1', new THREE.BoxGeometry(0.22, 0.18, 0.32), STATE_COLOR.green, -0.56, 1.14, -1.0, g);
    this.part('antiPersonnel2', new THREE.BoxGeometry(0.22, 0.18, 0.32), STATE_COLOR.green, 0.56, 1.14, -1.0, g);
    this.part('missileRack1', new THREE.BoxGeometry(0.4, 0.34, 0.6), STATE_COLOR.green, -0.5, 1.2, 0.9, g);
    this.part('missileRack2', new THREE.BoxGeometry(0.4, 0.34, 0.6), STATE_COLOR.green, 0.5, 1.2, 0.9, g);
    const mast = this.part('sensorArray', new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6), STATE_COLOR.green, 0, 1.75, 0.15, g);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mast.material as THREE.Material);
    dish.position.y = 0.4;
    mast.add(dish);
    this.part('smokeDispensers', new THREE.BoxGeometry(0.5, 0.18, 0.22), STATE_COLOR.green, 0, 1.1, 1.28, g);
    // ~1.3 hex visual footprint (P2.1): slight overhang, no neighbour occlusion
    g.scale.setScalar(0.75);
    g.rotation.y = Math.PI / 2; // face west, toward the Command Post
    this.kraken = g;
    this.scene.add(g);
  }

  private models: Partial<Record<ModelKey, THREE.Object3D>> = {};
  private modelsReady = false;

  /** Load Kenney GLBs; rebuild unit meshes when ready (primitive fallback meanwhile). */
  private async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      await Promise.all(
        (Object.keys(MODEL_FILES) as ModelKey[]).map(async (key) => {
          const gltf = await loader.loadAsync(`/assets/kenney/${MODEL_FILES[key]}.glb`);
          this.models[key] = gltf.scene;
        }),
      );
    } catch (err) {
      console.warn('Kenney models unavailable, keeping primitives:', err);
      return;
    }
    this.modelsReady = true;
    for (const [, mesh] of this.defenderMeshes) this.scene.remove(mesh);
    this.defenderMeshes.clear();
    this.clearGhosts();
    this.scene.remove(this.cpGroup);
    this.buildCommandPost();
    if (this.lastSnapshot) this.update(this.lastSnapshot);
  }

  private buildDefenderFromModels(unit: SnapshotDefender): THREE.Group {
    const tint = DEFENDER_COLOR[unit.type];
    const g = new THREE.Group();
    const add = (key: ModelKey, size: number, opts: { y?: number; lerp?: number } = {}) => {
      const part = normalize(instantiate(this.models[key]!, tint, opts.lerp ?? 0.6), size);
      part.position.y = opts.y ?? 0;
      g.add(part);
      return part;
    };
    switch (unit.type) {
      case 'heavyTank':
        add('heavyTankBase', 1.15);
        add('turret', 0.62, { y: 0.56, lerp: 0.4 });
        break;
      case 'lightTank':
        add('lightTankBase', 0.9);
        add('turret', 0.46, { y: 0.48, lerp: 0.4 });
        break;
      case 'gev':
        add('gev', 0.98).position.y = 0.22; // it hovers
        break;
      case 'artillery': {
        add('artilleryBase', 1.2);
        const gun = add('cannon', 0.68, { y: 0.38, lerp: 0.35 });
        gun.position.z = 0.2;
        gun.rotation.x = -0.25;
        break;
      }
      case 'scoutBike':
        add('scout', 0.6, { lerp: 0.45 });
        break;
    }
    g.traverse((o) => (o.userData.unitId = unit.id));
    g.userData.unitId = unit.id;
    g.rotation.y = Math.PI / 2; // face east, toward the oncoming Kraken
    return g;
  }

  private buildDefender(unit: SnapshotDefender): THREE.Group {
    if (this.modelsReady) return this.buildDefenderFromModels(unit);
    const g = new THREE.Group();
    const color = DEFENDER_COLOR[unit.type];
    const mat = new THREE.MeshLambertMaterial({ color });
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.userData.unitId = unit.id;
      g.add(m);
      return m;
    };
    switch (unit.type) {
      case 'heavyTank':
        add(new THREE.BoxGeometry(0.5, 0.22, 0.7), 0, 0.28, 0);
        add(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 8), 0, 0.46, -0.05);
        break;
      case 'lightTank':
        add(new THREE.BoxGeometry(0.4, 0.18, 0.55), 0, 0.26, 0);
        add(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 8), 0, 0.4, -0.04);
        break;
      case 'gev':
        add(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 8), 0, 0.45, 0); // hovering
        break;
      case 'artillery': {
        add(new THREE.BoxGeometry(0.42, 0.2, 0.6), 0, 0.27, 0);
        const tube = add(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), 0, 0.42, 0.1);
        tube.rotation.x = -Math.PI / 3;
        break;
      }
      case 'scoutBike':
        add(new THREE.BoxGeometry(0.12, 0.18, 0.4), 0, 0.26, 0);
        break;
    }
    g.userData.unitId = unit.id;
    return g;
  }

  private buildCommandPost(): void {
    const g = new THREE.Group();
    if (this.modelsReady) {
      const bottom = normalize(instantiate(this.models.cpBottom!, 0x3f6f8f, 0.35), 1.15);
      const top = normalize(instantiate(this.models.cpTop!, 0x3f6f8f, 0.35), 0.95);
      const bottomH = new THREE.Box3().setFromObject(bottom).getSize(new THREE.Vector3()).y;
      top.position.y = bottomH * 0.92;
      g.add(bottom, top);
    } else {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.5, 1.1),
        new THREE.MeshLambertMaterial({ color: 0x3f6f8f }),
      );
      base.position.y = 0.4;
      g.add(base);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5),
        new THREE.MeshLambertMaterial({ color: 0xbfd3df }),
      );
      mast.position.set(0.3, 1.1, 0.3);
      g.add(mast);
    }
    const p = hexToWorld(this.map.commandPost);
    g.position.set(p.x, 0.1, p.z);
    this.cpGroup = g;
    this.scene.add(g);
  }

  private tintCommandPost(cpState: string): void {
    const tint = new THREE.Color(
      cpState === 'destroyed'
        ? 0x1c1c1c
        : cpState === 'red'
          ? 0xd9534f
          : cpState === 'amber'
            ? 0xe0a93c
            : 0xffffff,
    );
    this.cpGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (!o.userData.baseColor) o.userData.baseColor = m.color.clone();
        m.color.copy(o.userData.baseColor as THREE.Color);
        if (cpState !== 'green') m.color.lerp(tint, 0.55);
      }
    });
  }

  // ------------------------------------------------------------- update

  update(snap: SceneSnapshot): void {
    this.lastSnapshot = snap;
    this.setFog(snap.visibleHexKeys);

    // kraken pose + per-system material state
    const kp = hexToWorld(snap.krakenPos);
    this.kraken.position.set(kp.x, this.groundHeight(snap.krakenPos), kp.z);
    for (const [system, mesh] of this.krakenParts) {
      const state = snap.krakenSystems[system as KrakenSystemId];
      (mesh.material as THREE.MeshLambertMaterial).color.set(STATE_COLOR[state]);
      (mesh.material as THREE.MeshLambertMaterial).emissive.set(
        state === 'red' ? 0x551111 : 0x000000,
      );
    }

    // defenders: only detected ones exist
    const seen = new Set<string>();
    for (const u of snap.defenders) {
      seen.add(u.id);
      let mesh = this.defenderMeshes.get(u.id);
      if (!mesh) {
        mesh = this.buildDefender(u);
        this.defenderMeshes.set(u.id, mesh);
        this.scene.add(mesh);
      }
      const p = hexToWorld(u.position);
      mesh.position.set(p.x, this.groundHeight(u.position), p.z);
      mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          (o.material as THREE.MeshLambertMaterial).emissive.set(
            u.state === 'amber' ? 0x442200 : 0x000000,
          );
        }
      });
    }
    for (const [id, mesh] of this.defenderMeshes) {
      mesh.visible = seen.has(id);
    }

    this.tintCommandPost(snap.cpState);

    this.updatePathPreview(snap);
    this.updateHighlights(snap);
    this.updateSmoke(snap);
    this.updateEnvelope(snap);
    this.updateLocks(snap);
  }

  /** P2: range band + sensor horizon + LOS shadows for the armed weapon. */
  private updateEnvelope(snap: SceneSnapshot): void {
    this.envelopeGroup.clear();
    if (snap.envelope) {
      const buckets: Record<string, Axial[]> = { valid: [], losBlocked: [], outOfSensors: [] };
      for (const [key, status] of snap.envelope) {
        const { q, r } = parseKey(key);
        buckets[status]?.push({ q, r });
      }
      const styles: Record<string, { color: number; opacity: number; y: number }> = {
        valid: { color: snap.envelopeColor, opacity: 0.2, y: 0.05 },
        losBlocked: { color: 0x05070a, opacity: 0.55, y: 0.07 },
        outOfSensors: { color: 0x3c4a5e, opacity: 0.45, y: 0.06 },
      };
      const dummy = new THREE.Object3D();
      for (const [status, hexes] of Object.entries(buckets)) {
        if (hexes.length === 0) continue;
        const style = styles[status]!;
        const mesh = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.93, 0.93, 0.03, 6),
          new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false }),
          hexes.length,
        );
        hexes.forEach((hex, i) => {
          const p = hexToWorld(hex);
          dummy.position.set(p.x, this.groundHeight(hex) + style.y, p.z);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.raycast = () => {};
        this.envelopeGroup.add(mesh);
      }
    }
    if (snap.sensorHorizonRadius !== null) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * snap.sensorHorizonRadius, 0.5, Math.sin(a) * snap.sensorHorizonRadius));
      }
      const ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xbfd3df, transparent: true, opacity: 0.35 }),
      );
      const kp = hexToWorld(snap.krakenPos);
      ring.position.set(kp.x, 0, kp.z);
      ring.raycast = () => {};
      this.envelopeGroup.add(ring);
    }
  }

  /** P1: pulsing corner-bracket reticles + targeting lines for locked targets. */
  private updateLocks(snap: SceneSnapshot): void {
    this.lockGroup.clear();
    this.reticles = [];
    const kp = hexToWorld(snap.krakenPos).setY(this.groundHeight(snap.krakenPos) + 1.3);
    for (const lock of snap.lockedTargets) {
      const tp = hexToWorld(lock.hex);
      const y = this.groundHeight(lock.hex);
      // targeting line — the fan of fire
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([kp, new THREE.Vector3(tp.x, y + 0.7, tp.z)]),
        new THREE.LineBasicMaterial({ color: lock.color, transparent: true, opacity: 0.8 }),
      );
      line.raycast = () => {};
      this.lockGroup.add(line);
      // corner brackets — unmistakably different from the circular "targetable" ring
      const reticle = new THREE.Group();
      const s = 0.8;
      const l = 0.34;
      const mat = new THREE.LineBasicMaterial({ color: lock.color });
      for (const [cx, cz] of [[-s, -s], [s, -s], [s, s], [-s, s]] as const) {
        const pts = [
          new THREE.Vector3(cx - Math.sign(cx) * l, 0, cz),
          new THREE.Vector3(cx, 0, cz),
          new THREE.Vector3(cx, 0, cz - Math.sign(cz) * l),
        ];
        const corner = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
        corner.raycast = () => {};
        reticle.add(corner);
      }
      reticle.position.set(tp.x, y + 0.12, tp.z);
      this.lockGroup.add(reticle);
      this.reticles.push(reticle);
    }
  }

  private groundHeight(hex: Axial): number {
    const t = terrainAt(this.map, hex);
    return TERRAIN_STYLE[t.id].height;
  }

  private updatePathPreview(snap: SceneSnapshot): void {
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine = null;
    }
    if (!snap.pathPreview || snap.pathPreview.length < 2) return;
    const pts = snap.pathPreview.map((h, i) => {
      const p = hexToWorld(h);
      return new THREE.Vector3(p.x, this.groundHeight(h) + 0.15, p.z);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    // colour per vertex: reachable bright, rest dim
    const colors: number[] = [];
    pts.forEach((_, i) => {
      const c = new THREE.Color(i <= snap.reachableIndex ? 0x59d68b : 0x2f4f3c);
      colors.push(c.r, c.g, c.b);
    });
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.pathLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 }),
    );
    this.scene.add(this.pathLine);
  }

  private updateHighlights(snap: SceneSnapshot): void {
    for (const ring of this.highlightRings) {
      this.scene.remove(ring);
      ring.geometry.dispose();
    }
    this.highlightRings = [];
    const addRing = (hex: Axial, color: number) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.92, 24),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
      );
      const p = hexToWorld(hex);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, this.groundHeight(hex) + 0.06, p.z);
      ring.raycast = () => {};
      this.scene.add(ring);
      this.highlightRings.push(ring);
    };
    for (const u of snap.defenders) {
      if (snap.highlightUnitIds.has(u.id)) addRing(u.position, 0xe0a93c);
    }
    if (snap.highlightCp) addRing(this.map.commandPost, 0xff5c57);
  }

  private updateSmoke(snap: SceneSnapshot): void {
    this.smokeGroup.clear();
    const mat = new THREE.MeshLambertMaterial({ color: 0x9aa39d, transparent: true, opacity: 0.45 });
    for (const center of snap.smokeCenters) {
      const p = hexToWorld(center);
      for (let i = 0; i < 4; i++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.7 + (i % 2) * 0.3, 8, 6), mat);
        blob.position.set(
          p.x + Math.sin(i * 1.7) * 0.8,
          0.8 + (i % 2) * 0.4,
          p.z + Math.cos(i * 2.3) * 0.8,
        );
        blob.raycast = () => {};
        this.smokeGroup.add(blob);
      }
    }
  }

  // ---------------------------------------------------------- animation

  private playbackResolve: (() => void) | null = null;

  /** Fast-forward the current resolution playback (tap to skip, P4.2). */
  skipPlayback(): void {
    if (!this.playbackResolve) return;
    // take the resolver first — finishing animations can re-enter here
    const resolve = this.playbackResolve;
    this.playbackResolve = null;
    for (const anim of this.animations) {
      anim.update(1);
      const done = anim.done;
      anim.done = undefined;
      anim.update = () => {};
      anim.duration = -1;
      done?.();
    }
    this.animations = [];
    resolve();
  }

  /**
   * Animate a resolved turn's events as a labelled GDD §8.1 sequence:
   * MOVEMENT -> COMBAT -> ARTILLERY -> REPAIR. Resolves when done.
   */
  playEvents(events: GameEvent[], onPhase?: (label: string | null) => void): Promise<void> {
    return new Promise((resolve) => {
      this.playbackResolve = () => {
        onPhase?.(null);
        resolve();
      };
      const pos = new Map<string, Axial>(); // last known positions this playback
      const trackPos = (id: string, hex: Axial) => pos.set(id, hex);
      for (const u of this.lastSnapshot?.defenders ?? []) trackPos(u.id, u.position);
      if (this.lastSnapshot) trackPos('kraken', this.lastSnapshot.krakenPos);

      // build the labelled timeline from which phases actually have content
      const has = (...types: string[]) => events.some((e) => types.includes(e.type));
      const hasMove = has('krakenMoved', 'unitMoved', 'unitScooted');
      const hasCombat = has('attackResolved', 'targetEvaded', 'shellFired');
      const hasArtillery = has('shellLanded');
      const hasRepair = has('repairStarted', 'repairTick', 'repairCompleted');

      let clock = 0;
      const label = (text: string, at: number) =>
        this.animations.push({ delay: at, duration: 1, update: () => onPhase?.(text) });
      const tMove = clock;
      if (hasMove) {
        label('MOVEMENT', clock);
        clock += 750;
      }
      const tCombat = clock;
      if (hasCombat) {
        label('COMBAT', clock);
        clock += 700;
      }
      const tShell = clock;
      if (hasArtillery) {
        label('ARTILLERY', clock);
        clock += 750;
      }
      if (hasRepair) {
        label('REPAIR', clock);
        clock += 450;
      }

      for (const e of events) {
        switch (e.type) {
          case 'krakenMoved': {
            const from = hexToWorld(e.from as Axial);
            const to = hexToWorld(e.to as Axial);
            const yFrom = this.groundHeight(e.from as Axial);
            const yTo = this.groundHeight(e.to as Axial);
            this.animations.push({
              delay: tMove,
              duration: 600,
              update: (t) => {
                this.kraken.position.lerpVectors(
                  new THREE.Vector3(from.x, yFrom, from.z),
                  new THREE.Vector3(to.x, yTo, to.z),
                  t,
                );
              },
            });
            trackPos('kraken', e.to as Axial);
            break;
          }
          case 'unitMoved':
          case 'unitScooted':
            trackPos(e.unitId as string, e.to as Axial);
            break;
          case 'attackResolved': {
            const fromHex = pos.get((e.attackerId as string) ?? '') ?? null;
            const targetHex =
              e.target === 'commandPost'
                ? this.map.commandPost
                : e.targetSystem !== undefined
                  ? pos.get('kraken')!
                  : (pos.get(e.targetId as string) ?? null);
            if (fromHex && targetHex) this.tracer(fromHex, targetHex, tCombat);
            if (targetHex && e.result !== 'ping') this.flash(targetHex, tCombat + 180, 0xffa040);
            break;
          }
          case 'shellFired': {
            const from = pos.get(e.attackerId as string);
            if (from) this.launchPuff(from, tCombat);
            break;
          }
          case 'shellLanded': {
            this.shellDrop(e.impact as Axial, tShell);
            this.explosion(e.impact as Axial, tShell + 420, 1.2);
            break;
          }
          case 'unitDestroyed': {
            const at = pos.get(e.unitId as string);
            if (at) this.explosion(at, tShell + 200, 1.6);
            break;
          }
          default:
            break;
        }
      }

      const total = Math.max(clock, 400);
      this.animations.push({
        delay: total,
        duration: 1,
        update: () => {},
        done: () => this.skipPlayback(), // natural end uses the same resolve path
      });
    });
  }

  private tracer(from: Axial, to: Axial, delay: number): void {
    const a = hexToWorld(from).setY(this.groundHeight(from) + 0.8);
    const b = hexToWorld(to).setY(this.groundHeight(to) + 0.6);
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffd089, transparent: true, opacity: 0.9 }),
    );
    line.visible = false;
    this.fxGroup.add(line);
    this.animations.push({
      delay,
      duration: 260,
      update: (t) => {
        line.visible = true;
        (line.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - t);
      },
      done: () => {
        this.fxGroup.remove(line);
        geo.dispose();
      },
    });
  }

  private launchPuff(from: Axial, delay: number): void {
    this.flash(from, delay, 0xfff0c0);
  }

  private shellDrop(impact: Axial, delay: number): void {
    const target = hexToWorld(impact).setY(this.groundHeight(impact));
    const start = target.clone().add(new THREE.Vector3(-4, 9, -3));
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
    );
    shell.visible = false;
    this.fxGroup.add(shell);
    this.animations.push({
      delay,
      duration: 420,
      update: (t) => {
        shell.visible = true;
        shell.position.lerpVectors(start, target, t);
        shell.position.y += Math.sin(t * Math.PI) * 1.2; // slight arc
      },
      done: () => this.fxGroup.remove(shell),
    });
  }

  private flash(hex: Axial, delay: number, color: number): void {
    const p = hexToWorld(hex);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    flash.position.set(p.x, this.groundHeight(hex) + 0.5, p.z);
    flash.visible = false;
    this.fxGroup.add(flash);
    this.animations.push({
      delay,
      duration: 240,
      update: (t) => {
        flash.visible = true;
        flash.scale.setScalar(1 + t * 1.6);
        (flash.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
      },
      done: () => this.fxGroup.remove(flash),
    });
  }

  private explosion(hex: Axial, delay: number, size: number): void {
    const count = Math.max(6, Math.floor(26 * this.particleScale));
    const p = hexToWorld(hex);
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 3.4,
          (Math.random() - 0.5) * 3,
        ),
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff8c3a,
      size: 0.22 * size,
      transparent: true,
    });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    this.fxGroup.add(points);
    const y0 = this.groundHeight(hex) + 0.3;
    this.animations.push({
      delay,
      duration: 480,
      update: (t) => {
        points.visible = true;
        for (let i = 0; i < count; i++) {
          positions[i * 3] = p.x + velocities[i]!.x * t * size;
          positions[i * 3 + 1] = y0 + velocities[i]!.y * t * size - 2.2 * t * t;
          positions[i * 3 + 2] = p.z + velocities[i]!.z * t * size;
        }
        geo.attributes.position!.needsUpdate = true;
        mat.opacity = 1 - t;
      },
      done: () => {
        this.fxGroup.remove(points);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  // --------------------------------------------------------------- input

  private attachInput(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let pinchDist = 0;

    const toPick = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      // unit pick first
      const unitHits = this.raycaster.intersectObjects(
        [...this.defenderMeshes.values()].filter((m) => m.visible),
        true,
      );
      const point = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.groundPlane, point);
      const hex = worldToHex(point.x, point.z);
      if (unitHits.length > 0) {
        let o: THREE.Object3D | null = unitHits[0]!.object;
        while (o && !o.userData.unitId) o = o.parent;
        if (o?.userData.unitId) return { hex, unitId: o.userData.unitId as string };
      }
      return { hex };
    };

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      const scale = this.camDist / 500;
      this.lookTarget.x -= dx * scale;
      this.lookTarget.z -= dy * scale * 1.4;
    });
    canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved < 8 && this.onPick) this.onPick(toPick(e.clientX, e.clientY));
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = THREE.MathUtils.clamp(this.camDist * (e.deltaY > 0 ? 1.12 : 0.9), 7, 60);
    });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0]!.clientX - e.touches[1]!.clientX,
          e.touches[0]!.clientY - e.touches[1]!.clientY,
        );
        if (pinchDist > 0) {
          this.camDist = THREE.MathUtils.clamp(this.camDist * (pinchDist / d), 7, 60);
        }
        pinchDist = d;
      }
    });
    canvas.addEventListener('touchend', () => (pinchDist = 0));
  }

  centerOnKraken(): void {
    this.lookTarget.copy(this.kraken.position);
  }

  // ------------------------------------------------- x-ray ghosts (P2.2)

  private xrayGhosts = new Map<string, THREE.Group>();

  /** Translucent always-on-top copy shown when the Kraken occludes a unit. */
  private makeGhost(source: THREE.Object3D, color: number): THREE.Group {
    const ghost = source.clone(true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
      depthWrite: false,
    });
    ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = mat;
        o.renderOrder = 999;
      }
      o.raycast = () => {};
    });
    ghost.visible = false;
    const group = new THREE.Group();
    group.add(ghost);
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  private clearGhosts(): void {
    for (const [, g] of this.xrayGhosts) this.scene.remove(g);
    this.xrayGhosts.clear();
  }

  /** Per-frame: any unit (or the CP) hidden behind the Kraken shows its ghost. */
  private updateXray(): void {
    const camPos = this.camera.position;
    const check = (id: string, target: THREE.Object3D, color: number) => {
      let ghost = this.xrayGhosts.get(id);
      if (!ghost) {
        ghost = this.makeGhost(target, color);
        this.xrayGhosts.set(id, ghost);
      }
      if (!target.visible) {
        ghost.visible = false;
        return;
      }
      const tp = target.position.clone().add(new THREE.Vector3(0, 0.35, 0));
      this.raycaster.set(camPos, tp.clone().sub(camPos).normalize());
      const hits = this.raycaster.intersectObject(this.kraken, true);
      const dist = camPos.distanceTo(tp);
      const occluded = hits.some((h) => h.distance < dist - 0.15);
      ghost.visible = occluded;
      if (occluded) {
        ghost.position.copy(target.position);
        ghost.rotation.copy(target.rotation);
        const inner = ghost.children[0]!;
        inner.visible = true;
      }
    };
    for (const [id, mesh] of this.defenderMeshes) {
      const snap = this.lastSnapshot?.defenders.find((u) => u.id === id);
      check(id, mesh, snap ? DEFENDER_COLOR[snap.type] : 0xffffff);
    }
    check('cp', this.cpGroup, 0x6fb9e8);
  }

  /** Test harness: how many occlusion ghosts are currently showing. */
  xrayVisibleCount(): number {
    let n = 0;
    for (const [, g] of this.xrayGhosts) if (g.visible) n++;
    return n;
  }

  /** CSS-pixel screen position of a unit — used by the headless test harness. */
  screenPositionOfUnit(unitId: string): { x: number; y: number } | null {
    const mesh = this.defenderMeshes.get(unitId);
    if (!mesh || !mesh.visible) return null;
    const p = mesh.position.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
    };
  }

  // --------------------------------------------------------------- loop

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private renderLoop = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.renderLoop);
    const dt = Math.min(this.clock.getDelta(), 0.1) * 1000;

    // auto-degrade particles before anything else (quality bar)
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length >= 90) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      if (avg > 22 && this.particleScale > 0.25) this.particleScale *= 0.5;
      this.fpsSamples = [];
    }

    for (const anim of this.animations) {
      anim.elapsed = (anim.elapsed ?? 0) + dt;
      const local = anim.elapsed - anim.delay;
      if (local < 0) continue;
      const t = Math.min(local / anim.duration, 1);
      anim.update(t);
      if (t >= 1 && anim.done) {
        anim.done();
        anim.done = undefined;
        anim.update = () => {};
        anim.duration = -1; // mark finished
      }
    }
    this.animations = this.animations.filter(
      (a) => a.duration > 0 && (a.elapsed ?? 0) - a.delay < a.duration,
    );

    // locked-target reticles pulse so commitment can't be missed
    const now = performance.now() / 1000;
    this.reticles.forEach((r, i) => {
      const s = 1 + 0.14 * Math.sin(now * 5 + i * 1.3);
      r.scale.set(s, 1, s);
      r.rotation.y = Math.sin(now * 0.8 + i) * 0.1;
    });

    this.updateXray();

    // P2.3: steep pitch when zoomed out (readable board, minimal occlusion),
    // easing shallower when zoomed in (cinematic; x-ray ghosts cover occlusion)
    const zoomT = THREE.MathUtils.clamp((this.camDist - 7) / (60 - 7), 0, 1);
    const zMul = THREE.MathUtils.lerp(1.0, 0.62, zoomT);
    const cam = this.lookTarget
      .clone()
      .add(new THREE.Vector3(0, this.camDist, this.camDist * zMul));
    this.camera.position.lerp(cam, 0.18);
    this.camera.lookAt(this.lookTarget);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    this.renderer.dispose();
  }
}
