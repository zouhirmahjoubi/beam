import {
  createSystem,
  DepthOccludable,
  DistanceGrabbable,
  Grabbed,
  GrabSystem,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  BoxGeometry,
  MovementMode,
  PokeInteractable,
  Pressed,
  Quaternion,
  RayInteractable,
  setWorldPosition,
  setWorldQuaternion,
  Vector3,
  VisibilityState,
  XRPlane,
  type Entity,
  type UIKitMLAsset,
  type Object3D,
} from '@iwsdk/core';
import { playLit, playPalm, playSnap, playSolved, playTurn } from './audio.js';
import { BoardButton, BoardPiece } from './beam-components.js';
import {
  BEAM_Y,
  BOARD_SIZE,
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
import { Coach } from './coach.js';
import { DeskAnchor, type FrameLike } from './desk-anchor.js';
import { generateDaily } from './game/daily.js';
import { LEVELS } from './game/levels.js';
import {
  currentStreak,
  dayKey,
  loadProgress,
  recordDailySolve,
  saveProgress,
  type SaveData,
  type SavedPiece,
} from './progress.js';
import { apertureVector, freeTrace, reflect3, type FreeResult, type PalmDisc, type SkyTarget, type V3 } from './game/optics.js';
import { PALM_RADIUS, PalmReader, palmFacesHead, type HandSource } from './palms.js';

const STEP = Math.PI / 4;
/** Board width in meters, without the rim. */
const BOARD_SIZE_M = BOARD_SIZE * CELL;
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
/** The button bar tilts back so it faces a seated player's eyes. */
const CONTROLS_TILT = -Math.PI * 0.32;
/** Hit area for one board button, in meters; resized from the button layout. */
const BUTTON_HIT_GEOMETRY = new BoxGeometry(1, 1, 1);
const BUTTON_IDS = ['restart-button', 'next-button', 'daily-button', 'hand-button'];
/** Invisible until hovered, but still hit by rays and fingertips. */
const BUTTON_HIT_MATERIAL = new MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0, depthWrite: false });
/** Palm glow fades in over 0.1 s, out over 0.15 s, and holds 0.15 s after the beam leaves. */
const GLOW_IN = 0.1;
const GLOW_OUT = 0.15;
const GLOW_HOLD = 0.15;
const GLOW_OPACITY = 0.55;
/**
 * The Quest reserves a pinch made with the palm toward the headset (on the
 * left hand it leaves the session), so a grab in that pose is let go.
 */
const PALM_TO_HEAD_LIMIT = 0.5;
/** Frame time readout: a 72 fps frame budget, sampled over about 3 seconds. */
const FRAME_BUDGET_MS = 13.9;
const FRAME_SAMPLES = 216;
/** How far in front of the eyes the pause card floats. */
const PAUSE_DISTANCE = 0.7;
/** The caption floats above the far edge, tilted toward the player. */
const HINT_TILT = -0.42;

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
  buttonsPressed: { required: [BoardButton, Pressed] },
  buttonsHovered: { required: [BoardButton, Hovered] },
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

  private traySide = 1;
  private coach!: Coach;
  private now = 0;
  private hintCard: Entity | undefined;
  private hintText: { setProperties(p: { text: string }): void } | undefined;
  private desk = new DeskAnchor();
  private deskRestored = false;
  private deskSaved = false;
  private anchorPos = new Vector3();
  private anchorQuat = new Quaternion();
  private save!: SaveData;
  /** True while the daily puzzle is on the board instead of a chapter level. */
  private daily = false;
  private dailyCache: Level | null = null;
  private dailyLabel: { setProperties(p: { text: string }): void } | undefined;
  private glowLevel = [0, 0];
  private lastPalmTouch = [-10, -10];
  private guardMask = 0;
  private headLocal = new Vector3();
  private fpsOn = false;
  private fpsCard: Entity | undefined;
  private fpsText: { setProperties(p: { text: string }): void } | undefined;
  private frameMs = new Float32Array(FRAME_SAMPLES);
  private frameIndex = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  /** Last readout text, kept for test scripts. */
  fpsLabel = '';
  private paused = false;
  private controls: Entity | undefined;
  private pauseCard: Entity | undefined;
  private handLabel: { setProperties(p: { text: string }): void } | undefined;
  private tilt = new Quaternion();
  private buttonHits: Entity[] = [];
  private buttonEls: Array<{ getWorldPosition(v: Vector3): Vector3 } | undefined> = [];
  private hitsPlaced = false;
  private c = new Vector3();
  private xAxis = new Vector3(1, 0, 0);

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
  private q2 = new Quaternion();

  init(): void {
    this.base = buildBase(LEVELS.length);
    const board = this.world.createTransformEntity(this.base.root);
    // Real hands and objects hide the beam where they pass in front of it.
    const beams = new Group();
    for (let i = 0; i < this.base.beamCore.length; i++) beams.add(this.base.beamCore[i], this.base.beamGlow[i]);
    this.world.createTransformEntity(beams, board).addComponent(DepthOccludable);

    this.queries.held.subscribe('qualify', (entity) => {
      this.touched = true;
      this.guardPalmPinch(entity);
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
        const immersive = state !== VisibilityState.NonImmersive;
        // A system menu blurs the session; only entering or leaving it re-seats the board.
        if (immersive !== this.immersive) this.placeRequested = true;
        this.immersive = immersive;
      }),
    );
    this.coach = new Coach(this.base.root);
    this.save = loadProgress(LEVELS[0].id);
    this.traySide = this.save.traySide;
    this.base.trayPad.position.x = Math.abs(this.base.trayPad.position.x) * this.traySide;
    for (const id of this.save.completed) this.completed.add(id);
    const chapter = Math.max(0, LEVELS.findIndex((l) => l.id === this.save.levelId));
    const resumeDaily = this.save.boardId === `daily-${dayKey()}`;
    if (resumeDaily) {
      this.loadLevel(chapter, this.dailyLevel(), this.save.placed);
    } else {
      // A finished or stale daily leaves the chapter's own pieces in chapterPlaced.
      const own = this.save.boardId === LEVELS[chapter].id ? this.save.placed : this.save.chapterPlaced;
      this.loadLevel(chapter, undefined, own);
    }
    this.wirePanels();
    // Build today's puzzle soon after start, before most players enter the headset,
    // so the Daily button never blocks a frame.
    const warm = window.setTimeout(() => this.dailyLevel(), 1500);
    this.cleanupFuncs.push(() => window.clearTimeout(warm));
  }

  /** Today's daily puzzle, generated once per day and cached. */
  private dailyLevel(): Level {
    const id = `daily-${dayKey()}`;
    if (this.dailyCache?.id !== id) this.dailyCache = generateDaily(dayKey());
    return this.dailyCache;
  }

  /** Write the current progress to storage. Runs on moves and level changes only. */
  private persist(): void {
    this.save.levelId = LEVELS[this.levelIndex].id;
    this.save.boardId = this.level.id;
    this.save.placed = this.placed.map((m): SavedPiece | null => (m ? { col: m.col, row: m.row, angle: m.angle } : null));
    if (!this.daily) this.save.chapterPlaced = this.save.placed;
    this.save.completed = [...this.completed];
    this.save.traySide = this.traySide > 0 ? 1 : -1;
    saveProgress(this.save);
  }

  /** Caption for the level on the board, hidden once it is solved. */
  private showHint(): void {
    const text = this.daily ? "Today's puzzle" : this.level.hint;
    const card = this.hintCard?.object3D;
    if (text) this.hintText?.setProperties({ text });
    if (card) card.visible = !!text && !this.solved && !this.paused;
  }

  /** Label for the Daily button: the streak, once there is one. */
  private dailyText(): string {
    const streak = currentStreak(this.save.daily, dayKey());
    return streak > 0 ? `Daily ${streak}` : 'Daily';
  }

  /**
   * Hook up the button bar and hide the pause card. Each button gets its own
   * hit area entity, so a fingertip press (poke) and a point or look plus
   * pinch (ray) both arrive as the same Pressed tag.
   */
  private wirePanels(): void {
    this.controls = this.world.getSceneEntity('board-controls');
    this.pauseCard = this.world.getSceneEntity('pause-panel');
    if (this.pauseCard?.object3D) this.pauseCard.object3D.visible = false;
    this.fpsCard = this.world.getSceneEntity('fps-panel');
    const fps = this.world.getSceneObject<UIKitMLAsset>('fps-panel');
    this.fpsText = fps?.getElementById('fps-text') as typeof this.fpsText;
    this.setFrameTimeReadout(new URLSearchParams(window.location.search).get('fps') === '1');
    this.cleanupFuncs.push(() => this.setFrameTimeReadout(false));
    const panel = this.world.getSceneObject<UIKitMLAsset>('board-controls');
    this.handLabel = panel?.getElementById('hand-label') as typeof this.handLabel;
    this.handLabel?.setProperties({ text: this.traySide > 0 ? 'Tray left' : 'Tray right' });
    this.dailyLabel = panel?.getElementById('daily-label') as typeof this.dailyLabel;
    this.dailyLabel?.setProperties({ text: this.dailyText() });
    this.hintCard = this.world.getSceneEntity('hint-panel');
    const hint = this.world.getSceneObject<UIKitMLAsset>('hint-panel');
    this.hintText = hint?.getElementById('hint-text') as typeof this.hintText;
    this.showHint();
    if (!this.controls || !panel) return;

    // Each button gets its own hit area entity in world space. They are
    // placed once the panel has been laid out (see placeButtonHits).
    this.buttonEls = BUTTON_IDS.map((id) => panel.getElementById(id) ?? undefined);
    this.buttonHits = BUTTON_IDS.map((_, action) => {
      const hit = new Mesh(BUTTON_HIT_GEOMETRY, BUTTON_HIT_MATERIAL.clone());
      const entity = this.world.createTransformEntity(hit);
      entity.addComponent(BoardButton, { action });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      return entity;
    });

    const setOpacity = (entity: Entity, opacity: number) => {
      const m = (entity.object3D as Mesh | undefined)?.material as MeshBasicMaterial | undefined;
      if (m) m.opacity = opacity;
    };
    this.cleanupFuncs.push(
      this.queries.buttonsPressed.subscribe('qualify', (entity) => {
        if (this.paused) return;
        const action = entity.getValue(BoardButton, 'action');
        if (action === 0) this.restartLevel();
        else if (action === 1) this.nextLevel();
        else if (action === 2) this.openDaily();
        else this.toggleTraySide();
        playSnap();
      }),
      this.queries.buttonsHovered.subscribe('qualify', (entity) => setOpacity(entity, 0.14)),
      this.queries.buttonsHovered.subscribe('disqualify', (entity) => setOpacity(entity, 0)),
    );
  }

  /**
   * Put each button's hit area over the laid-out button, on the panel's plane.
   * Returns false while the panel has not been laid out yet (the buttons still
   * share one position), so the caller can try again next frame.
   */
  private placeButtonHits(): boolean {
    const panel = this.controls?.object3D;
    if (!panel || this.buttonHits.length === 0 || this.buttonEls.some((el) => !el)) return false;
    panel.updateWorldMatrix(true, true);
    const first = this.buttonEls[0]!.getWorldPosition(this.a).clone();
    const last = this.buttonEls[this.buttonEls.length - 1]!.getWorldPosition(this.b);
    const span = first.distanceTo(last);
    if (span < 0.01) return false;
    const pitch = span / (this.buttonEls.length - 1);
    panel.getWorldQuaternion(this.q);
    this.c.set(0, 0, 1).applyQuaternion(this.q);
    this.buttonHits.forEach((entity, i) => {
      const hit = entity.object3D;
      if (!hit) return;
      this.buttonEls[i]!.getWorldPosition(this.tmp).addScaledVector(this.c, 0.004);
      setWorldPosition(hit, this.tmp);
      setWorldQuaternion(hit, this.q);
      hit.scale.set(pitch * 0.92, 0.046, 0.01);
    });
    return true;
  }

  /** Let go of a grab made with the palm facing the headset (a reserved system pinch). */
  private guardPalmPinch(entity: Entity): void {
    if (!this.immersive) return;
    const grab = this.world.getSystem(GrabSystem);
    const hand = grab?.getHolderHand(entity);
    if (!grab || !hand) return;
    const palm = this.hands.palms[hand === 'left' ? 0 : 1];
    if (!palm.tracked) return;
    this.player.head.getWorldPosition(this.headLocal);
    this.base.root.worldToLocal(this.headLocal);
    if (palmFacesHead(palm.center, palm.normal, this.headLocal, PALM_TO_HEAD_LIMIT)) {
      this.guardMask |= 1 << this.indexOf(entity);
      grab.forceRelease(entity);
    }
  }

  /**
   * Hidden frame time readout for playtesters, turned on with ?fps=1. The
   * text is rebuilt on a half-second timer, so update() never allocates.
   */
  setFrameTimeReadout(on: boolean): void {
    this.fpsOn = on;
    window.clearInterval(this.fpsTimer);
    this.fpsTimer = on ? window.setInterval(() => this.publishFrameTime(), 500) : 0;
    if (this.fpsCard?.object3D) this.fpsCard.object3D.visible = on && !this.paused;
  }

  /** Record one frame's time in the ring buffer. */
  private updateFrameTime(delta: number): void {
    if (!this.fpsOn) return;
    this.frameMs[this.frameIndex] = delta * 1000;
    this.frameIndex = (this.frameIndex + 1) % FRAME_SAMPLES;
    if (this.frameCount < FRAME_SAMPLES) this.frameCount++;
  }

  private publishFrameTime(): void {
    let sum = 0;
    let slow = 0;
    for (let i = 0; i < this.frameCount; i++) {
      sum += this.frameMs[i];
      if (this.frameMs[i] > FRAME_BUDGET_MS) slow++;
    }
    const avg = sum / Math.max(1, this.frameCount);
    const pct = (100 * slow) / Math.max(1, this.frameCount);
    this.fpsLabel = `${avg.toFixed(1)} ms a frame, ${pct.toFixed(1)}% over budget`;
    this.fpsText?.setProperties({ text: this.fpsLabel });
  }

  restartLevel(): void {
    this.loadLevel(this.levelIndex, this.daily ? this.level : undefined);
    this.seatPieces();
  }

  /** Next chapter level; from the daily puzzle, back to the chapter level you were on. */
  nextLevel(): void {
    if (this.daily) this.loadLevel(this.levelIndex, undefined, this.save.chapterPlaced);
    else this.loadLevel(this.levelIndex + 1);
    this.seatPieces();
  }

  /** Today's puzzle, the same for every player on the same day. */
  openDaily(): void {
    this.loadLevel(this.levelIndex, this.dailyLevel());
    this.seatPieces();
  }

  /** Move the tray to the other side of the board, for left-handed play. */
  toggleTraySide(): void {
    this.traySide = -this.traySide;
    this.base.trayPad.position.x = Math.abs(this.base.trayPad.position.x) * this.traySide;
    this.handLabel?.setProperties({ text: this.traySide > 0 ? 'Tray left' : 'Tray right' });
    this.seatPieces();
    this.persist();
  }

  /** Place the button bar on the board's front edge, tilted toward the player. */
  private seatControls(): void {
    const object = this.controls?.object3D;
    if (!object) return;
    const root = this.base.root;
    this.tmp.set(0, 0.03, (BOARD_SIZE_M / 2) + 0.07);
    root.localToWorld(this.tmp);
    setWorldPosition(object, this.tmp);
    this.q.setFromAxisAngle(this.up, root.rotation.y);
    this.tilt.setFromAxisAngle(this.xAxis, CONTROLS_TILT);
    this.q.multiply(this.tilt);
    setWorldQuaternion(object, this.q);
    this.hitsPlaced = this.placeButtonHits();
    const hint = this.hintCard?.object3D;
    if (hint) {
      this.c.set(0, 0.1, -(BOARD_SIZE_M / 2) - 0.05);
      root.localToWorld(this.c);
      setWorldPosition(hint, this.c);
      this.q2.setFromAxisAngle(this.up, root.rotation.y);
      this.tilt.setFromAxisAngle(this.xAxis, HINT_TILT);
      this.q2.multiply(this.tilt);
      setWorldQuaternion(hint, this.q2);
      // Back to the controls' rotation for the readout below.
      this.q.setFromAxisAngle(this.up, root.rotation.y);
      this.tilt.setFromAxisAngle(this.xAxis, CONTROLS_TILT);
      this.q.multiply(this.tilt);
    }
    const fps = this.fpsCard?.object3D;
    if (fps) {
      // Just above the button bar, on the same tilted plane.
      this.a.set(0, 0.055, 0).applyQuaternion(this.q).add(this.tmp);
      setWorldPosition(fps, this.a);
      setWorldQuaternion(fps, this.q);
    }
  }

  /** Let go of every held piece; the release keeps each piece where it was. */
  private releaseHeld(): void {
    if (this.queries.held.entities.size === 0) return;
    const grab = this.world.getSystem(GrabSystem);
    for (const entity of [...this.queries.held.entities]) {
      this.guardMask |= 1 << this.indexOf(entity);
      grab?.forceRelease(entity);
    }
  }

  /** Hands only: any active controller pauses play until both are put down. */
  private updatePause(): void {
    const adapters = (this.input.xr as unknown as {
      visualAdapters: { controller: { left: { connected: boolean }; right: { connected: boolean } } };
    }).visualAdapters.controller;
    const controllerActive = this.immersive && (adapters.left.connected || adapters.right.connected);
    if (controllerActive === this.paused) return;
    this.paused = controllerActive;
    const card = this.pauseCard?.object3D;
    if (this.paused) {
      this.releaseHeld();
      // Clear feedback that would otherwise freeze on screen during the pause.
      this.base.hoverRing.visible = this.base.ghost.visible = false;
      for (const glow of this.base.palmGlows) glow.visible = false;
      this.glowLevel[0] = this.glowLevel[1] = 0;
      this.coach.hide();
      if (card) {
        this.player.head.getWorldPosition(this.head);
        this.player.head.getWorldQuaternion(this.q);
        this.fwd.set(0, 0, -1).applyQuaternion(this.q);
        this.fwd.y = 0;
        if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
        this.fwd.normalize();
        this.tmp.copy(this.head).addScaledVector(this.fwd, PAUSE_DISTANCE);
        this.tmp.y -= 0.08;
        setWorldPosition(card, this.tmp);
        this.q.setFromAxisAngle(this.up, Math.atan2(-this.fwd.x, -this.fwd.z));
        setWorldQuaternion(card, this.q);
      }
    }
    if (card) card.visible = this.paused;
    if (this.controls?.object3D) this.controls.object3D.visible = !this.paused;
    if (this.fpsCard?.object3D) this.fpsCard.object3D.visible = this.fpsOn && !this.paused;
    for (const hit of this.buttonHits) if (hit.object3D) hit.object3D.visible = !this.paused;
    this.showHint();
  }

  /**
   * Swap the fixed pieces and tray. `index` is the chapter level; `dailyLevel`
   * puts the daily puzzle on the board instead. `restore` puts saved pieces
   * back on their cells when they still fit.
   */
  loadLevel(index: number, dailyLevel?: Level, restore?: ReadonlyArray<SavedPiece | null>): void {
    this.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    this.daily = dailyLevel !== undefined;
    const level = (this.level = dailyLevel ?? LEVELS[this.levelIndex]);

    this.releaseHeld();
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
    this.guardMask = 0;
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
    });

    if (restore && restore.length === level.tray.length) {
      restore.forEach((saved, i) => {
        if (saved && this.isFree(saved.col, saved.row, i)) {
          const t = level.tray[i];
          this.placed[i] = { kind: t.kind, col: saved.col, row: saved.row, angle: ((saved.angle % 8) + 8) % 8, color: t.color };
        }
      });
    }
    this.seatPieces();

    this.coach.setLevel(level, !this.daily && !this.completed.has(level.id), this.traySide, this.now);
    this.showHint();
    const current = this.daily ? -1 : this.levelIndex;
    this.base.dots.forEach((dot, i) => {
      dot.material = this.completed.has(LEVELS[i].id) || i === current ? dotMaterials.on : dotMaterials.off;
      dot.scale.setScalar(i === current ? 1.6 : 1);
    });
    this.persist();
  }

  update(delta: number, time: number): void {
    this.now = time;
    this.updateFrameTime(delta);
    if (this.placeRequested) {
      this.placeRequested = false;
      this.placeUntil = time + PLACEMENT_WINDOW;
      this.nextPlaceAt = 0;
      this.touched = false;
      this.desk.reset();
      this.deskRestored = this.deskSaved = false;
    }
    if (time < this.placeUntil && !this.touched && time >= this.nextPlaceAt) {
      this.seatBoard();
      this.nextPlaceAt = time + 0.5;
    }
    if (this.immersive) this.rememberDesk(time);

    this.hands.update(this.input.xr as unknown as HandSource, this.player.gripSpaces, this.base.root);
    if (!this.hitsPlaced) this.hitsPlaced = this.placeButtonHits();
    this.updatePause();
    if (this.paused) {
      this.releaseHeld();
      return;
    }

    for (const entity of this.queries.held.entities) this.readCandidate(entity);
    if (this.pendingSnap !== 0) this.snapReleased();

    this.updatePalms();
    this.refresh(time);
    this.animate(delta, time);

    if (this.nextLevelAt > 0 && time >= this.nextLevelAt) this.nextLevel();
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
    this.seatControls();
  }

  /**
   * Desk memory: put the board back where it sat last session, and save the
   * spot once the board has settled on a real desk.
   */
  private rememberDesk(time: number): void {
    const xr = this.world.renderer.xr;
    const frame = xr.getFrame() as unknown as FrameLike | null;
    const space = xr.getReferenceSpace();
    if (!frame || !space) return;
    if (!this.desk.settled) this.desk.restore(frame);

    if (!this.deskRestored && this.desk.pose(frame, space, this.anchorPos, this.anchorQuat)) {
      // Reference space to world: the player rig is the reference space origin.
      this.player.updateWorldMatrix(true, false);
      this.player.localToWorld(this.anchorPos);
      this.a.set(0, 0, -1).applyQuaternion(this.anchorQuat);
      const root = this.base.root;
      root.position.copy(this.anchorPos);
      root.rotation.set(0, Math.atan2(-this.a.x, -this.a.z), 0);
      root.updateMatrixWorld(true);
      this.onDesk = true;
      this.base.stand.visible = false;
      this.seatPieces();
      this.seatControls();
      this.deskRestored = this.deskSaved = true;
      this.touched = true;
      return;
    }

    // Save only a real desk spot, once the placement window is over.
    if (!this.deskSaved && this.onDesk && time >= this.placeUntil && this.desk.settled) {
      // The board is already here: the new anchor is for next session only.
      this.deskSaved = this.deskRestored = true;
      const root = this.base.root;
      root.getWorldPosition(this.anchorPos);
      this.player.worldToLocal(this.anchorPos);
      this.anchorQuat.setFromAxisAngle(this.up, root.rotation.y);
      this.desk.save(frame, space, this.anchorPos, this.anchorQuat);
    }
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
    else traySlot(this.level.size, i, this.tmp, this.traySide);
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
      if (this.guardMask & (1 << i)) {
        // A system-gesture pinch is not a move: the piece stays where it was.
        this.guardMask &= ~(1 << i);
      } else if (this.candidateOk[i]) {
        const c = this.candidate[i];
        this.placed[i] = { kind: c.kind, col: c.col, row: c.row, angle: c.angle, color: c.color };
        this.coach.progress(this.now);
        playSnap();
      } else {
        this.placed[i] = null;
      }
      this.candidateOk[i] = false;
      this.moveToSlot(entity);
    }
    this.pendingSnap = 0;
    this.base.ghost.visible = false;
    this.persist();
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
    if (touch0) this.lastPalmTouch[0] = time;
    if (touch1) this.lastPalmTouch[1] = time;
    if (touch0 || touch1 || this.queries.held.entities.size > 0) this.coach.progress(time);

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
    if (this.daily) {
      // Credit the day the puzzle belongs to, even if it is solved after midnight.
      this.save.daily = recordDailySolve(this.save.daily, this.level.id.slice('daily-'.length));
      this.dailyLabel?.setProperties({ text: this.dailyText() });
    } else {
      this.completed.add(this.level.id);
      this.base.dots[this.levelIndex].material = dotMaterials.on;
    }
    this.persist();
    this.showHint();
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
    this.coach.update(time, this.solved);
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

    // Light on the palm, so a hit is visible without haptics. It fades rather
    // than flashing, and holds briefly so the beam's edge cannot make it flicker.
    for (let h = 0; h < 2; h++) {
      const glow = this.base.palmGlows[h];
      const palm = this.hands.palms[h];
      const lit = palm.tracked && time - this.lastPalmTouch[h] <= GLOW_HOLD;
      const level = Math.min(1, Math.max(0, this.glowLevel[h] + (lit ? delta / GLOW_IN : -delta / GLOW_OUT)));
      this.glowLevel[h] = level;
      glow.visible = level > 0 && palm.tracked;
      if (!glow.visible) continue;
      (glow.material as MeshBasicMaterial).opacity = GLOW_OPACITY * level;
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
