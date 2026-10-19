import {
  createSystem,
  Grabbed,
  OneHandGrabbable,
  Quaternion,
  setWorldPosition,
  setWorldQuaternion,
  Vector3,
  VisibilityState,
  XRPlane,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import { playLit, playSnap, playSolved, playTurn } from './audio.js';
import { MirrorPiece } from './beam-components.js';
import {
  BEAM_Y,
  buildBoard,
  buildMirror,
  CELL,
  cellToLocal,
  traySlot,
  type BoardView,
} from './board-visuals.js';
import { fixedCells, trace, type Level, type PlacedMirror } from './game/grid.js';
import { FIRST_LIGHT } from './game/levels.js';

const STEP = Math.PI / 4;
/** How far in front of the eyes the board sits, measured flat. */
const REACH = 0.45;
/** Board height below the eyes when no desk is found (seated). */
const FALLBACK_DROP = 0.42;
/** Seconds after entering a session during which the board may re-seat on a desk. */
const PLACEMENT_WINDOW = 4;

interface NativePlane {
  orientation?: string;
  semanticLabel?: string;
}

/**
 * Owns the Beam board: seats it on the player's desk, turns grabbed mirrors
 * into grid moves, traces the beam and lights crystals.
 */
export class BoardSystem extends createSystem({
  mirrors: { required: [MirrorPiece] },
  held: { required: [MirrorPiece, Grabbed] },
  planes: { required: [XRPlane] },
}) {
  private level: Level = FIRST_LIGHT;
  private view!: BoardView;
  private fixed = new Uint8Array(0);
  private placed: Array<PlacedMirror | null> = [];
  private candidate: PlacedMirror[] = [];
  private candidateOk: boolean[] = [];
  private effective: Array<PlacedMirror | null> = [];
  private signature = new Int16Array(0);
  private pendingSnap = 0;
  private litMask = 0;
  private solved = false;
  private solvedAt = -10;

  private placeFrom = 0;
  private placeUntil = 0;
  private nextPlaceAt = 0;
  private touched = false;
  private immersive = false;
  private onDesk = false;

  private head = new Vector3();
  private fwd = new Vector3();
  private tmp = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private up = new Vector3(0, 1, 0);
  private q = new Quaternion();

  init(): void {
    const level = this.level;
    this.view = buildBoard(level);
    this.world.createTransformEntity(this.view.root);

    this.fixed = new Uint8Array(level.size * level.size);
    for (const k of fixedCells(level)) {
      const [col, row] = k.split(',').map(Number);
      this.fixed[col * level.size + row] = 1;
    }

    for (let i = 0; i < level.mirrors; i++) {
      this.placed.push(null);
      this.effective.push(null);
      this.candidate.push({ col: 0, row: 0, angle: 0 });
      this.candidateOk.push(false);
      const mirror = this.world.createTransformEntity(buildMirror());
      mirror.addComponent(MirrorPiece, { index: i });
      mirror.addComponent(OneHandGrabbable, {
        translate: true,
        rotate: true,
        rotateMin: [0, -Math.PI, 0],
        rotateMax: [0, Math.PI, 0],
      });
    }
    this.signature = new Int16Array(level.mirrors).fill(-2);

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
        this.placeFrom = -1;
      }),
    );
  }

  update(delta: number, time: number): void {
    if (this.placeFrom === -1) {
      this.placeFrom = time;
      this.placeUntil = time + PLACEMENT_WINDOW;
      this.nextPlaceAt = 0;
      this.touched = false;
    }
    if (time < this.placeUntil && !this.touched && time >= this.nextPlaceAt) {
      this.seatBoard();
      this.nextPlaceAt = time + 0.5;
    }

    for (const entity of this.queries.held.entities) {
      this.readCandidate(entity);
    }

    if (this.pendingSnap !== 0) {
      for (const entity of this.queries.mirrors.entities) {
        const i = this.indexOf(entity);
        if ((this.pendingSnap & (1 << i)) === 0) continue;
        if (this.candidateOk[i]) {
          const c = this.candidate[i];
          this.placed[i] = { col: c.col, row: c.row, angle: c.angle };
          playSnap();
        } else {
          this.placed[i] = null;
        }
        this.candidateOk[i] = false;
        this.moveToSlot(entity);
      }
      this.pendingSnap = 0;
      this.view.ghost.visible = false;
    }

    this.refreshBeam(time);
    this.animate(delta, time);
  }

  private indexOf(entity: Entity): number {
    return entity.getValue(MirrorPiece, 'index') ?? 0;
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

    const root = this.view.root;
    root.position.set(this.head.x + this.fwd.x * REACH, height, this.head.z + this.fwd.z * REACH);
    root.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    root.updateMatrixWorld(true);

    const stand = this.view.stand;
    stand.visible = !this.onDesk && height > 0.1;
    stand.scale.set(1, Math.max(height, 0.01), 1);
    stand.position.set(0, -height / 2, 0);

    if (!this.immersive) {
      root.getWorldPosition(this.tmp);
      this.world.camera.lookAt(this.tmp);
    }
    for (const entity of this.queries.mirrors.entities) this.moveToSlot(entity);
  }

  /** Put a mirror on its grid cell, or back in the tray. */
  private moveToSlot(entity: Entity): void {
    const object = entity.object3D;
    if (object == null) return;
    const i = this.indexOf(entity);
    const m = this.placed[i];
    const root = this.view.root;
    if (m) cellToLocal(this.level.size, m.col, m.row, this.tmp);
    else traySlot(this.level.size, i, this.level.mirrors, this.tmp);
    root.localToWorld(this.tmp);
    setWorldPosition(object, this.tmp);
    this.q.setFromAxisAngle(this.up, root.rotation.y + (m ? m.angle * STEP : 0));
    setWorldQuaternion(object, this.q);
  }

  /** Turn a held mirror's pose into the cell and angle it would snap to. */
  private readCandidate(entity: Entity): void {
    const object = entity.object3D;
    if (object == null) return;
    const i = this.indexOf(entity);
    const n = this.level.size;
    const root = this.view.root;

    object.getWorldPosition(this.tmp);
    root.worldToLocal(this.tmp);
    const col = Math.round(this.tmp.x / CELL + (n - 1) / 2);
    const row = Math.round(this.tmp.z / CELL + (n - 1) / 2);
    const nearBoard = this.tmp.y > -0.03 && this.tmp.y < 0.15;

    object.getWorldQuaternion(this.q);
    this.a.set(1, 0, 0).applyQuaternion(this.q);
    const yaw = Math.atan2(-this.a.z, this.a.x) - root.rotation.y;
    const angle = (((Math.round(yaw / STEP) % 8) + 8) % 8) as number;

    const c = this.candidate[i];
    if (this.candidateOk[i] && angle !== c.angle) playTurn();
    c.col = col;
    c.row = row;
    c.angle = angle;
    this.candidateOk[i] = nearBoard && this.isFree(col, row, i);

    const ghost = this.view.ghost;
    ghost.visible = this.candidateOk[i];
    if (ghost.visible) {
      cellToLocal(n, col, row, ghost.position);
      ghost.position.y += 0.001;
    }
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

  /** Re-trace only when a mirror's effective cell or angle changed. */
  private refreshBeam(time: number): void {
    const n = this.level.size;
    let changed = false;
    for (let i = 0; i < this.placed.length; i++) {
      const held = this.isHeld(i);
      const m = held ? (this.candidateOk[i] ? this.candidate[i] : null) : this.placed[i];
      this.effective[i] = m;
      const sig = m ? (m.col * n + m.row) * 8 + (m.angle % 4) : -1;
      if (sig !== this.signature[i]) {
        this.signature[i] = sig;
        changed = true;
      }
    }
    if (!changed) return;

    const result = trace(this.level, this.effective);
    const { beamCore, beamGlow } = this.view;
    for (let s = 0; s < beamCore.length; s++) {
      const on = s < result.points.length - 1;
      beamCore[s].visible = beamGlow[s].visible = on;
      if (!on) continue;
      const p0 = result.points[s];
      const p1 = result.points[s + 1];
      cellToLocal(n, p0.col, p0.row, this.a).y += BEAM_Y;
      cellToLocal(n, p1.col, p1.row, this.b).y += BEAM_Y;
      const length = this.a.distanceTo(this.b);
      this.tmp.subVectors(this.b, this.a).normalize();
      for (const mesh of [beamCore[s], beamGlow[s]]) {
        mesh.position.addVectors(this.a, this.b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(this.up, this.tmp);
        mesh.scale.set(1, Math.max(length, 0.001), 1);
      }
    }

    let mask = 0;
    for (const k of result.lit) mask |= 1 << k;
    let step = 0;
    for (let k = 0; k < this.level.crystals.length; k++) {
      if (mask & (1 << k) && !(this.litMask & (1 << k))) playLit(step++);
    }
    this.litMask = mask;

    if (result.solved && !this.solved) {
      this.solvedAt = time;
      playSolved();
    }
    this.solved = result.solved;
  }

  private isHeld(i: number): boolean {
    for (const entity of this.queries.held.entities) {
      if (this.indexOf(entity) === i) return true;
    }
    return false;
  }

  private animate(delta: number, time: number): void {
    const { crystals, crystalMats, rimMat } = this.view;
    for (let k = 0; k < crystals.length; k++) {
      const lit = (this.litMask & (1 << k)) !== 0;
      crystals[k].rotation.y += delta * (lit ? 1.8 : 0.35);
      const target = lit ? 2.2 : 0.12;
      const m = crystalMats[k];
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, delta * 8);
    }
    const since = time - this.solvedAt;
    rimMat.emissiveIntensity = this.solved
      ? 0.35 + 1.4 * Math.exp(-since * 2.2) + 0.08 * Math.sin(time * 2)
      : 0.05;
  }
}
