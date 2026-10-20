/**
 * The coach teaches by showing, not by text: a translucent ghost hand acts
 * out the move a level needs (an open palm in the beam, a palm tipped like a
 * tray, or a pinch that carries and turns a piece), right where it belongs on
 * the board. One short caption names the idea. The answer comes from the
 * solver, so every level gets a correct demo without hand-placed coordinates.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { DIRS, type Level } from './game/grid.js';
import { apertureVector } from './game/optics.js';
import { solve, type Solution } from './game/solver.js';
import { BEAM_Y, BOARD_TOP, cellToLocal, traySlot } from './board-visuals.js';

/** Seconds of no progress before the demo plays on a level you have finished before. */
const IDLE_REPLAY = 15;
/** First time on a level, the demo starts after this short pause. */
const FIRST_DELAY = 2.5;
const LOOP = 3.4;
const GHOST_OPACITY = 0.35;

interface Pose {
  position: Vector3;
  normal: Vector3;
  /** Extra turn about the palm normal, in radians (for showing a dial turn). */
  twist: number;
}

interface Demo {
  kind: 'palm' | 'pinch';
  /** One pose per hand for palm demos (two for a periscope). */
  poses: Pose[];
  /** Pinch demos: where the piece starts and where it lands. */
  from?: Vector3;
  to?: Vector3;
  turn?: number;
}

interface GhostHand {
  root: Group;
  index: Group;
  thumb: Group;
  material: MeshBasicMaterial;
}

const UP = new Vector3(0, 1, 0);
const PALM_DOWN = new Vector3(0, -1, 0);

function buildGhostHand(): GhostHand {
  const material = new MeshBasicMaterial({
    color: 0xbfeaff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const root = new Group();
  root.name = 'palmlight-ghost-hand';
  // Palm faces local -Y and fingers point along local -Z, like a real hand joint.
  const palm = new Mesh(new BoxGeometry(0.072, 0.016, 0.08), material);
  root.add(palm);
  const finger = new CapsuleGeometry(0.0075, 0.055, 4, 8);
  const xs = [0.027, 0.009, -0.009, -0.027];
  let index!: Group;
  xs.forEach((x, i) => {
    const pivot = new Group();
    pivot.position.set(x, 0, -0.04);
    const f = new Mesh(finger, material);
    f.rotation.x = Math.PI / 2;
    f.position.z = -0.035;
    pivot.add(f);
    root.add(pivot);
    if (i === 0) index = pivot;
  });
  const thumb = new Group();
  thumb.position.set(0.04, 0, 0.01);
  const t = new Mesh(new CapsuleGeometry(0.008, 0.045, 4, 8), material);
  t.rotation.x = Math.PI / 2;
  t.position.z = -0.03;
  thumb.add(t);
  thumb.rotation.y = -0.7;
  root.add(thumb);
  root.visible = false;
  root.renderOrder = 4;
  return { root, index, thumb, material };
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Coach {
  private hands: GhostHand[] = [buildGhostHand(), buildGhostHand()];
  /** Built on first use; undefined until then, null when there is no answer. */
  private demo: Demo | null | undefined = undefined;
  private level: Level | null = null;
  private traySide = 1;
  private startedAt = 0;
  private lastProgress = 0;
  private firstTime = false;
  private playing = false;
  private q = new Quaternion();
  private q2 = new Quaternion();
  private v = new Vector3();
  private rest = new Vector3();

  constructor(private board: Group) {
    for (const h of this.hands) board.add(h.root);
  }

  /** New level on the board. `firstTime` plays the demo early. */
  setLevel(level: Level, firstTime: boolean, traySide: number, time: number): void {
    this.firstTime = firstTime;
    this.startedAt = this.lastProgress = time;
    this.playing = false;
    this.level = level;
    this.traySide = traySide;
    this.demo = undefined;
    this.hide();
  }

  /** Call when the player makes progress (a move, a palm in the beam). */
  progress(time: number): void {
    this.lastProgress = time;
    if (this.playing) {
      this.playing = false;
      this.hide();
    }
  }

  update(time: number, solved: boolean): void {
    if (this.demo === null || solved || !this.level) {
      if (this.playing) this.hide();
      this.playing = false;
      return;
    }
    const wait = this.firstTime ? FIRST_DELAY : IDLE_REPLAY;
    if (!this.playing && time - this.lastProgress >= wait) {
      // Solve only now: most level loads never show the demo.
      if (this.demo === undefined) this.demo = this.buildDemo(this.level, this.traySide);
      if (!this.demo) return;
      this.playing = true;
      this.startedAt = time;
    }
    if (!this.playing || !this.demo) return;
    const t = ((time - this.startedAt) % LOOP) / LOOP;
    if (this.demo.kind === 'palm') this.animatePalms(this.demo, t);
    else this.animatePinch(this.demo, t);
  }

  hide(): void {
    for (const h of this.hands) {
      h.root.visible = false;
      h.material.opacity = 0;
    }
  }

  private buildDemo(level: Level, traySide: number): Demo | null {
    const solution: Solution | null = solve(level);
    if (!solution) return null;
    const n = level.size;
    const y = BOARD_TOP + BEAM_Y + 0.02;
    if (solution.palms.length > 0) {
      const poses: Pose[] = [];
      for (const palm of solution.palms) {
        const position = cellToLocal(n, palm.col, palm.row, new Vector3());
        position.y = y;
        const normal = new Vector3(palm.nx, 0, palm.nz).normalize();
        if (palm.lift) {
          const sky = level.sky?.[0];
          const beam = new Vector3(-palm.nx, 0, -palm.nz).normalize();
          let out = UP.clone();
          if (sky && solution.palms.length === 1 && (level.hands ?? 1) === 1) {
            const target = cellToLocal(n, sky.col, sky.row, new Vector3());
            target.y = BOARD_TOP + sky.height;
            out = target.sub(position).normalize();
          }
          normal.copy(out).sub(beam).normalize();
          poses.push({ position, normal, twist: 0 });
          if (sky && (level.hands ?? 1) === 2) {
            // Periscope: the upper hand turns the rising beam into the opening.
            const upper = position.clone();
            upper.y = BOARD_TOP + sky.height;
            const into = apertureVector(sky.aperture);
            const upperNormal = new Vector3(-into[0], -into[1] - 1, -into[2]).normalize();
            poses.push({ position: upper, normal: upperNormal, twist: 0 });
          }
        } else {
          poses.push({ position, normal, twist: 0 });
        }
      }
      return { kind: 'palm', poses: poses.slice(0, 2) };
    }
    const piece = solution.pieces[0];
    if (!piece) return null;
    const trayIndex = level.tray.findIndex((t) => t.kind === piece.kind && t.color === piece.color);
    const from = traySlot(n, Math.max(0, trayIndex), new Vector3(), traySide);
    from.y = y + 0.02;
    const to = cellToLocal(n, piece.col, piece.row, new Vector3());
    to.y = y + 0.02;
    return { kind: 'pinch', poses: [], from, to, turn: piece.kind === 'filter' ? 0 : (piece.angle % 8) * (Math.PI / 4) };
  }

  private place(h: GhostHand, position: Vector3, normal: Vector3, twist: number, opacity: number): void {
    h.root.visible = opacity > 0.01;
    h.material.opacity = opacity;
    h.root.position.copy(position).addScaledVector(normal, -0.012);
    this.q.setFromUnitVectors(PALM_DOWN, normal);
    this.q2.setFromAxisAngle(normal, twist);
    h.root.quaternion.copy(this.q2.multiply(this.q));
  }

  /** Glide in from the player's side, hold in the beam, fade out. */
  private animatePalms(demo: Demo, t: number): void {
    const fadeIn = ease(t / 0.15);
    const fadeOut = 1 - ease((t - 0.75) / 0.15);
    const opacity = GHOST_OPACITY * Math.min(fadeIn, fadeOut);
    const travel = ease(t / 0.35);
    this.hands.forEach((h, i) => {
      const pose = demo.poses[i];
      if (!pose) {
        h.root.visible = false;
        return;
      }
      this.rest.set(pose.position.x, pose.position.y + 0.08, pose.position.z + 0.14);
      this.v.lerpVectors(this.rest, pose.position, travel);
      this.place(h, this.v, pose.normal, 0, opacity);
    });
  }

  /** Pinch the piece in the tray, carry it to its cell while turning, let go. */
  private animatePinch(demo: Demo, t: number): void {
    const h = this.hands[0];
    this.hands[1].root.visible = false;
    if (!demo.from || !demo.to) return;
    const fadeIn = ease(t / 0.1);
    const fadeOut = 1 - ease((t - 0.82) / 0.12);
    const opacity = GHOST_OPACITY * Math.min(fadeIn, fadeOut);
    const pinch = ease((t - 0.1) / 0.12) * (1 - ease((t - 0.7) / 0.08));
    const carry = ease((t - 0.25) / 0.4);
    this.v.lerpVectors(demo.from, demo.to, carry);
    this.v.y += Math.sin(carry * Math.PI) * 0.05;
    this.place(h, this.v, PALM_DOWN, -(demo.turn ?? 0) * carry, opacity);
    h.index.rotation.x = -0.9 * pinch;
    h.thumb.rotation.y = -0.7 + 0.55 * pinch;
  }
}

/** Direction helper kept for tests and tools: travel vector of a grid direction. */
export const dirVector = (dir: number) => new Vector3(DIRS[dir][0], 0, DIRS[dir][1]).normalize();
