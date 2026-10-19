import {
  createSystem,
  DepthOccludable,
  DistanceGrabbable,
  Grabbed,
  Group,
  Hovered,
  MovementMode,
  Quaternion,
  RayInteractable,
  setWorldPosition,
  setWorldQuaternion,
  Vector3,
  VisibilityState,
  XRPlane,
  type Entity,
  type Mesh,
  type Object3D,
} from '@iwsdk/core';
import { playLit, playPalm, playSnap, playSolved, playTurn } from './audio.js';
import { BoardPiece } from './beam-components.js';
import {
  BEAM_Y,
  BOARD_TOP,
  beamMats,
  buildBase,
  buildLevel,
  buildPiece,
  CELL,
  cellToLocal,
  dotMaterials,
  traySlot,
  type BaseView,
  type LevelView,
} from './board-visuals.js';
import {
  DIRS,
  fixedCells,
  trace,
  type Color,
  type Level,
  type PalmCell,
  type Piece,
  type TraceResult,
} from './game/grid.js';
import { LEVELS } from './game/levels.js';
import { apertureVector, freeTrace, reflect3, type FreeResult, type PalmDisc, type SkyTarget, type V3 } from './game/optics.js';
import { PALM_RADIUS, PalmReader, type HandSource } from './palms.js';

const STEP = Math.PI / 4;
/** How far in front of the eyes the board sits, measured flat. */
const REACH = 0.45;
/** Board height below the eyes when no desk is found (seated). */
const FALLBACK_DROP = 0.42;
/** Seconds after entering a session during which the board may re-seat on a desk. */
const PLACEMENT_WINDOW = 4;
/** A solution must hold this long, so a palm sweeping past does not count. */
const SOLVE_HOLD = 0.4;
/** Pause on a solved board before the next level. */
const NEXT_LEVEL_DELAY = 2.6;
/** A palm tilted up past this counts as lifting the beam off the board. */
const LIFT_TILT = 0.35;

interface NativePlane {
  orientation?: string;
  semanticLabel?: string;
}

/**
 * Owns the Palmlight board: seats it on the player's desk, turns grabbed
 * pieces and real palms into optics, traces the beam, lights crystals and
 * moves to the next level.
 */
export class BoardSystem extends createSystem({
  pieces: { required: [BoardPiece] },
  held: { required: [BoardPiece, Grabbed] },
  hovered: { required: [BoardPiece, Hovered], excluded: [Grabbed] },
  planes: { required: [XRPlane] },
}) {
  private base!: BaseView;
  private content: LevelView | null = null;
  private levelIndex = 0;
  private level: Level = LEVELS[0];
  private completed = new Set<string>();

  private fixed = new Uint8Array(0);
  private placed: Array<Piece | null> = [];
  private candidate: Piece[] = [];
  private candidateOk: boolean[] = [];
  private effective: Array<Piece | null> = [];
  private pieceSig = new Int32Array(0);
  private pendingSnap = 0;

  private hands = new PalmReader();
  private palmCells: Array<PalmCell | null> = [null, null];
  private palmCellStore: PalmCell[] = [
    { col: 0, row: 0, nx: 0, nz: 0, lift: false },
    { col: 0, row: 0, nx: 0, nz: 0, lift: false },
  ];
  private palmDiscs: Array<PalmDisc | null> = [null, null];
  private palmDiscStore: PalmDisc[] = [
    { center: [0, 0, 0], normal: [0, 1, 0], radius: PALM_RADIUS },
    { center: [0, 0, 0], normal: [0, 1, 0], radius: PALM_RADIUS },
  ];
  private palmSig = new Int32Array(2).fill(-2);
  private skyTargets: SkyTarget[] = [];

  private grid: TraceResult | null = null;
  private free: FreeResult[] = [];
  private litMask = 0;
  private skyMask = 0;
  private palmTouch = [false, false];
  private solvedSince = -1;
  private solved = false;
  private solvedAt = -10;
  private nextLevelAt = -1;

  private placeUntil = 0;
  private nextPlaceAt = 0;
  private placeRequested = true;
  private touched = false;
  private immersive = false;
  private onDesk = false;

  private head = new Vector3();
  private fwd = new Vector3();
  private tmp = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private up = new Vector3(0, 1, 0);
  private zAxis = new Vector3(0, 0, 1);
  private q = new Quaternion();

  init(): void {
    this.base = buildBase(LEVELS.length);
    const board = this.world.createTransformEntity(this.base.root);
    // Real hands and objects hide the beam where they pass in front of it.
    const beams = new Group();
    for (let i = 0; i < this.base.beamCore.length; i++) beams.add(this.base.beamCore[i], this.base.beamGlow[i]);
    this.world.createTransformEntity(beams, board).addComponent(DepthOccludable);

    this.queries.held.subscribe('qualify', () => {
      this.touched = true;
    });
    this.queries.held.subscribe('disqualify', (entity) => {
      this.pendingSnap |= 1 << this.indexOf(entity);
    });
    this.queries.planes.subscribe('qualify', () => {
      // A desk found late in the window still gets used.
      this.nextPlaceAt = 0;
    });
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.immersive = state !== VisibilityState.NonImmersive;
        this.placeRequested = true;
      }),
    );
    this.loadLevel(0);
  }

  /** Swap the fixed pieces and tray for level `index`. */
  loadLevel(index: number): void {
    this.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    const level = (this.level = LEVELS[this.levelIndex]);

    for (const entity of [...this.queries.pieces.entities]) {
      entity.object3D?.removeFromParent();
      entity.destroy();
    }
    if (this.content) this.base.root.remove(this.content.group);
    this.content = buildLevel(level);
    this.base.root.add(this.content.group);

    this.fixed = new Uint8Array(level.size * level.size);
    for (const k of fixedCells(level)) {
      const [col, row] = k.split(',').map(Number);
      this.fixed[col * level.size + row] = 1;
    }
    this.skyTargets = (level.sky ?? []).map((s) => {
      cellToLocal(level.size, s.col, s.row, this.tmp);
      return {
        center: [this.tmp.x, BOARD_TOP + s.height, this.tmp.z] as V3,
        radius: 0.03,
        aperture: apertureVector(s.aperture),
        color: s.color,
      };
    });

    this.placed = level.tray.map(() => null);
    this.effective = level.tray.map(() => null);
    this.candidate = level.tray.map((t) => ({ kind: t.kind, col: 0, row: 0, angle: 0, color: t.color }));
    this.candidateOk = level.tray.map(() => false);
    this.pieceSig = new Int32Array(level.tray.length).fill(-2);
    this.palmSig.fill(-2);
    this.pendingSnap = 0;
    this.litMask = this.skyMask = 0;
    this.solved = false;
    this.solvedSince = this.nextLevelAt = -1;
    this.grid = null;
    this.free = [];

    level.tray.forEach((t, i) => {
      const piece = this.world.createTransformEntity(buildPiece(t.kind, t.color));
      piece.addComponent(BoardPiece, { index: i });
      piece.addComponent(RayInteractable);
      // One pinch picks a piece up within reach, from a pointing hand, or from a look.
      piece.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveTowardsTarget,
        moveSpeedFactor: 0.08,
        translate: true,
        rotate: true,
        scale: false,
        rotateMin: [0, -Math.PI, 0],
        rotateMax: [0, Math.PI, 0],
      });
      this.moveToSlot(piece);
    });

    this.base.dots.forEach((dot, i) => {
      dot.material = this.completed.has(LEVELS[i].id) || i === this.levelIndex ? dotMaterials.on : dotMaterials.off;
      dot.scale.setScalar(i === this.levelIndex ? 1.6 : 1);
    });
  }

  update(delta: number, time: number): void {
    if (this.placeRequested) {
      this.placeRequested = false;
      this.placeUntil = time + PLACEMENT_WINDOW;
      this.nextPlaceAt = 0;
      this.touched = false;
    }
    if (time < this.placeUntil && !this.touched && time >= this.nextPlaceAt) {
      this.seatBoard();
      this.nextPlaceAt = time + 0.5;
    }

    this.hands.update(this.input.xr as unknown as HandSource, this.player.gripSpaces, this.base.root);
    for (const entity of this.queries.held.entities) this.readCandidate(entity);
    if (this.pendingSnap !== 0) this.snapReleased();

    this.updatePalms();
    this.refresh(time);
    this.animate(delta, time);

    if (this.nextLevelAt > 0 && time >= this.nextLevelAt) {
      this.loadLevel(this.levelIndex + 1);
      this.seatPieces();
    }
  }

  private indexOf(entity: Entity): number {
    return entity.getValue(BoardPiece, 'index') ?? 0;
  }

  /** Seat the board on the nearest desk-height surface, or in front of the player. */
  private seatBoard(): void {
    const eye: Object3D = this.immersive ? this.player.head : this.world.camera;
    eye.updateWorldMatrix(true, false);
    eye.getWorldPosition(this.head);
    eye.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();

    let height = this.head.y - FALLBACK_DROP;
    let best = Infinity;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as NativePlane | undefined;
      if (plane?.orientation !== 'horizontal' || entity.object3D == null) continue;
      entity.object3D.getWorldPosition(this.tmp);
      const below = this.head.y - this.tmp.y;
      if (below < 0.2 || below > 0.75) continue;
      const dist = Math.hypot(this.tmp.x - this.head.x, this.tmp.z - this.head.z);
      if (dist > 1.5) continue;
      const score = dist - (plane.semanticLabel === 'table' ? 0.5 : 0);
      if (score < best) {
        best = score;
        height = this.tmp.y;
      }
    }
    this.onDesk = best < Infinity;

    const root = this.base.root;
    root.position.set(this.head.x + this.fwd.x * REACH, height, this.head.z + this.fwd.z * REACH);
    root.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    root.updateMatrixWorld(true);

    const stand = this.base.stand;
    stand.visible = !this.onDesk && height > 0.1;
    stand.scale.set(1, Math.max(height, 0.01), 1);
    stand.position.set(0, -height / 2, 0);

    if (!this.immersive) {
      root.getWorldPosition(this.tmp);
      this.world.camera.lookAt(this.tmp);
    }
    this.seatPieces();
  }

  private seatPieces(): void {
    for (const entity of this.queries.pieces.entities) this.moveToSlot(entity);
  }

  /** Put a piece on its grid cell, or back in the tray. */
  private moveToSlot(entity: Entity): void {
    const object = entity.object3D;
    if (object == null) return;
    const i = this.indexOf(entity);
    const m = this.placed[i];
    const root = this.base.root;
    root.updateMatrixWorld(true);
    if (m) cellToLocal(this.level.size, m.col, m.row, this.tmp);
    else traySlot(this.level.size, i, this.tmp);
    root.localToWorld(this.tmp);
    setWorldPosition(object, this.tmp);
    this.q.setFromAxisAngle(this.up, root.rotation.y + (m ? m.angle * STEP : 0));
    setWorldQuaternion(object, this.q);
  }

  /** Turn a held piece's pose into the cell and angle it would snap to. */
  private readCandidate(entity: Entity): void {
    const object = entity.object3D;
    if (object == null) return;
    this.touched = true;
    const i = this.indexOf(entity);
    const n = this.level.size;
    const root = this.base.root;

    object.getWorldPosition(this.tmp);
    root.worldToLocal(this.tmp);
    const col = Math.round(this.tmp.x / CELL + (n - 1) / 2);
    const row = Math.round(this.tmp.z / CELL + (n - 1) / 2);
    const nearBoard = this.tmp.y > -0.03 && this.tmp.y < 0.15;

    object.getWorldQuaternion(this.q);
    this.a.set(1, 0, 0).applyQuaternion(this.q);
    const yaw = Math.atan2(-this.a.z, this.a.x) - root.rotation.y;
    const angle = ((Math.round(yaw / STEP) % 8) + 8) % 8;

    const c = this.candidate[i];
    if (this.candidateOk[i] && angle !== c.angle && c.kind !== 'filter') playTurn();
    c.col = col;
    c.row = row;
    c.angle = c.kind === 'filter' ? 0 : angle;
    this.candidateOk[i] = nearBoard && this.isFree(col, row, i);

    const ghost = this.base.ghost;
    ghost.visible = this.candidateOk[i];
    if (ghost.visible) {
      cellToLocal(n, col, row, ghost.position);
      ghost.position.y += 0.001;
    }
  }

  private snapReleased(): void {
    for (const entity of this.queries.pieces.entities) {
      const i = this.indexOf(entity);
      if ((this.pendingSnap & (1 << i)) === 0) continue;
      if (this.candidateOk[i]) {
        const c = this.candidate[i];
        this.placed[i] = { kind: c.kind, col: c.col, row: c.row, angle: c.angle, color: c.color };
        playSnap();
      } else {
        this.placed[i] = null;
      }
      this.candidateOk[i] = false;
      this.moveToSlot(entity);
    }
    this.pendingSnap = 0;
    this.base.ghost.visible = false;
  }

  private isFree(col: number, row: number, self: number): boolean {
    const n = this.level.size;
    if (col < 0 || row < 0 || col >= n || row >= n) return false;
    if (this.fixed[col * n + row]) return false;
    for (let j = 0; j < this.placed.length; j++) {
      const m = this.placed[j];
      if (j !== self && m && m.col === col && m.row === row) return false;
    }
    return true;
  }

  private isHeld(i: number): boolean {
    for (const entity of this.queries.held.entities) {
      if (this.indexOf(entity) === i) return true;
    }
    return false;
  }

  /** Real palms become grid cells when they rest in the beam, and discs in the air. */
  private updatePalms(): void {
    const n = this.level.size;
    for (let h = 0; h < 2; h++) {
      const palm = this.hands.palms[h];
      if (!palm.tracked) {
        this.palmCells[h] = this.palmDiscs[h] = null;
        continue;
      }
      const disc = this.palmDiscStore[h];
      palm.center.toArray(disc.center);
      palm.normal.toArray(disc.normal);
      this.palmDiscs[h] = disc;

      const c = palm.center;
      const nrm = palm.normal;
      const col = Math.round(c.x / CELL + (n - 1) / 2);
      const row = Math.round(c.z / CELL + (n - 1) / 2);
      // How far the palm reaches up and down from its center.
      const reach = PALM_RADIUS * Math.sqrt(Math.max(0, 1 - nrm.y * nrm.y)) + 0.012;
      const inBand = Math.abs(c.y - (BOARD_TOP + BEAM_Y)) <= reach;
      if (!inBand || col < 0 || row < 0 || col >= n || row >= n || this.fixed[col * n + row]) {
        this.palmCells[h] = null;
        continue;
      }
      const cell = this.palmCellStore[h];
      cell.col = col;
      cell.row = row;
      cell.nx = nrm.x;
      cell.nz = nrm.z;
      cell.lift = nrm.y > LIFT_TILT;
      cell.block = nrm.y < -LIFT_TILT;
      this.palmCells[h] = cell;
    }
  }

  private palmSignature(h: number): number {
    const p = this.palmCells[h];
    if (!p) return -1;
    const line = Math.round((Math.atan2(-p.nz, p.nx) + Math.PI / 2) / STEP) & 7;
    const facing = Math.round(Math.atan2(-p.nz, p.nx) / STEP) & 7;
    return ((((p.col * 8 + p.row) * 8 + line) * 8 + facing) * 2 + (p.lift ? 1 : 0)) * 2 + (p.block ? 1 : 0);
  }

  /** Re-trace the board when a piece or palm moved to a new cell or angle. */
  private refresh(time: number): void {
    const n = this.level.size;
    let changed = this.grid === null;
    for (let i = 0; i < this.placed.length; i++) {
      const m = this.isHeld(i) ? (this.candidateOk[i] ? this.candidate[i] : null) : this.placed[i];
      this.effective[i] = m;
      const sig = m ? (m.col * n + m.row) * 8 + (m.angle % 4) : -1;
      if (sig !== this.pieceSig[i]) {
        this.pieceSig[i] = sig;
        changed = true;
      }
    }
    for (let h = 0; h < 2; h++) {
      const sig = this.palmSignature(h);
      if (sig !== this.palmSig[h]) {
        this.palmSig[h] = sig;
        changed = true;
      }
    }
    if (changed) this.grid = trace(this.level, this.effective, this.palmCells);
    const grid = this.grid!;

    // Light in the air follows the palms every frame.
    const lifted = grid.beams.some((b) => b.lift);
    if (lifted || changed || this.free.length > 0) {
      this.free = [];
      for (const beam of grid.beams) {
        const lift = beam.lift;
        const disc = lift ? this.palmDiscs[lift.palm] : null;
        if (!lift || !disc) continue;
        cellToLocal(n, lift.col, lift.row, this.a);
        const [dx, dz] = DIRS[lift.dir];
        const l = Math.hypot(dx, dz);
        const out = reflect3([dx / l, 0, dz / l], disc.normal);
        this.free.push(freeTrace([this.a.x, BOARD_TOP + BEAM_Y, this.a.z], out, lift.color, this.palmDiscs, this.skyTargets, lift.palm));
      }
      this.drawBeams(grid);
    }

    let lit = 0;
    for (const k of grid.lit) lit |= 1 << k;
    let sky = 0;
    for (const f of this.free) if (f.hit >= 0) sky |= 1 << f.hit;
    let step = 0;
    for (let k = 0; k < this.level.crystals.length; k++) {
      if (lit & (1 << k) && !(this.litMask & (1 << k))) playLit(step++);
    }
    for (let k = 0; k < this.skyTargets.length; k++) {
      if (sky & (1 << k) && !(this.skyMask & (1 << k))) playLit(step++);
    }

    const touch0 = grid.palmHits[0] || this.free.some((f) => f.palmHits.includes(0));
    const touch1 = grid.palmHits[1] || this.free.some((f) => f.palmHits.includes(1));
    if ((touch0 && !this.palmTouch[0]) || (touch1 && !this.palmTouch[1])) playPalm();
    this.palmTouch[0] = touch0;
    this.palmTouch[1] = touch1;

    if (!this.solved) {
      this.litMask = lit;
      this.skyMask = sky;
      const allSky = this.skyTargets.length === 0 || sky === (1 << this.skyTargets.length) - 1;
      if (grid.solved && allSky) {
        if (this.solvedSince < 0) this.solvedSince = time;
        if (time - this.solvedSince >= SOLVE_HOLD) this.complete(time);
      } else {
        this.solvedSince = -1;
      }
    }
  }

  private complete(time: number): void {
    this.solved = true;
    this.solvedAt = time;
    this.nextLevelAt = time + NEXT_LEVEL_DELAY;
    this.completed.add(this.level.id);
    this.base.dots[this.levelIndex].material = dotMaterials.on;
    playSolved();
  }

  private drawBeams(grid: TraceResult): void {
    const n = this.level.size;
    const { beamCore, beamGlow } = this.base;
    let s = 0;
    const draw = (color: Color) => {
      if (s >= beamCore.length) return;
      const length = this.a.distanceTo(this.b);
      this.tmp.subVectors(this.b, this.a).normalize();
      const core = beamCore[s];
      const glow = beamGlow[s];
      core.material = beamMats[color][0];
      glow.material = beamMats[color][1];
      for (const mesh of [core, glow] as Mesh[]) {
        mesh.visible = length > 0.0005;
        mesh.position.addVectors(this.a, this.b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(this.up, this.tmp);
        mesh.scale.set(1, Math.max(length, 0.001), 1);
      }
      s++;
    };
    for (const beam of grid.beams) {
      for (let i = 0; i + 1 < beam.points.length; i++) {
        const p0 = beam.points[i];
        const p1 = beam.points[i + 1];
        cellToLocal(n, p0.col, p0.row, this.a).y += BEAM_Y;
        cellToLocal(n, p1.col, p1.row, this.b).y += BEAM_Y;
        draw(beam.color);
      }
    }
    this.free.forEach((f, j) => {
      const color = grid.beams.filter((b) => b.lift)[j]?.color ?? 0;
      for (let i = 0; i + 1 < f.points.length; i++) {
        this.a.fromArray(f.points[i]);
        this.b.fromArray(f.points[i + 1]);
        draw(color);
      }
    });
    for (; s < beamCore.length; s++) beamCore[s].visible = beamGlow[s].visible = false;
  }

  private animate(delta: number, time: number): void {
    const view = this.content;
    if (view) {
      const ease = Math.min(1, delta * 8);
      view.crystals.forEach((crystal, k) => {
        const lit = (this.litMask & (1 << k)) !== 0;
        crystal.rotation.y += delta * (lit ? 1.8 : 0.35);
        const m = view.crystalMats[k];
        m.emissiveIntensity += ((lit ? 2.2 : 0.12) - m.emissiveIntensity) * ease;
      });
      view.sky.forEach((crystal, k) => {
        const lit = (this.skyMask & (1 << k)) !== 0;
        crystal.rotation.y += delta * (lit ? 1.8 : 0.5);
        crystal.position.y += Math.sin(time * 1.4 + k) * 0.00004;
        const m = view.skyMats[k];
        m.emissiveIntensity += ((lit ? 2.2 : 0.2) - m.emissiveIntensity) * ease;
      });
    }

    // Light on the palm, so a hit is visible without haptics.
    for (let h = 0; h < 2; h++) {
      const glow = this.base.palmGlows[h];
      const palm = this.hands.palms[h];
      glow.visible = palm.tracked && this.palmTouch[h];
      if (!glow.visible) continue;
      glow.position.copy(palm.center).addScaledVector(palm.normal, 0.012);
      glow.quaternion.setFromUnitVectors(this.zAxis, palm.normal);
      glow.scale.setScalar(1 + 0.12 * Math.sin(time * 9));
    }

    // Show which piece a pointing hand or the eyes will pick up.
    const ring = this.base.hoverRing;
    ring.visible = false;
    for (const entity of this.queries.hovered.entities) {
      if (!entity.object3D) continue;
      entity.object3D.getWorldPosition(this.tmp);
      this.base.root.worldToLocal(ring.position.copy(this.tmp));
      ring.position.y = BOARD_TOP + 0.003;
      ring.visible = true;
      break;
    }

    const since = time - this.solvedAt;
    this.base.rimMat.emissiveIntensity = this.solved
      ? 0.35 + 1.4 * Math.exp(-since * 2.2) + 0.08 * Math.sin(time * 2)
      : 0.05;
  }
}
