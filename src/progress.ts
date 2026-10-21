/**
 * Saved progress: the current level, pieces on the board, finished levels,
 * the tray side and the daily streak. Kept in localStorage so a player can
 * take the headset off mid-level and carry on later. Pure apart from the
 * storage passed in, so tests can use a fake.
 */

export interface SavedPiece {
  col: number;
  row: number;
  angle: number;
}

export interface DailyStreak {
  /** How the last daily was solved, for its result card. */
  crystals: number;
  pieces: number;
  palms: number;
  /** Local day key (YYYY-MM-DD) of the last solved daily puzzle. */
  lastSolved: string | null;
  streak: number;
  best: number;
}

/** Player settings. `reducedMotion` null follows the system preference. */
export interface Settings {
  oneHand: boolean;
  reducedMotion: boolean | null;
  highContrast: boolean;
}

/** Player settings. `reducedMotion` null follows the system preference. */
export interface Settings {
  oneHand: boolean;
  reducedMotion: boolean | null;
  highContrast: boolean;
}

export interface SaveData {
  version: 1;
  /** Chapter level the player is on (the daily puzzle is not a chapter level). */
  levelId: string;
  /** Level whose pieces are saved below: a chapter level or a daily id. */
  boardId: string;
  placed: Array<SavedPiece | null>;
  /** Pieces on the chapter level, kept while the daily puzzle is on the board. */
  chapterPlaced: Array<SavedPiece | null>;
  completed: string[];
  traySide: 1 | -1;
  daily: DailyStreak;
  /** Share code of the puzzle being made, so a reload or a new session keeps it. */
  maker: string | null;
  settings: Settings;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'palmlight.save.v1';

export function emptySave(firstLevelId: string): SaveData {
  return {
    version: 1,
    levelId: firstLevelId,
    boardId: firstLevelId,
    placed: [],
    chapterPlaced: [],
    completed: [],
    traySide: 1,
    daily: { lastSolved: null, streak: 0, best: 0, crystals: 0, pieces: 0, palms: 0 },
    maker: null,
    settings: { oneHand: false, reducedMotion: null, highContrast: false },
  };
}

/** The streak from a save, with its counts as whole numbers or the defaults. */
function cleanDaily(fresh: DailyStreak, raw: unknown): DailyStreak {
  const d = { ...fresh, ...((raw ?? {}) as Partial<DailyStreak>) };
  const whole = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback);
  return { ...d, streak: whole(d.streak, 0), best: whole(d.best, 0), crystals: whole(d.crystals, 0), pieces: whole(d.pieces, 0), palms: whole(d.palms, 0) };
}

/** Settings from a save: booleans only, anything else falls back to the default. */
function cleanSettings(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    oneHand: s.oneHand === true,
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : null,
    highContrast: s.highContrast === true,
  };
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Storage can be blocked (private mode, sandboxed frames).
    return null;
  }
}

const isCell = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64;

/** Keep only well-formed saved pieces; anything else becomes an empty tray slot. */
function cleanPieces(list: unknown): Array<SavedPiece | null> {
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    const m = p as Partial<SavedPiece> | null;
    return m && isCell(m.col) && isCell(m.row) && Number.isInteger(m.angle) ? { col: m.col!, row: m.row!, angle: m.angle! } : null;
  });
}

/** Read the save, falling back to a fresh one when it is missing or broken. */
export function loadProgress(firstLevelId: string, store: KeyValueStore | null = defaultStore()): SaveData {
  const fresh = emptySave(firstLevelId);
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return fresh;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return fresh;
    return {
      ...fresh,
      ...data,
      placed: cleanPieces(data.placed),
      chapterPlaced: cleanPieces(data.chapterPlaced),
      completed: Array.isArray(data.completed) ? data.completed.filter((id) => typeof id === 'string') : [],
      traySide: data.traySide === -1 ? -1 : 1,
      daily: cleanDaily(fresh.daily, data.daily),
      // Checked again by decodeLevel when the maker opens it.
      maker: typeof data.maker === 'string' ? data.maker : null,
      settings: cleanSettings(data.settings),
    } as SaveData;
  } catch {
    return fresh;
  }
}

export function saveProgress(data: SaveData, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(data));
  } catch {
    // A full or blocked store must never break the game.
  }
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** Streak after solving the daily puzzle of `today`. Solving twice in a day counts once. */
export function recordDailySolve(
  daily: DailyStreak,
  today: string,
  result: { crystals: number; pieces: number; palms: number } = { crystals: 0, pieces: 0, palms: 0 },
): DailyStreak {
  if (daily.lastSolved === today) return daily;
  const streak = daily.lastSolved === previousDay(today) ? daily.streak + 1 : 1;
  return { ...result, lastSolved: today, streak, best: Math.max(daily.best, streak) };
}

/** Streak as shown today: it is broken once a whole day was missed. */
export function currentStreak(daily: DailyStreak, today: string): number {
  if (daily.lastSolved === today || daily.lastSolved === previousDay(today)) return daily.streak;
  return 0;
}
