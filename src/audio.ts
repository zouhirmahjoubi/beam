/**
 * Small Web Audio synth. Every sound in Palmlight is generated here, so there are
 * no audio files to license or download. Sounds that belong to a spot on the
 * desk (a crystal, a palm, a piece) play from there: each voice gets a panner,
 * and the board keeps the listener on the player's head.
 */

/** A world-space point, in meters. */
export interface At {
  x: number;
  y: number;
  z: number;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Dev-only view of the last placed sounds and the listener, for the emulator checks. */
export const audioDebug = { lastAt: null as At | null, recent: [] as At[], listener: null as At | null };

/** The head pose, kept so a context made later starts in the right place. */
const ear = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };

/**
 * Keep the listener on the player's head. Call once a frame; it allocates
 * nothing and never creates or wakes the audio context (a sound does that).
 */
export function setListener(at: At, forward: At, up: At): void {
  ear.x = at.x;
  ear.y = at.y;
  ear.z = at.z;
  ear.fx = forward.x;
  ear.fy = forward.y;
  ear.fz = forward.z;
  ear.ux = up.x;
  ear.uy = up.y;
  ear.uz = up.z;
  if (ctx && ctx.state === 'running') applyListener(ctx);
  if (import.meta.env.DEV) audioDebug.listener = { x: at.x, y: at.y, z: at.z };
}

function applyListener(ac: AudioContext): void {
  const l = ac.listener;
  if ('positionX' in l) {
    l.positionX.value = ear.x;
    l.positionY.value = ear.y;
    l.positionZ.value = ear.z;
    l.forwardX.value = ear.fx;
    l.forwardY.value = ear.fy;
    l.forwardZ.value = ear.fz;
    l.upX.value = ear.ux;
    l.upY.value = ear.uy;
    l.upZ.value = ear.uz;
  } else {
    // Older WebKit keeps the method form.
    (l as AudioListener).setPosition(ear.x, ear.y, ear.z);
    (l as AudioListener).setOrientation(ear.fx, ear.fy, ear.fz, ear.ux, ear.uy, ear.uz);
  }
}

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    applyListener(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function voice(freq: number, start: number, length: number, peak: number, type: OscillatorType, at?: At) {
  const ac = context();
  if (!ac || !master) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  // A placed sound goes through a panner; the rest sits in the middle.
  let out: AudioNode = master;
  if (at) {
    const panner = ac.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.3;
    panner.rolloffFactor = 1;
    panner.positionX.value = at.x;
    panner.positionY.value = at.y;
    panner.positionZ.value = at.z;
    panner.connect(master);
    out = panner;
    if (import.meta.env.DEV) {
      audioDebug.lastAt = { x: at.x, y: at.y, z: at.z };
      audioDebug.recent = [...audioDebug.recent.slice(-31), audioDebug.lastAt];
    }
  }
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + start;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** Short wooden tick when a piece snaps into a cell. */
export function playSnap(at?: At) {
  voice(1320, 0, 0.06, 0.18, 'triangle', at);
  voice(660, 0, 0.09, 0.12, 'sine', at);
}

/** Soft tick for each 45 degree step while turning. */
export function playTurn(at?: At) {
  voice(2100, 0, 0.03, 0.06, 'sine', at);
}

/** Glass note when a crystal lights. */
export function playLit(step = 0, at?: At) {
  const notes = [659.25, 783.99, 987.77, 1174.66];
  const f = notes[step % notes.length];
  voice(f, 0, 1.4, 0.22, 'sine', at);
  voice(f * 2, 0, 0.6, 0.05, 'sine', at);
}

/** Rising chord when the level is solved. */
export function playSolved(at?: At) {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    voice(f, i * 0.09, 2.2, 0.16, 'sine', at);
    voice(f * 1.5, i * 0.09 + 0.02, 1.2, 0.03, 'triangle', at);
  });
}

/** Shimmer when the beam first lands on a palm. */
export function playPalm(at?: At) {
  voice(1567.98, 0, 0.5, 0.07, 'sine', at);
  voice(2093, 0.03, 0.4, 0.04, 'sine', at);
}
