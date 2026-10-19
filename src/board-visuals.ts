import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
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
  Vector3,
} from '@iwsdk/core';
import { MAX_SEGMENTS, type Level } from './game/grid.js';

/** Grid cell size in meters. A 6 x 6 board is 36 cm wide. */
export const CELL = 0.06;
/** Height of the board's top surface above its origin. */
export const BOARD_TOP = 0.012;
/** Beam height above the board top, level with the middle of a mirror. */
export const BEAM_Y = 0.024;
const RIM = 0.018;

const BEAM_COLOR = 0x5fe1ff;

const mat = {
  base: new MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.35, metalness: 0.2 }),
  rim: new MeshStandardMaterial({
    color: 0x111722,
    emissive: BEAM_COLOR,
    emissiveIntensity: 0.05,
    roughness: 0.4,
  }),
  grid: new LineBasicMaterial({ color: 0x2b3a4d, transparent: true, opacity: 0.8 }),
  blocker: new MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8, metalness: 0.05 }),
  emitterBody: new MeshStandardMaterial({ color: 0x1a202b, roughness: 0.3, metalness: 0.6 }),
  lens: new MeshBasicMaterial({ color: 0xc9f6ff }),
  mirrorFace: new MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.04, metalness: 1 }),
  mirrorFrame: new MeshStandardMaterial({ color: 0x1c2330, roughness: 0.4, metalness: 0.5 }),
  beamCore: new MeshBasicMaterial({ color: 0xe8fdff }),
  beamGlow: new MeshBasicMaterial({
    color: BEAM_COLOR,
    transparent: true,
    opacity: 0.32,
    blending: AdditiveBlending,
    depthWrite: false,
  }),
  ghost: new MeshBasicMaterial({
    color: BEAM_COLOR,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  stand: new MeshStandardMaterial({ color: 0x151a22, roughness: 0.6, metalness: 0.3 }),
  tray: new MeshStandardMaterial({ color: 0x0e131b, roughness: 0.5, metalness: 0.1 }),
};

const geo = {
  blocker: new BoxGeometry(CELL * 0.82, 0.036, CELL * 0.82),
  emitter: new BoxGeometry(0.044, 0.04, 0.044),
  lens: new CylinderGeometry(0.008, 0.008, 0.012, 16),
  crystal: new OctahedronGeometry(0.017, 0),
  crystalBase: new CylinderGeometry(0.016, 0.019, 0.006, 24),
  mirrorFace: new BoxGeometry(0.05, 0.034, 0.003),
  mirrorBase: new CylinderGeometry(0.022, 0.024, 0.007, 24),
  mirrorKnob: new CylinderGeometry(0.006, 0.006, 0.012, 12),
  beamCore: new CylinderGeometry(0.0018, 0.0018, 1, 6, 1, true),
  beamGlow: new CylinderGeometry(0.0065, 0.0065, 1, 10, 1, true),
  ghost: new PlaneGeometry(CELL * 0.9, CELL * 0.9),
  stand: new CylinderGeometry(0.025, 0.06, 1, 24),
  trayPad: new BoxGeometry(0.075, 0.006, 0.17),
};

export interface BoardView {
  root: Group;
  crystals: Mesh[];
  crystalMats: MeshStandardMaterial[];
  beamCore: Mesh[];
  beamGlow: Mesh[];
  ghost: Mesh;
  stand: Mesh;
  rimMat: MeshStandardMaterial;
}

/** Local position of a cell center (or a fractional cell) on the board top. */
export function cellToLocal(size: number, col: number, row: number, out: Vector3): Vector3 {
  return out.set((col - (size - 1) / 2) * CELL, BOARD_TOP, (row - (size - 1) / 2) * CELL);
}

/** Local position of tray slot `i`, to the right of the board. */
export function traySlot(size: number, i: number, count: number, out: Vector3): Vector3 {
  const x = (size * CELL) / 2 + RIM + 0.05;
  const z = (i - (count - 1) / 2) * 0.075;
  return out.set(x, BOARD_TOP, z);
}

export function buildBoard(level: Level): BoardView {
  const n = level.size;
  const width = n * CELL;
  const root = new Group();
  root.name = 'beam-board';

  const base = new Mesh(new BoxGeometry(width, BOARD_TOP, width), mat.base);
  base.position.y = BOARD_TOP / 2;
  root.add(base);

  const rimMat = mat.rim.clone();
  const outer = width + RIM * 2;
  const rimGeo = [
    [outer, RIM, 0, -(width + RIM) / 2],
    [outer, RIM, 0, (width + RIM) / 2],
    [RIM, width, -(width + RIM) / 2, 0],
    [RIM, width, (width + RIM) / 2, 0],
  ];
  for (const [w, d, x, z] of rimGeo) {
    const rim = new Mesh(new BoxGeometry(w, BOARD_TOP + 0.004, d), rimMat);
    rim.position.set(x, (BOARD_TOP + 0.004) / 2, z);
    root.add(rim);
  }

  const pts: number[] = [];
  const half = width / 2;
  for (let i = 1; i < n; i++) {
    const t = -half + i * CELL;
    pts.push(t, BOARD_TOP + 0.0005, -half, t, BOARD_TOP + 0.0005, half);
    pts.push(-half, BOARD_TOP + 0.0005, t, half, BOARD_TOP + 0.0005, t);
  }
  const gridGeo = new BufferGeometry();
  gridGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  root.add(new LineSegments(gridGeo, mat.grid));

  const p = new Vector3();
  for (const b of level.blockers) {
    const block = new Mesh(geo.blocker, mat.blocker);
    cellToLocal(n, b.col, b.row, p);
    block.position.set(p.x, p.y + 0.018, p.z);
    root.add(block);
  }

  const emitter = new Group();
  const body = new Mesh(geo.emitter, mat.emitterBody);
  body.position.y = 0.02;
  const lens = new Mesh(geo.lens, mat.lens);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0.024, BEAM_Y, 0);
  emitter.add(body, lens);
  cellToLocal(n, level.emitter.col, level.emitter.row, p);
  emitter.position.copy(p);
  emitter.rotation.y = (level.emitter.dir * Math.PI) / 4;
  root.add(emitter);

  const crystals: Mesh[] = [];
  const crystalMats: MeshStandardMaterial[] = [];
  for (const c of level.crystals) {
    const m = new MeshStandardMaterial({
      color: 0x9fefff,
      emissive: BEAM_COLOR,
      emissiveIntensity: 0.12,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });
    const crystal = new Mesh(geo.crystal, m);
    const stand = new Mesh(geo.crystalBase, mat.emitterBody);
    cellToLocal(n, c.col, c.row, p);
    stand.position.set(p.x, p.y + 0.003, p.z);
    crystal.position.set(p.x, p.y + BEAM_Y, p.z);
    crystal.scale.set(1, 1.35, 1);
    root.add(stand, crystal);
    crystals.push(crystal);
    crystalMats.push(m);
  }

  const beamCore: Mesh[] = [];
  const beamGlow: Mesh[] = [];
  for (let i = 0; i < MAX_SEGMENTS + 1; i++) {
    const core = new Mesh(geo.beamCore, mat.beamCore);
    const glow = new Mesh(geo.beamGlow, mat.beamGlow);
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

  for (let i = 0; i < Math.max(1, Math.ceil(level.mirrors / 2)); i++) {
    const pad = new Mesh(geo.trayPad, mat.tray);
    traySlot(n, 0, 1, p);
    pad.position.set(p.x, 0.003, p.z + i * 0.17);
    root.add(pad);
  }

  // Shown only when no real desk was found, so the board never floats.
  const stand = new Mesh(geo.stand, mat.stand);
  stand.visible = false;
  root.add(stand);

  return { root, crystals, crystalMats, beamCore, beamGlow, ghost, stand, rimMat };
}

/** A movable two-sided mirror. Its mirror line runs along local +x. */
export function buildMirror(): Group {
  const g = new Group();
  g.name = 'beam-mirror';
  const base = new Mesh(geo.mirrorBase, mat.mirrorFrame);
  base.position.y = 0.0035;
  const face = new Mesh(geo.mirrorFace, mat.mirrorFace);
  face.position.y = BEAM_Y - 0.001;
  const knob = new Mesh(geo.mirrorKnob, mat.mirrorFrame);
  knob.position.y = BEAM_Y + 0.022;
  g.add(base, face, knob);
  return g;
}
