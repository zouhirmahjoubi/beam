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
import { playLit, playPalm, playSnap, playSolved, playTurn, setListener } from './audio.js';
import { showSharePage } from './share-page.js';
import { BoardButton, BoardCell, BoardPiece } from './beam-components.js';
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
  RIM_IDLE,
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
  type TrayPiece,
} from './game/grid.js';
import { buildGhostHand, Coach, PALM_DOWN, type GhostHand } from './coach.js';
import { DeskAnchor, type FrameLike } from './desk-anchor.js';
import { generateDaily } from './game/daily.js';
import { LEVELS } from './game/levels.js';
import { checkShare, draftLevel, emptyDraft, moveLight, tapCell, type Draft } from './game/maker.js';
import { dailyCard } from './game/daily-card.js';
import { decodeLevel, encodeLevel } from './game/share.js';
import { solve } from './game/solver.js';
import {
  currentStreak,
  dayKey,
  loadProgress,
  recordDailySolve,
  saveProgress,
  type SaveData,
  type SavedPiece,
  type Settings,
} from './progress.js';
import { apertureVector, freeBuffer, freeTrace, type FreeResult, type PalmDisc, type SkyTarget, type V3 } from './game/optics.js';
import { pointInPolygon } from './placement.js';
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
const BUTTON_IDS = ['restart-button', 'next-button', 'daily-button', 'settings-button', 'make-button', 'hint-button'];
/** Hints per level: each one plays the next move of the answer right away. */
const HINTS_PER_LEVEL = 3;
/** The settings bar's buttons; their actions follow the maker bar. */
const SETTINGS_IDS = ['settings-tray', 'settings-onehand', 'settings-motion', 'settings-contrast', 'settings-back'];
const SETTINGS_ACTION = 11;
/** One-hand mode: a palm held still in the beam this long stays there as a pinned mirror. */
const PIN_DWELL = 1.4;
const PIN_SLOTS = 2;
const PIN_OPACITY = 0.3;
const PIN_HIT_OPACITY = 0.55;
/** High contrast: beams this many times wider, and glows this much stronger. */
const CONTRAST_WIDTH = 1.8;
const CONTRAST_GLOW = 2;
/** The maker bar's buttons; their actions follow the Find my desk button. */
const MAKER_IDS = ['maker-clear', 'maker-move', 'maker-share', 'maker-done'];
const MAKER_ACTION = 7;
/** The maker's tray: every piece a made puzzle can use. */
const PALETTE: TrayPiece[] = [
  { kind: 'mirror' },
  { kind: 'mirror' },
  { kind: 'mirror' },
  { kind: 'splitter' },
  { kind: 'filter', color: 1 },
  { kind: 'filter', color: 2 },
];
/** In the maker a palm is a hand, not a mirror: a shared puzzle is solved with its pieces. */
const NO_PALMS: ReadonlyArray<PalmCell | null> = [];
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
/** A lit crystal stays lit this long after the beam leaves it, so jitter cannot flicker it. */
const LIT_HOLD = 0.15;
/** A held piece keeps its angle and cell until the hand moves this far past the halfway mark. */
const SNAP_HYSTERESIS = 0.15;
/** The eyes are tracked once the head is above this height (the first frames read zero). */
const MIN_EYE_HEIGHT = 0.3;
/** Meta's guidance: wait this long for surfaces before offering a room scan. */
const ROOM_SCAN_DELAY = 3;
/** Action index of the Find my desk button (after the six bar buttons). */
const DESK_ACTION = 6;
/** Space between the bar and the Find my desk card, in meters. */
const DESK_CARD_GAP = 0.012;
/** The caption floats above the far edge, tilted toward the player. */
const HINT_TILT = -0.42;

/** A laid-out UIKit element; its size and position signals change on every relayout. */
type UiElement = Object3D & {
  size: { subscribe(fn: () => void): () => void };
  relativeCenter: { subscribe(fn: () => void): () => void };
};

interface NativePlane {
  orientation?: string;
  semanticLabel?: string;
  /** Outline in the plane's own space (y is 0). */
  polygon?: ReadonlyArray<{ x: number; z: number }>;
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
  buttons: { required: [BoardButton] },
  buttonsPressed: { required: [BoardButton, Pressed] },
  buttonsHovered: { required: [BoardButton, Hovered] },
  cells: { required: [BoardCell] },
  cellsPressed: { required: [BoardCell, Pressed] },
  cellsHovered: { required: [BoardCell, Hovered] },
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
  /** The held piece has a candidate from last frame to hold on to. */
  private candidateLive: boolean[] = [];
  private effective: Array<Piece | null> = [];
  private pieceSig = new Int32Array(0);
  private pendingSnap = 0;

  private hands = new PalmReader();
  /** Palm slots: the two live hands, then the pinned palms of one-hand mode. */
  private palmCells: Array<PalmCell | null> = [null, null, null, null];
  private palmCellStore: PalmCell[] = Array.from({ length: 2 + PIN_SLOTS }, () => ({ col: 0, row: 0, nx: 0, nz: 0, lift: false }));
  private palmDiscs: Array<PalmDisc | null> = [null, null, null, null];
  private palmDiscStore: PalmDisc[] = Array.from({ length: 2 + PIN_SLOTS }, () => ({ center: [0, 0, 0], normal: [0, 1, 0], radius: PALM_RADIUS }));
  private palmSig = new Int32Array(2 + PIN_SLOTS).fill(-2);
  /** Pinned palms, as board-local poses; null slots are free. */
  pins: Array<{ center: Vector3; normal: Vector3; at: number; armed: boolean } | null> = [null, null];
  private pinStore = Array.from({ length: PIN_SLOTS }, () => ({ center: new Vector3(), normal: new Vector3(), at: 0, armed: false }));
  pinGhosts: GhostHand[] = [];
  /** When each live palm's pose last changed, for the pin dwell. */
  private pinSince = [-1, -1];
  settings: Settings = { oneHand: false, reducedMotion: null, highContrast: false };
  hintsLeft = HINTS_PER_LEVEL;
  private hintLabel: { setProperties(p: { text: string }): void } | undefined;
  /** Palm slots that touched the beam on the last trace, for the daily card. */
  private palmsInAnswer = 0;
  private settingsCard: Entity | undefined;
  private settingsOpen = false;
  private settingsLabelEls: Record<string, { setProperties(p: { text: string }): void } | undefined> = {};
  /** Listener pose and sound spots, reused every frame. */
  private ear = new Vector3();
  private earForward = new Vector3();
  private earUp = new Vector3();
  private soundAt = new Vector3();
  /** 1 normally, 0 with reduced motion: scales every decorative pulse. */
  private motion = 1;
  private contrast = false;
  private glowBase: number[] = [];
  private skyTargets: SkyTarget[] = [];

  private grid: TraceResult | null = null;
  /** Free-beam results, reused every frame; the first freeCount are current. */
  private free: FreeResult[] = [freeBuffer(), freeBuffer(), freeBuffer(), freeBuffer()];
  private freeCount = 0;
  private freeColor: Color[] = [0, 0, 0, 0];
  private origin: V3 = [0, 0, 0];
  private outDir: V3 = [0, 0, 0];
  /** Time until which each crystal still shows as lit (board crystals, then sky). */
  private litUntil = new Float32Array(32);
  private shownLit = 0;
  private shownSky = 0;
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
  /** The board shows the daily or a shared puzzle instead of a chapter level. */
  private extra = false;
  private daily = false;
  private shared = false;
  /** One-off caption shown instead of the level's hint, such as a broken link. */
  private notice: string | null = null;
  private levelLoaded = false;
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
  private buttonEls: Array<UiElement | undefined> = [];
  private barEl: UiElement | undefined;
  private deskBarEl: UiElement | undefined;
  private hitsPlaced = false;
  private c = new Vector3();
  private xAxis = new Vector3(1, 0, 0);

  private placeUntil = 0;
  private seated = false;
  private sessionAt = 0;
  private roomScanUsed = false;
  private deskCard: Entity | undefined;
  private deskShown = false;
  /** Puzzle maker: the fixed pieces being laid out, and its own bar. */
  private making = false;
  private draft: Draft = emptyDraft();
  private moveArmed = false;
  private makerSolved = false;
  /** Why Share did not work, shown until the next change. */
  private makerNote: string | null = null;
  private makerCard: Entity | undefined;
  /** A link waiting for the headset session to end before its page shows. */
  private pendingShare: string | null = null;
  /** The tray pad's distance from the board center, before any second column. */
  private trayX = 0;
  private planeArrived = false;
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
      this.candidateLive[this.indexOf(entity)] = false;
      this.guardPalmPinch(entity);
    });
    this.queries.held.subscribe('disqualify', (entity) => {
      this.pendingSnap |= 1 << this.indexOf(entity);
    });
    this.queries.planes.subscribe('qualify', () => {
      // A desk found late in the window still gets used.
      this.planeArrived = true;
    });
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const immersive = state !== VisibilityState.NonImmersive;
        // A system menu blurs the session; only entering or leaving it re-seats the board.
        if (immersive !== this.immersive) this.placeRequested = true;
        this.immersive = immersive;
        if (!immersive && this.pendingShare) {
          const base = `${window.location.origin}${window.location.pathname}`;
          if (this.pendingShare.startsWith(base)) showSharePage(this.pendingShare);
          else showSharePage(base, this.pendingShare);
          this.pendingShare = null;
        }
      }),
    );
    this.coach = new Coach(this.base.root);
    for (let i = 0; i < PIN_SLOTS; i++) {
      const ghost = buildGhostHand();
      ghost.material.color.setHex(0xfff2c4);
      this.base.root.add(ghost.root);
      this.pinGhosts.push(ghost);
    }
    this.glowBase = [0, 1, 2].map((c) => beamMats[c as Color][1].opacity);
    this.save = loadProgress(LEVELS[0].id);
    this.settings = this.save.settings;
    this.applySettings();
    this.traySide = this.save.traySide;
    this.trayX = Math.abs(this.base.trayPad.position.x);
    this.base.trayPad.position.x = Math.abs(this.base.trayPad.position.x) * this.traySide;
    for (const id of this.save.completed) this.completed.add(id);
    const chapter = Math.max(0, LEVELS.findIndex((l) => l.id === this.save.levelId));
    const resumeDaily = this.save.boardId === `daily-${dayKey()}`;
    // Pieces on the maker's board, read before the first load saves over them.
    const makerPlaced = this.save.boardId === 'maker' ? this.save.placed : null;
    // A shared puzzle comes from the link, or from the save once the link is gone.
    const link = new URLSearchParams(window.location.search).get('p');
    const savedCode = this.save.boardId.startsWith('shared-') ? this.save.boardId.slice('shared-'.length) : null;
    const shared = this.sharedLevel(link ?? savedCode);
    if (link !== null) {
      // A reload resumes from the save, so the link has done its job.
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      window.history.replaceState(null, '', url);
      if (!shared) this.notice = 'That puzzle link did not work';
    }
    if (shared) {
      this.loadLevel(chapter, shared, this.save.boardId === shared.id ? this.save.placed : undefined);
    } else if (resumeDaily) {
      this.loadLevel(chapter, this.dailyLevel(), this.save.placed);
    } else {
      // A finished or stale daily leaves the chapter's own pieces in chapterPlaced.
      const own = this.save.boardId === LEVELS[chapter].id ? this.save.placed : this.save.chapterPlaced;
      this.loadLevel(chapter, undefined, own);
    }
    this.wirePanels();
    if (makerPlaced && !shared) this.openMaker(makerPlaced);
    // Build today's puzzle soon after start, before most players enter the headset,
    // so the Daily button never blocks a frame.
    const warm = window.setTimeout(() => this.dailyLevel(), 1500);
    this.cleanupFuncs.push(() => window.clearTimeout(warm));
  }

  /** The puzzle in a share code, or null when the code is broken or the puzzle cannot be solved. */
  private sharedLevel(code: string | null): Level | null {
    const level = code ? decodeLevel(code) : null;
    return level && solve(level) ? level : null;
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
    if (!this.extra) this.save.chapterPlaced = this.save.placed;
    this.save.completed = [...this.completed];
    this.save.traySide = this.traySide > 0 ? 1 : -1;
    if (this.making) this.save.maker = encodeLevel(draftLevel(this.draft, PALETTE));
    saveProgress(this.save);
  }

  /** Caption for the level on the board, hidden once it is solved. */
  private showHint(): void {
    const text = this.making ? this.makerText() : this.notice ?? (this.daily ? "Today's puzzle" : this.shared ? 'A puzzle shared with you' : this.level.hint);
    const card = this.hintCard?.object3D;
    if (text) this.hintText?.setProperties({ text });
    if (card) card.visible = !!text && !this.solved && !this.paused;
  }

  /** Label for the Daily button: the streak, once there is one. */
  dailyText(): string {
    const streak = currentStreak(this.save.daily, dayKey());
    if (this.dailyDone()) return `Share ${streak}`;
    return streak > 0 ? `Daily ${streak}` : 'Daily';
  }

  /** Whether today's puzzle is already solved. */
  private dailyDone(): boolean {
    return this.save.daily.lastSolved === dayKey();
  }

  /** Label for the Hint button: how many are left on this level. */
  hintLabelText(): string {
    return this.hintsLeft > 0 ? `Hint ${this.hintsLeft}` : 'No hints';
  }

  /** Play the next move of the answer now, three times per level. */
  hint(): void {
    if (this.hintsLeft <= 0 || this.solved) return;
    this.hintsLeft -= 1;
    this.hintLabel?.setProperties({ text: this.hintLabelText() });
    this.coach.play(this.now);
  }

  /** The daily result as a card on the share page; the session ends to show it. */
  private shareDaily(): void {
    const text = dailyCard({
      day: this.save.daily.lastSolved ?? dayKey(),
      crystals: this.save.daily.crystals,
      pieces: this.save.daily.pieces,
      palms: this.save.daily.palms,
      streak: currentStreak(this.save.daily, dayKey()),
      url: `${window.location.origin}${window.location.pathname}`,
    });
    const session = this.world.renderer.xr.getSession();
    if (session) {
      this.pendingShare = text;
      session.end().catch(() => undefined);
    } else {
      showSharePage(`${window.location.origin}${window.location.pathname}`, text);
    }
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
    this.dailyLabel = panel?.getElementById('daily-label') as typeof this.dailyLabel;
    this.dailyLabel?.setProperties({ text: this.dailyText() });
    this.hintLabel = panel?.getElementById('hint-label') as typeof this.hintLabel;
    this.hintLabel?.setProperties({ text: this.hintLabelText() });
    this.deskCard = this.world.getSceneEntity('desk-panel');
    if (this.deskCard?.object3D) this.deskCard.object3D.visible = false;
    this.hintCard = this.world.getSceneEntity('hint-panel');
    const hint = this.world.getSceneObject<UIKitMLAsset>('hint-panel');
    this.hintText = hint?.getElementById('hint-text') as typeof this.hintText;
    this.showHint();
    if (!this.controls || !panel) return;

    // Each button gets its own hit area entity in world space. They are
    // placed once the panel has been laid out (see placeButtonHits).
    const el = (asset: UIKitMLAsset | undefined, id: string) => (asset?.getElementById(id) ?? undefined) as UiElement | undefined;
    const desk = this.world.getSceneObject<UIKitMLAsset>('desk-panel');
    this.buttonEls = BUTTON_IDS.map((id) => el(panel, id));
    this.buttonEls[DESK_ACTION] = el(desk, 'desk-button');
    this.barEl = el(panel, 'bar');
    this.deskBarEl = el(desk, 'desk-bar');
    this.settingsCard = this.world.getSceneEntity('settings-panel');
    if (this.settingsCard?.object3D) this.settingsCard.object3D.visible = false;
    const settingsPanel = this.world.getSceneObject<UIKitMLAsset>('settings-panel');
    SETTINGS_IDS.forEach((id, i) => (this.buttonEls[SETTINGS_ACTION + i] = el(settingsPanel, id)));
    for (const key of ['tray', 'onehand', 'motion', 'contrast']) {
      this.settingsLabelEls[key] = settingsPanel?.getElementById(`settings-${key}-label`) as typeof this.handLabel;
    }
    this.refreshSettingsLabels();
    this.makerCard = this.world.getSceneEntity('maker-panel');
    if (this.makerCard?.object3D) this.makerCard.object3D.visible = false;
    const maker = this.world.getSceneObject<UIKitMLAsset>('maker-panel');
    MAKER_IDS.forEach((id, i) => (this.buttonEls[MAKER_ACTION + i] = el(maker, id)));
    // A label change (Daily 3, Tray right) lays the bar out again: re-place the hits.
    const relayout = () => {
      this.hitsPlaced = false;
    };
    for (const e of [...this.buttonEls, this.barEl, this.deskBarEl]) {
      if (e) this.cleanupFuncs.push(e.size.subscribe(relayout), e.relativeCenter.subscribe(relayout));
    }
    [...BUTTON_IDS, 'desk-button', ...MAKER_IDS, ...SETTINGS_IDS].forEach((_, action) => {
      const hit = new Mesh(BUTTON_HIT_GEOMETRY, BUTTON_HIT_MATERIAL.clone());
      const entity = this.world.createTransformEntity(hit);
      entity.addComponent(BoardButton, { action });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
    });
    // Maker cells: a point-and-pinch target per cell, out of reach until the maker opens.
    // No fingertip press, so a hand placing a piece never changes a cell by accident.
    for (let cell = 0; cell < BOARD_SIZE * BOARD_SIZE; cell++) {
      const tile = new Mesh(BUTTON_HIT_GEOMETRY, BUTTON_HIT_MATERIAL.clone());
      tile.visible = false;
      tile.position.set(0, -10, 0);
      const entity = this.world.createTransformEntity(tile);
      entity.addComponent(BoardCell, { cell });
      entity.addComponent(RayInteractable);
    }

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
        else if (action === 3) this.openSettings();
        else if (action === 4) this.openMaker();
        else if (action === 5) this.hint();
        else if (action === DESK_ACTION) this.findDesk();
        else if (action === MAKER_ACTION) this.clearMaker();
        else if (action === MAKER_ACTION + 1) this.toggleMoveLight();
        else if (action === MAKER_ACTION + 2) this.shareMaker();
        else if (action === MAKER_ACTION + 3) this.closeMaker();
        else if (action === SETTINGS_ACTION) this.toggleTraySide();
        else if (action === SETTINGS_ACTION + 1) this.setSetting('oneHand', !this.settings.oneHand);
        else if (action === SETTINGS_ACTION + 2) this.setSetting('reducedMotion', !this.reducedMotion());
        else if (action === SETTINGS_ACTION + 3) this.setSetting('highContrast', !this.settings.highContrast);
        else this.closeSettings();
        playSnap();
      }),
      this.queries.buttonsHovered.subscribe('qualify', (entity) => setOpacity(entity, 0.14)),
      this.queries.buttonsHovered.subscribe('disqualify', (entity) => setOpacity(entity, 0)),
      this.queries.cellsPressed.subscribe('qualify', (entity) => {
        if (this.paused || !this.making) return;
        this.tapMakerCell(entity.getValue(BoardCell, 'cell') ?? 0);
      }),
      this.queries.cellsHovered.subscribe('qualify', (entity) => setOpacity(entity, 0.14)),
      this.queries.cellsHovered.subscribe('disqualify', (entity) => setOpacity(entity, 0)),
    );
  }

  /**
   * Put each button's hit area over the laid-out button, on the panel's plane.
   * Returns false while the panel has not been laid out yet (the buttons still
   * share one position), so the caller can try again next frame.
   */
  private placeButtonHits(): boolean {
    const panel = this.controls?.object3D;
    const bar = BUTTON_IDS.length;
    if (!panel || this.queries.buttons.entities.size === 0 || this.buttonEls.slice(0, bar).some((el) => !el)) return false;
    panel.updateWorldMatrix(true, true);
    this.placeDeskCard(panel);
    this.deskCard?.object3D?.updateWorldMatrix(true, true);
    // The maker bar and the settings bar take the bar's place.
    for (const card of [this.makerCard?.object3D, this.settingsCard?.object3D]) {
      if (!card) continue;
      setWorldPosition(card, panel.getWorldPosition(this.tmp));
      setWorldQuaternion(card, panel.getWorldQuaternion(this.q));
      card.updateWorldMatrix(true, true);
    }
    this.buttonEls[0]!.getWorldPosition(this.a);
    this.buttonEls[bar - 1]!.getWorldPosition(this.b);
    if (this.a.distanceTo(this.b) < 0.01) return false;
    for (const entity of this.queries.buttons.entities) {
      const hit = entity.object3D;
      const action = entity.getValue(BoardButton, 'action') ?? 0;
      const el = this.buttonEls[action];
      if (!hit || !el) continue;
      if (!this.buttonShown(action)) {
        // Out of reach while the button is hidden, so no ray or finger can press it.
        hit.visible = false;
        hit.position.set(0, -10, 0);
        continue;
      }
      hit.visible = !this.paused;
      el.getWorldQuaternion(this.q);
      this.c.set(0, 0, 1).applyQuaternion(this.q);
      el.getWorldPosition(this.tmp).addScaledVector(this.c, 0.004);
      setWorldPosition(hit, this.tmp);
      setWorldQuaternion(hit, this.q);
      // UIKit scales each element to its laid-out size, so the hit matches its button.
      el.getWorldScale(this.b);
      hit.scale.set(this.b.x, this.b.y + 0.002, 0.01);
    }
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
    this.loadLevel(this.levelIndex, this.extra ? this.level : undefined);
    this.seatPieces();
  }

  /** Next chapter level; from the daily or a shared puzzle, back to the chapter level you were on. */
  nextLevel(): void {
    if (this.extra) this.loadLevel(this.levelIndex, undefined, this.save.chapterPlaced);
    else this.loadLevel(this.levelIndex + 1);
    this.seatPieces();
  }

  /** Today's puzzle, the same for every player on the same day. */
  openDaily(): void {
    if (this.dailyDone()) {
      this.shareDaily();
      return;
    }
    this.loadLevel(this.levelIndex, this.dailyLevel());
    this.seatPieces();
  }

  /** Move the tray to the other side of the board, for left-handed play. */
  toggleTraySide(): void {
    this.traySide = -this.traySide;
    this.base.trayPad.position.x = Math.abs(this.base.trayPad.position.x) * this.traySide;
    this.refreshSettingsLabels();
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
    this.placeCellTiles();
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

  /** Sounds play from their spot on the desk, so the listener rides on the head. */
  private updateListener(): void {
    const eye: Object3D = this.immersive ? this.player.head : this.world.camera;
    eye.getWorldPosition(this.ear);
    eye.getWorldQuaternion(this.q);
    this.earForward.set(0, 0, -1).applyQuaternion(this.q);
    this.earUp.set(0, 1, 0).applyQuaternion(this.q);
    setListener(this.ear, this.earForward, this.earUp);
  }

  /** World position of a board-local point, for a placed sound. */
  private spot(local: { x: number; y: number; z: number }): Vector3 {
    return this.base.root.localToWorld(this.soundAt.set(local.x, local.y, local.z));
  }

  /** Which hit areas can be pressed: the bar or the maker bar, and Find my desk when offered. */
  private buttonShown(action: number): boolean {
    if (action < BUTTON_IDS.length) return !this.making && !this.settingsOpen;
    if (action === DESK_ACTION) return this.deskShown;
    if (action >= SETTINGS_ACTION) return this.settingsOpen;
    return this.making;
  }

  openSettings(): void {
    this.settingsOpen = true;
    this.refreshSettingsLabels();
    this.showMakerPanels();
  }

  closeSettings(): void {
    this.settingsOpen = false;
    this.showMakerPanels();
  }

  /** Change one setting, apply it, and save. */
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    this.applySettings();
    this.refreshSettingsLabels();
    this.persist();
  }

  /** Reduced motion as it applies now: the setting, or the system preference. */
  private reducedMotion(): boolean {
    return this.settings.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  private applySettings(): void {
    const reduced = this.reducedMotion();
    this.coach.reducedMotion = reduced;
    this.motion = reduced ? 0 : 1;
    this.contrast = this.settings.highContrast;
    for (let c = 0; c < 3; c++) {
      beamMats[c as Color][1].opacity = Math.min(0.9, this.glowBase[c] * (this.contrast ? CONTRAST_GLOW : 1));
    }
    if (!this.settings.oneHand) this.clearPins();
    // Beams take their width on the next draw.
    this.grid = null;
  }

  /** The settings bar's labels, each showing its state. */
  settingsLabels(): Record<string, string> {
    return {
      tray: this.traySide > 0 ? 'Tray left' : 'Tray right',
      oneHand: this.settings.oneHand ? 'One hand on' : 'One hand off',
      motion: this.reducedMotion() ? 'Less motion on' : 'Less motion off',
      contrast: this.settings.highContrast ? 'Contrast on' : 'Contrast off',
    };
  }

  private refreshSettingsLabels(): void {
    const labels = this.settingsLabels();
    this.settingsLabelEls.tray?.setProperties({ text: labels.tray });
    this.settingsLabelEls.onehand?.setProperties({ text: labels.oneHand });
    this.settingsLabelEls.motion?.setProperties({ text: labels.motion });
    this.settingsLabelEls.contrast?.setProperties({ text: labels.contrast });
  }

  /** Forget every pinned palm. */
  private clearPins(): void {
    for (let i = 0; i < PIN_SLOTS; i++) {
      this.pins[i] = null;
      this.pinGhosts[i].root.visible = false;
    }
    this.pinSince[0] = this.pinSince[1] = -1;
  }

  /** Keep live palm `h` where it is: the oldest pin gives way when both slots are full. */
  private pin(h: number, time: number): void {
    const palm = this.hands.palms[h];
    let slot = this.pins.findIndex((p) => p === null);
    if (slot < 0) slot = this.pins[0]!.at <= this.pins[1]!.at ? 0 : 1;
    const pin = this.pinStore[slot];
    pin.center.copy(palm.center);
    pin.normal.copy(palm.normal);
    pin.at = time;
    pin.armed = false;
    this.pins[slot] = pin;
    const ghost = this.pinGhosts[slot];
    ghost.root.visible = true;
    ghost.material.opacity = PIN_OPACITY;
    ghost.root.position.copy(pin.center).addScaledVector(pin.normal, -0.012);
    ghost.root.quaternion.setFromUnitVectors(PALM_DOWN, pin.normal);
    this.pinSince[h] = -1;
    playSnap(this.spot(pin.center));
  }

  /** Make: the puzzle you were making (or an empty board), the palette in the tray, and the maker bar. */
  openMaker(restore: ReadonlyArray<SavedPiece | null> = []): void {
    this.making = true;
    this.settingsOpen = false;
    this.draft = this.savedDraft() ?? emptyDraft();
    this.loadMaker(restore);
    this.showMakerPanels();
  }

  /** The draft kept in the save, checked like any share code. */
  private savedDraft(): Draft | null {
    const level = this.save.maker ? decodeLevel(this.save.maker) : null;
    return level ? { emitter: level.emitter, crystals: level.crystals, blockers: level.blockers } : null;
  }

  /** Done: back to the chapter level you were on. */
  closeMaker(): void {
    this.making = false;
    this.loadLevel(this.levelIndex, undefined, this.save.chapterPlaced);
    this.showMakerPanels();
  }

  clearMaker(): void {
    this.draft = emptyDraft();
    this.loadMaker([]);
  }

  toggleMoveLight(): void {
    this.moveArmed = !this.moveArmed;
    this.showHint();
  }

  /** Share: once the maker has solved it, end the session and show the link page. */
  shareMaker(): void {
    const result = checkShare(this.draft, this.placed);
    if (!result.ok) {
      this.makerNote = result.reason;
      this.showHint();
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?p=${result.code}`;
    const session = this.world.renderer.xr.getSession();
    if (session) {
      this.pendingShare = url;
      session.end().catch(() => undefined);
    } else {
      showSharePage(url);
    }
  }

  /** A pinch on a cell changes it, or moves the light there after Move light. */
  private tapMakerCell(cell: number): void {
    const col = Math.floor(cell / BOARD_SIZE);
    const row = cell % BOARD_SIZE;
    const next = this.moveArmed ? moveLight(this.draft, col, row) : tapCell(this.draft, col, row);
    this.moveArmed = false;
    if (next === this.draft) {
      this.showHint();
      return;
    }
    this.draft = next;
    this.loadMaker(this.placed);
    playSnap();
  }

  /** Put the draft on the board, keeping placed pieces on cells that are still free. */
  private loadMaker(keep: ReadonlyArray<SavedPiece | null>): void {
    this.makerSolved = false;
    this.makerNote = null;
    this.moveArmed = false;
    const restore = PALETTE.map((_, i) => {
      const p = keep[i];
      return p ? { col: p.col, row: p.row, angle: p.angle } : null;
    });
    this.loadLevel(this.levelIndex, draftLevel(this.draft, PALETTE), restore);
  }

  /** The maker's caption: what to do next. */
  private makerText(): string {
    if (this.moveArmed) return 'Pinch an empty cell to move the light';
    if (this.makerNote) return this.makerNote;
    if (this.makerSolved) return 'Solved. Press Share to send it';
    if (this.draft.crystals.length === 0) return 'Pinch cells to add blocks and crystals';
    return 'Light every crystal with your pieces';
  }

  /** Swap the bar for the maker bar (or back), with the cells and tray to match. */
  private showMakerPanels(): void {
    if (this.controls?.object3D) this.controls.object3D.visible = !this.paused && !this.making && !this.settingsOpen;
    if (this.makerCard?.object3D) this.makerCard.object3D.visible = !this.paused && this.making;
    if (this.settingsCard?.object3D) this.settingsCard.object3D.visible = !this.paused && this.settingsOpen;
    this.setTrayColumns(this.making ? 2 : 1);
    this.hitsPlaced = this.placeButtonHits();
    this.placeCellTiles();
  }

  /** The tray pad grows a second column for the maker's palette. */
  private setTrayColumns(columns: number): void {
    const pad = this.base.trayPad;
    pad.scale.x = columns;
    pad.position.x = this.traySide * (this.trayX + (columns - 1) * 0.0375);
  }

  /** Maker cells sit on the board top while making, and out of reach otherwise. */
  private placeCellTiles(): void {
    const root = this.base.root;
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(this.q);
    for (const entity of this.queries.cells.entities) {
      const tile = entity.object3D;
      if (!tile) continue;
      tile.visible = this.making;
      if (!this.making) {
        tile.position.set(0, -10, 0);
        continue;
      }
      const cell = entity.getValue(BoardCell, 'cell') ?? 0;
      cellToLocal(BOARD_SIZE, Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE, this.tmp);
      this.tmp.y = BOARD_TOP + 0.002;
      root.localToWorld(this.tmp);
      setWorldPosition(tile, this.tmp);
      setWorldQuaternion(tile, this.q);
      tile.scale.set(CELL * 0.94, 0.004, CELL * 0.94);
    }
  }

  /** The Find my desk card sits in the bar's row, just left of it, at the same tilt. */
  private placeDeskCard(panel: Object3D): void {
    const card = this.deskCard?.object3D;
    if (!card || !this.barEl || !this.deskBarEl) return;
    // UIKit scales each element to its laid-out size, so world scale x is its width.
    const half = (this.barEl.getWorldScale(this.b).x + this.deskBarEl.getWorldScale(this.b).x) / 2;
    panel.getWorldQuaternion(this.q);
    this.c.set(1, 0, 0).applyQuaternion(this.q);
    panel.getWorldPosition(this.tmp).addScaledVector(this.c, -half - DESK_CARD_GAP);
    setWorldPosition(card, this.tmp);
    setWorldQuaternion(card, this.q);
  }

  /**
   * Find my desk: when no desk turned up a few seconds into the session, offer
   * the headset's room scan. Allowed once per session by the browser.
   */
  private updateDeskButton(time: number): void {
    const session = this.immersive ? this.world.renderer.xr.getSession() : null;
    const canScan = !!session && typeof (session as unknown as { initiateRoomCapture?: unknown }).initiateRoomCapture === 'function';
    const show =
      canScan &&
      this.desk.settled &&
      !this.making &&
      !this.onDesk &&
      !this.deskRestored &&
      !this.roomScanUsed &&
      !this.paused &&
      time - this.sessionAt >= ROOM_SCAN_DELAY;
    if (show === this.deskShown) return;
    this.deskShown = show;
    if (this.deskCard?.object3D) this.deskCard.object3D.visible = show;
    this.hitsPlaced = this.placeButtonHits();
  }

  /** Start the room scan; the board re-seats when the new surfaces arrive. */
  findDesk(): void {
    const session = this.world.renderer.xr.getSession() as unknown as { initiateRoomCapture?: () => Promise<unknown> } | null;
    if (!session?.initiateRoomCapture || this.roomScanUsed) return;
    this.roomScanUsed = true;
    this.updateDeskButton(this.now);
    const reseat = () => {
      this.placeUntil = this.now + PLACEMENT_WINDOW * 3;
      this.seated = false;
      this.touched = false;
    };
    Promise.resolve(session.initiateRoomCapture()).then(reseat, reseat);
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
    if (this.controls?.object3D) this.controls.object3D.visible = !this.paused && !this.making && !this.settingsOpen;
    if (this.makerCard?.object3D) this.makerCard.object3D.visible = !this.paused && this.making;
    if (this.settingsCard?.object3D) this.settingsCard.object3D.visible = !this.paused && this.settingsOpen;
    if (this.fpsCard?.object3D) this.fpsCard.object3D.visible = this.fpsOn && !this.paused;
    for (const hit of this.queries.buttons.entities) {
      const shown = this.buttonShown(hit.getValue(BoardButton, 'action') ?? 0);
      if (hit.object3D) hit.object3D.visible = shown && !this.paused;
    }
    this.showHint();
  }

  /**
   * Swap the fixed pieces and tray. `index` is the chapter level; `extraLevel`
   * puts the daily or a shared puzzle on the board instead. `restore` puts saved pieces
   * back on their cells when they still fit.
   */
  loadLevel(index: number, extraLevel?: Level, restore?: ReadonlyArray<SavedPiece | null>): void {
    this.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    this.extra = extraLevel !== undefined;
    this.daily = !!extraLevel?.id.startsWith('daily-');
    this.shared = !!extraLevel?.id.startsWith('shared-');
    // A notice stays for the first board only.
    if (this.levelLoaded) this.notice = null;
    this.levelLoaded = true;
    const level = (this.level = extraLevel ?? LEVELS[this.levelIndex]);

    this.releaseHeld();
    for (const entity of [...this.queries.pieces.entities]) {
      entity.object3D?.removeFromParent();
      entity.destroy();
    }
    if (this.content) {
      this.base.root.remove(this.content.group);
      for (const m of this.content.crystalMats) m.dispose();
      for (const m of this.content.skyMats) m.dispose();
    }
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
    this.candidateLive = level.tray.map(() => false);
    this.pieceSig = new Int32Array(level.tray.length).fill(-2);
    this.palmSig.fill(-2);
    this.clearPins();
    this.hintsLeft = HINTS_PER_LEVEL;
    this.hintLabel?.setProperties({ text: this.hintLabelText() });
    this.pendingSnap = 0;
    this.guardMask = 0;
    this.litMask = this.skyMask = 0;
    this.solved = false;
    this.solvedSince = this.nextLevelAt = -1;
    this.grid = null;
    this.freeCount = 0;
    this.litUntil.fill(0);
    this.shownLit = this.shownSky = 0;

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

    this.coach.setLevel(level, !this.extra && !this.completed.has(level.id), this.traySide, this.now, () => this.placed);
    this.showHint();
    const current = this.extra ? -1 : this.levelIndex;
    this.base.dots.forEach((dot, i) => {
      dot.material = this.completed.has(LEVELS[i].id) || i === current ? dotMaterials.on : dotMaterials.off;
      dot.scale.setScalar(i === current ? 1.6 : 1);
    });
    this.persist();
  }

  update(delta: number, time: number): void {
    this.now = time;
    this.updateListener();
    this.updateFrameTime(delta);
    if (this.placeRequested) {
      this.placeRequested = false;
      this.placeUntil = time + PLACEMENT_WINDOW;
      this.seated = false;
      this.touched = false;
      this.sessionAt = time;
      this.roomScanUsed = false;
      this.desk.reset();
      this.deskRestored = this.deskSaved = false;
    }
    // Seat once when the eyes track, and again only if a desk shows up later
    // in the window, so the board does not follow the player's gaze around.
    if (time < this.placeUntil && !this.touched && (!this.seated || this.planeArrived)) {
      if (this.seatBoard()) {
        this.seated = true;
        this.planeArrived = false;
      }
    }
    if (this.immersive) this.rememberDesk(time);
    this.updateDeskButton(time);

    this.hands.update(this.input.xr as unknown as HandSource, this.player.gripSpaces, this.base.root);
    if (!this.hitsPlaced) this.hitsPlaced = this.placeButtonHits();
    this.updatePause();
    if (this.paused) {
      this.releaseHeld();
      return;
    }

    for (const entity of this.queries.held.entities) this.readCandidate(entity);
    if (this.pendingSnap !== 0) this.snapReleased();

    this.updatePalms(time);
    this.refresh(time);
    this.animate(delta, time);

    if (this.nextLevelAt > 0 && time >= this.nextLevelAt) this.nextLevel();
  }

  private indexOf(entity: Entity): number {
    return entity.getValue(BoardPiece, 'index') ?? 0;
  }

  /**
   * Seat the board on a desk-height surface right in front of the player, or
   * on a stand there. Returns false while the eyes are not tracked yet.
   */
  private seatBoard(): boolean {
    const eye: Object3D = this.immersive ? this.player.head : this.world.camera;
    eye.updateWorldMatrix(true, false);
    eye.getWorldPosition(this.head);
    if (this.immersive && this.head.y < MIN_EYE_HEIGHT) return false;
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
      // The board's spot in front of the player must be on this surface,
      // not beside it, or the board would float at desk height.
      if (plane.polygon && plane.polygon.length >= 3) {
        this.c.set(this.head.x + this.fwd.x * REACH, this.tmp.y, this.head.z + this.fwd.z * REACH);
        entity.object3D.worldToLocal(this.c);
        if (!pointInPolygon(this.c.x, this.c.z, plane.polygon)) continue;
      }
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
    if (this.base.shadow) this.base.shadow.visible = this.onDesk;
    stand.scale.set(1, Math.max(height, 0.01), 1);
    stand.position.set(0, -height / 2, 0);

    if (!this.immersive) {
      root.getWorldPosition(this.tmp);
      this.world.camera.lookAt(this.tmp);
    }
    this.seatPieces();
    this.seatControls();
    return true;
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
      if (this.base.shadow) this.base.shadow.visible = true;
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
    const fx = this.tmp.x / CELL + (n - 1) / 2;
    const fz = this.tmp.z / CELL + (n - 1) / 2;
    const nearBoard = this.tmp.y > -0.03 && this.tmp.y < 0.15;

    object.getWorldQuaternion(this.q);
    this.a.set(1, 0, 0).applyQuaternion(this.q);
    const steps = (Math.atan2(-this.a.z, this.a.x) - root.rotation.y) / STEP;

    // Keep the current cell and angle until the hand is clearly past the
    // halfway mark, so tracking noise cannot make the preview jump.
    const c = this.candidate[i];
    const live = this.candidateLive[i];
    const keep = 0.5 + SNAP_HYSTERESIS;
    const col = live && Math.abs(fx - c.col) < keep ? c.col : Math.round(fx);
    const row = live && Math.abs(fz - c.row) < keep ? c.row : Math.round(fz);
    const turn = ((((steps - c.angle) % 8) + 12) % 8) - 4;
    const angle = live && Math.abs(turn) < keep ? c.angle : ((Math.round(steps) % 8) + 8) % 8;
    this.candidateLive[i] = true;
    if (this.candidateOk[i] && angle !== c.angle && c.kind !== 'filter') playTurn(this.spot(cellToLocal(this.level.size, col, row, this.soundAt)));
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
        playSnap(this.spot(cellToLocal(this.level.size, c.col, c.row, this.soundAt)));
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

  /**
   * Real palms become grid cells when they rest in the beam, and discs in the
   * air. Pinned palms (one-hand mode) fill the slots after the two hands.
   */
  private updatePalms(time: number): void {
    for (let h = 0; h < 2; h++) {
      const palm = this.hands.palms[h];
      if (!palm.tracked) {
        this.palmCells[h] = this.palmDiscs[h] = null;
        this.pinSince[h] = -1;
        continue;
      }
      this.palmSlot(h, palm.center, palm.normal);
    }
    for (let i = 0; i < PIN_SLOTS; i++) {
      const pin = this.pins[i];
      if (pin) this.palmSlot(2 + i, pin.center, pin.normal);
      else this.palmCells[2 + i] = this.palmDiscs[2 + i] = null;
    }
    this.updatePins(time);
  }

  /** One-hand mode: a palm held still in the beam pins; a hand back in a pin's cell unpins it. */
  private updatePins(time: number): void {
    if (!this.settings.oneHand) return;
    for (let i = 0; i < PIN_SLOTS; i++) {
      const pin = this.pins[i];
      const cell = this.palmCells[2 + i];
      if (!pin || !cell) continue;
      const hand = this.palmCells.findIndex((c, h) => h < 2 && c !== null && c.col === cell.col && c.row === cell.row);
      if (hand < 0) pin.armed = true;
      else if (pin.armed) {
        this.pins[i] = null;
        this.pinGhosts[i].root.visible = false;
        this.pinSince[hand] = time;
      }
    }
    for (let h = 0; h < 2; h++) {
      const cell = this.palmCells[h];
      // A hand resting on its own pin is done pinning there.
      const onPin = cell !== null && this.palmCells.some((c, i) => i >= 2 && c !== null && c.col === cell.col && c.row === cell.row);
      const still = cell !== null && !onPin && this.palmTouch[h] && this.palmSignature(h) === this.palmSig[h];
      if (!still) {
        this.pinSince[h] = -1;
        continue;
      }
      if (this.pinSince[h] < 0) this.pinSince[h] = time;
      else if (time - this.pinSince[h] >= PIN_DWELL) this.pin(h, time);
    }
  }

  /** Fill palm slot `h` from a board-local palm pose. */
  private palmSlot(h: number, center: Vector3, nrm: Vector3): void {
    const n = this.level.size;
    {
      const disc = this.palmDiscStore[h];
      center.toArray(disc.center);
      nrm.toArray(disc.normal);
      this.palmDiscs[h] = disc;

      const c = center;
      const col = Math.round(c.x / CELL + (n - 1) / 2);
      const row = Math.round(c.z / CELL + (n - 1) / 2);
      // How far the palm reaches up and down from its center.
      const reach = PALM_RADIUS * Math.sqrt(Math.max(0, 1 - nrm.y * nrm.y)) + 0.012;
      const inBand = Math.abs(c.y - (BOARD_TOP + BEAM_Y)) <= reach;
      if (!inBand || col < 0 || row < 0 || col >= n || row >= n || this.fixed[col * n + row]) {
        this.palmCells[h] = null;
        return;
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
    for (let h = 0; h < 2 + PIN_SLOTS; h++) {
      const sig = this.palmSignature(h);
      if (sig !== this.palmSig[h]) {
        this.palmSig[h] = sig;
        changed = true;
      }
    }
    if (changed) this.grid = trace(this.level, this.effective, this.making ? NO_PALMS : this.palmCells);
    const grid = this.grid!;

    // Light in the air follows the palms every frame.
    let lifted = false;
    for (let j = 0; j < grid.beams.length; j++) if (grid.beams[j].lift) lifted = true;
    if (lifted || changed || this.freeCount > 0) {
      this.freeCount = 0;
      for (let j = 0; j < grid.beams.length && this.freeCount < this.free.length; j++) {
        const beam = grid.beams[j];
        const lift = beam.lift;
        const disc = lift ? this.palmDiscs[lift.palm] : null;
        if (!lift || !disc) continue;
        cellToLocal(n, lift.col, lift.row, this.a);
        const [dx, dz] = DIRS[lift.dir];
        const l = Math.hypot(dx, dz);
        // Reflect the incoming flat beam about the palm normal.
        const nrm = disc.normal;
        const k = 2 * ((dx / l) * nrm[0] + (dz / l) * nrm[2]);
        this.outDir[0] = dx / l - k * nrm[0];
        this.outDir[1] = -k * nrm[1];
        this.outDir[2] = dz / l - k * nrm[2];
        this.origin[0] = this.a.x;
        this.origin[1] = BOARD_TOP + BEAM_Y;
        this.origin[2] = this.a.z;
        freeTrace(this.origin, this.outDir, lift.color, this.palmDiscs, this.skyTargets, lift.palm, 0.9, 3, this.free[this.freeCount]);
        this.freeColor[this.freeCount] = lift.color;
        this.freeCount++;
      }
      this.drawBeams(grid);
    }

    // Raw hits drive solving; the shown state holds briefly so jitter at a
    // cell or band edge cannot flicker a crystal or repeat its note.
    let lit = 0;
    for (const k of grid.lit) lit |= 1 << k;
    let sky = 0;
    for (let j = 0; j < this.freeCount; j++) if (this.free[j].hit >= 0) sky |= 1 << this.free[j].hit;
    const crystals = this.level.crystals.length;
    let shownLit = 0;
    let shownSky = 0;
    let step = 0;
    for (let k = 0; k < crystals; k++) {
      if (lit & (1 << k)) this.litUntil[k] = time + LIT_HOLD;
      if (this.litUntil[k] > time) shownLit |= 1 << k;
    }
    for (let k = 0; k < this.skyTargets.length; k++) {
      if (sky & (1 << k)) this.litUntil[crystals + k] = time + LIT_HOLD;
      if (this.litUntil[crystals + k] > time) shownSky |= 1 << k;
    }
    for (let k = 0; k < crystals; k++) {
      if (shownLit & (1 << k) && !(this.shownLit & (1 << k))) {
        const c = this.level.crystals[k];
        playLit(step++, this.spot(cellToLocal(n, c.col, c.row, this.soundAt)));
      }
    }
    for (let k = 0; k < this.skyTargets.length; k++) {
      if (shownSky & (1 << k) && !(this.shownSky & (1 << k))) {
        const [x, y, z] = this.skyTargets[k].center;
        playLit(step++, this.spot(this.soundAt.set(x, y, z)));
      }
    }
    this.shownLit = shownLit;
    this.shownSky = shownSky;

    let touch0 = grid.palmHits[0] === true;
    let touch1 = grid.palmHits[1] === true;
    for (let j = 0; j < this.freeCount; j++) {
      const hits = this.free[j].palmHits;
      if (hits.indexOf(0) >= 0) touch0 = true;
      if (hits.indexOf(1) >= 0) touch1 = true;
    }
    // Chime only when a palm meets the beam after a real gap, not on every flicker.
    const chimeLeft = touch0 && time - this.lastPalmTouch[0] > GLOW_HOLD;
    const chimeRight = touch1 && time - this.lastPalmTouch[1] > GLOW_HOLD;
    if (chimeLeft || chimeRight) playPalm(this.spot((chimeLeft ? this.hands.palms[0] : this.hands.palms[1]).center));
    this.palmTouch[0] = touch0;
    this.palmTouch[1] = touch1;
    this.palmsInAnswer = (touch0 ? 1 : 0) + (touch1 ? 1 : 0);
    for (let i = 0; i < PIN_SLOTS; i++) {
      if (!this.pins[i]) continue;
      let hit = grid.palmHits[2 + i] === true;
      for (let j = 0; j < this.freeCount && !hit; j++) if (this.free[j].palmHits.indexOf(2 + i) >= 0) hit = true;
      this.pinGhosts[i].material.opacity = hit ? PIN_HIT_OPACITY : PIN_OPACITY;
    }
    if (touch0) this.lastPalmTouch[0] = time;
    if (touch1) this.lastPalmTouch[1] = time;
    if (touch0 || touch1 || this.queries.held.entities.size > 0) this.coach.progress(time);

    if (!this.solved) {
      this.litMask = shownLit;
      this.skyMask = shownSky;
      const allSky = this.skyTargets.length === 0 || sky === (1 << this.skyTargets.length) - 1;
      if (this.making) {
        // The maker's own solve: ready to share, and the board stays as it is.
        if (!grid.solved) this.solvedSince = -1;
        else if (this.solvedSince < 0) this.solvedSince = time;
        // With no crystals every crystal is lit, which is not a puzzle yet.
        const ready = grid.solved && this.level.crystals.length > 0 && time - this.solvedSince >= SOLVE_HOLD;
        if (ready !== this.makerSolved) {
          this.makerSolved = ready;
          this.makerNote = null;
          if (ready) playSolved(this.spot(this.soundAt.set(0, BOARD_TOP, 0)));
          this.showHint();
        }
      } else if (grid.solved && allSky) {
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
    // A shared puzzle counts toward neither the chapter nor the streak.
    if (this.daily) {
      // Credit the day the puzzle belongs to, even if it is solved after midnight.
      this.save.daily = recordDailySolve(this.save.daily, this.level.id.slice('daily-'.length), {
        crystals: this.level.crystals.length,
        pieces: this.placed.filter((m) => m !== null).length,
        palms: this.palmsInAnswer,
      });
      this.dailyLabel?.setProperties({ text: this.dailyText() });
    } else if (!this.shared) {
      this.completed.add(this.level.id);
      this.base.dots[this.levelIndex].material = dotMaterials.on;
    }
    this.persist();
    this.showHint();
    playSolved(this.spot(this.soundAt.set(0, BOARD_TOP, 0)));
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
        const w = this.contrast ? CONTRAST_WIDTH : 1;
        mesh.scale.set(w, Math.max(length, 0.001), w);
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
    for (let j = 0; j < this.freeCount; j++) {
      const f = this.free[j];
      for (let i = 0; i + 1 < f.count; i++) {
        this.a.fromArray(f.points[i]);
        this.b.fromArray(f.points[i + 1]);
        draw(this.freeColor[j]);
      }
    }
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
        m.emissiveIntensity += ((lit ? (this.contrast ? 3 : 2.2) : this.contrast ? 0.6 : 0.3) - m.emissiveIntensity) * ease;
      });
      view.sky.forEach((crystal, k) => {
        const lit = (this.skyMask & (1 << k)) !== 0;
        crystal.rotation.y += delta * (lit ? 1.8 : 0.5);
        crystal.position.y += Math.sin(time * 1.4 + k) * 0.00004 * this.motion;
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
      glow.scale.setScalar(1 + 0.12 * Math.sin(time * 9) * this.motion);
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
      ? 0.35 + 1.4 * Math.exp(-since * 2.2) + 0.08 * Math.sin(time * 2) * this.motion
      : RIM_IDLE;
  }
}
