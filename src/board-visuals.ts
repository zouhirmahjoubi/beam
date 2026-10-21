import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Color, Level, PieceKind } from './game/grid.js';
import { apertureVector } from './game/optics.js';

/** Grid cell size in meters. A 6 x 6 board is 36 cm wide. */
export const CELL = 0.06;
/** Height of the board's top surface above its origin. */
export const BOARD_TOP = 0.012;
/** Beam height above the board top, level with the middle of a mirror. */
export const BEAM_Y = 0.024;
export const BOARD_SIZE = 6;
export const MAX_DRAWN_SEGMENTS = 40;
export const TRAY_SLOTS = 3;
const RIM = 0.018;

/** Beam colors per game color: [core, glow]. Shapes also differ, for color blind play. */
export const BEAM_COLORS: Record<Color, [number, number]> = {
  0: [0xf2fbff, 0x7fd8ff],
  1: [0xc4f6ff, 0x00c2ff],
  2: [0xfff0cf, 0xff9f1c],
};

const glowMat = (color: number, opacity: number) =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });

const mat = {
  base: new MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.35, metalness: 0.2 }),
  rim: new MeshStandardMaterial({ color: 0x111722, emissive: 0x7fd8ff, emissiveIntensity: 0.05, roughness: 0.4 }),
  grid: new LineBasicMaterial({ color: 0x2b3a4d, transparent: true, opacity: 0.8 }),
  blocker: new MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8, metalness: 0.05 }),
  dark: new MeshStandardMaterial({ color: 0x1a202b, roughness: 0.3, metalness: 0.6 }),
  lens: new MeshBasicMaterial({ color: 0xf2fbff }),
  mirrorFace: new MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.04, metalness: 1 }),
  splitterFace: new MeshStandardMaterial({
    color: 0x9fdcff,
    roughness: 0.05,
    metalness: 0.4,
    transparent: true,
    opacity: 0.45,
  }),
  ghost: new MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.22, depthWrite: false }),
  tray: new MeshStandardMaterial({ color: 0x0e131b, roughness: 0.5, metalness: 0.1 }),
  dotOff: new MeshBasicMaterial({ color: 0x24303f }),
  dotOn: new MeshBasicMaterial({ color: 0x7fd8ff }),
  palmGlow: glowMat(0xffffff, 0.55),
  hover: glowMat(0x7fd8ff, 0.75),
};

export const beamMats: Record<Color, [MeshBasicMaterial, MeshBasicMaterial]> = {
  0: [new MeshBasicMaterial({ color: BEAM_COLORS[0][0] }), glowMat(BEAM_COLORS[0][1], 0.32)],
  1: [new MeshBasicMaterial({ color: BEAM_COLORS[1][0] }), glowMat(BEAM_COLORS[1][1], 0.38)],
  2: [new MeshBasicMaterial({ color: BEAM_COLORS[2][0] }), glowMat(BEAM_COLORS[2][1], 0.38)],
};

const filterMats: Record<Color, MeshStandardMaterial> = {
  0: new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
  1: new MeshStandardMaterial({
    color: BEAM_COLORS[1][1],
    emissive: BEAM_COLORS[1][1],
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.6,
  }),
  2: new MeshStandardMaterial({
    color: BEAM_COLORS[2][1],
    emissive: BEAM_COLORS[2][1],
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.6,
  }),
};

const geo = {
  blocker: new BoxGeometry(CELL * 0.82, 0.036, CELL * 0.82),
  emitter: new BoxGeometry(0.044, 0.04, 0.044),
  lens: new CylinderGeometry(0.008, 0.008, 0.012, 16),
  crystalBase: new CylinderGeometry(0.016, 0.019, 0.006, 24),
  face: new BoxGeometry(0.05, 0.034, 0.003),
  pieceBase: new CylinderGeometry(0.022, 0.024, 0.007, 24),
  knob: new CylinderGeometry(0.006, 0.006, 0.012, 12),
  filterDisc: new CylinderGeometry(0.016, 0.016, 0.03, 32),
  beamCore: new CylinderGeometry(0.0018, 0.0018, 1, 6, 1, true),
  beamGlow: new CylinderGeometry(0.0065, 0.0065, 1, 10, 1, true),
  ghost: new PlaneGeometry(CELL * 0.9, CELL * 0.9),
  stand: new CylinderGeometry(0.025, 0.06, 1, 24),
  trayPad: new BoxGeometry(0.075, 0.006, TRAY_SLOTS * 0.075),
  dot: new SphereGeometry(0.004, 12, 8),
  palmGlow: new CircleGeometry(0.03, 24),
  aperture: new TorusGeometry(0.022, 0.0025, 8, 32),
};

/** Mark on a colored filter, the shape of the crystal it feeds, so color is never the only cue. */
const filterMarkGeo: Record<Color, BufferGeometry | null> = {
  0: null,
  1: new BoxGeometry(0.007, 0.007, 0.007),
  2: new TetrahedronGeometry(0.0065, 0),
};

/** Crystal shape per color, so color is never the only cue. */
const crystalGeo: Record<Color, BufferGeometry> = {
  0: new OctahedronGeometry(0.017, 0),
  1: new BoxGeometry(0.022, 0.022, 0.022),
  2: new TetrahedronGeometry(0.02, 0),
};

export interface BaseView {
  root: Group;
  beamCore: Mesh[];
  beamGlow: Mesh[];
  ghost: Mesh;
  stand: Mesh;
  rimMat: MeshStandardMaterial;
  palmGlows: Mesh[];
  dots: Mesh[];
  /** Ring under the piece a hand ray or the eyes point at. */
  hoverRing: Mesh;
  trayPad: Mesh;
}

export interface LevelView {
  group: Group;
  crystals: Mesh[];
  crystalMats: MeshStandardMaterial[];
  sky: Mesh[];
  skyMats: MeshStandardMaterial[];
}

/** Local position of a cell center (or a fractional cell) on the board top. */
export function cellToLocal(size: number, col: number, row: number, out: Vector3): Vector3 {
  return out.set((col - (size - 1) / 2) * CELL, BOARD_TOP, (row - (size - 1) / 2) * CELL);
}

/** Local position of tray slot `i`, beside the board on `side` (1 right, -1 left). */
export function traySlot(size: number, i: number, out: Vector3, side = 1): Vector3 {
  // Past three pieces (the maker's palette), slots fill a second column further out.
  const column = Math.floor(i / TRAY_SLOTS);
  const x = side * ((size * CELL) / 2 + RIM + 0.05 + column * 0.075);
  const z = ((i % TRAY_SLOTS) - (TRAY_SLOTS - 1) / 2) * 0.075;
  return out.set(x, BOARD_TOP, z);
}

/** The persistent board: base, rims, grid, tray, beam pool and feedback. */
export function buildBase(levelCount: number): BaseView {
  const n = BOARD_SIZE;
  const width = n * CELL;
  const root = new Group();
  root.name = 'palmlight-board';

  const base = new Mesh(new BoxGeometry(width, BOARD_TOP, width), mat.base);
  base.position.y = BOARD_TOP / 2;
  root.add(base);

  const rimMat = mat.rim.clone();
  const outer = width + RIM * 2;
  for (const [w, d, x, z] of [
    [outer, RIM, 0, -(width + RIM) / 2],
    [outer, RIM, 0, (width + RIM) / 2],
    [RIM, width, -(width + RIM) / 2, 0],
    [RIM, width, (width + RIM) / 2, 0],
  ]) {
    const rim = new Mesh(new BoxGeometry(w, BOARD_TOP + 0.004, d), rimMat);
    rim.position.set(x, (BOARD_TOP + 0.004) / 2, z);
    root.add(rim);
  }

  const pts: number[] = [];
  const half = width / 2;
  const y = BOARD_TOP + 0.0005;
  for (let i = 1; i < n; i++) {
    const t = -half + i * CELL;
    pts.push(t, y, -half, t, y, half, -half, y, t, half, y, t);
  }
  const gridGeo = new BufferGeometry();
  gridGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  root.add(new LineSegments(gridGeo, mat.grid));

  const p = new Vector3();
  const pad = new Mesh(geo.trayPad, mat.tray);
  traySlot(n, (TRAY_SLOTS - 1) / 2, p);
  pad.position.set(p.x, 0.003, p.z);
  root.add(pad);

  // Level progress along the far rim: one dot per level.
  const dots: Mesh[] = [];
  for (let i = 0; i < levelCount; i++) {
    const dot = new Mesh(geo.dot, mat.dotOff);
    dot.position.set((i - (levelCount - 1) / 2) * 0.022, BOARD_TOP + 0.006, -(width + RIM) / 2);
    root.add(dot);
    dots.push(dot);
  }

  const beamCore: Mesh[] = [];
  const beamGlow: Mesh[] = [];
  for (let i = 0; i < MAX_DRAWN_SEGMENTS; i++) {
    const core = new Mesh(geo.beamCore, beamMats[0][0]);
    const glow = new Mesh(geo.beamGlow, beamMats[0][1]);
    core.visible = glow.visible = false;
    glow.renderOrder = 2;
    root.add(core, glow);
    beamCore.push(core);
    beamGlow.push(glow);
  }

  const ghost = new Mesh(geo.ghost, mat.ghost);
  ghost.rotation.x = -Math.PI / 2;
  ghost.visible = false;
  root.add(ghost);

  const palmGlows = [0, 1].map(() => {
    // Each hand fades its own glow, so each needs its own material.
    const g = new Mesh(geo.palmGlow, mat.palmGlow.clone());
    g.visible = false;
    g.renderOrder = 3;
    root.add(g);
    return g;
  });

  const hoverRing = new Mesh(geo.aperture, mat.hover);
  hoverRing.rotation.x = Math.PI / 2;
  hoverRing.scale.setScalar(1.25);
  hoverRing.visible = false;
  hoverRing.renderOrder = 3;
  root.add(hoverRing);

  // Shown only when no real desk was found, so the board never floats.
  const stand = new Mesh(geo.stand, mat.dark);
  stand.visible = false;
  root.add(stand);

  return { root, beamCore, beamGlow, ghost, stand, rimMat, palmGlows, dots, hoverRing, trayPad: pad };
}

function crystalMaterial(color: Color): MeshStandardMaterial {
  const glow = BEAM_COLORS[color][1];
  return new MeshStandardMaterial({
    color: color === 0 ? 0xbfefff : glow,
    emissive: glow,
    emissiveIntensity: 0.12,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
  });
}

/** Fixed pieces of one level: emitter, blockers, crystals and sky crystals. */
export function buildLevel(level: Level): LevelView {
  const n = level.size;
  const group = new Group();
  const p = new Vector3();

  for (const b of level.blockers) {
    const block = new Mesh(geo.blocker, mat.blocker);
    cellToLocal(n, b.col, b.row, p);
    block.position.set(p.x, p.y + 0.018, p.z);
    group.add(block);
  }

  const emitter = new Group();
  const body = new Mesh(geo.emitter, mat.dark);
  body.position.y = 0.02;
  const lens = new Mesh(geo.lens, mat.lens);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0.024, BEAM_Y, 0);
  emitter.add(body, lens);
  cellToLocal(n, level.emitter.col, level.emitter.row, emitter.position);
  emitter.rotation.y = (level.emitter.dir * Math.PI) / 4;
  group.add(emitter);

  const crystals: Mesh[] = [];
  const crystalMats: MeshStandardMaterial[] = [];
  for (const c of level.crystals) {
    const m = crystalMaterial(c.color);
    const crystal = new Mesh(crystalGeo[c.color], m);
    const stand = new Mesh(geo.crystalBase, mat.dark);
    cellToLocal(n, c.col, c.row, p);
    stand.position.set(p.x, p.y + 0.003, p.z);
    crystal.position.set(p.x, p.y + BEAM_Y, p.z);
    group.add(stand, crystal);
    crystals.push(crystal);
    crystalMats.push(m);
  }

  const sky: Mesh[] = [];
  const skyMats: MeshStandardMaterial[] = [];
  const axis = new Vector3();
  const q = new Quaternion();
  for (const s of level.sky ?? []) {
    const m = crystalMaterial(s.color);
    const crystal = new Mesh(crystalGeo[s.color], m);
    crystal.scale.setScalar(1.3);
    cellToLocal(n, s.col, s.row, p);
    crystal.position.set(p.x, p.y + s.height, p.z);
    // A ring marks the opening light has to enter through.
    const [ax, ay, az] = apertureVector(s.aperture);
    axis.set(ax, ay, az);
    const ring = new Mesh(geo.aperture, m);
    q.setFromUnitVectors(new Vector3(0, 0, 1), axis);
    ring.quaternion.copy(q);
    ring.position.copy(crystal.position).addScaledVector(axis, 0.03);
    group.add(crystal, ring);
    sky.push(crystal);
    skyMats.push(m);
  }

  return { group, crystals, crystalMats, sky, skyMats };
}

/** A movable piece. Mirror and splitter lines run along local +x. */
export function buildPiece(kind: PieceKind, color: Color = 0): Group {
  const g = new Group();
  g.name = `palmlight-${kind}`;
  const base = new Mesh(geo.pieceBase, mat.dark);
  base.position.y = 0.0035;
  g.add(base);
  if (kind === 'filter') {
    // A round glass puck: it colors the beam from any direction.
    const puck = new Mesh(geo.filterDisc, filterMats[color]);
    puck.position.y = BEAM_Y;
    const ring = new Mesh(geo.aperture, mat.dark);
    ring.scale.setScalar(0.78);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = BEAM_Y + 0.016;
    g.add(puck, ring);
    const markGeo = filterMarkGeo[color];
    if (markGeo) {
      const mark = new Mesh(markGeo, mat.lens);
      mark.position.y = BEAM_Y + 0.022;
      g.add(mark);
    }
  } else {
    const face = new Mesh(geo.face, kind === 'mirror' ? mat.mirrorFace : mat.splitterFace);
    face.position.y = BEAM_Y - 0.001;
    const knob = new Mesh(geo.knob, mat.dark);
    knob.position.y = BEAM_Y + 0.022;
    g.add(face, knob);
  }
  return g;
}

export const dotMaterials = { off: mat.dotOff, on: mat.dotOn };
