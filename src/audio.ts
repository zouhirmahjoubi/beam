/**
 * Small Web Audio synth. Every sound in Palmlight is generated here, so there are
 * no audio files to license or download.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function voice(freq: number, start: number, length: number, peak: number, type: OscillatorType) {
  const ac = context();
  if (!ac || !master) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + start;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** Short wooden tick when a piece snaps into a cell. */
export function playSnap() {
  voice(1320, 0, 0.06, 0.18, 'triangle');
  voice(660, 0, 0.09, 0.12, 'sine');
}

/** Soft tick for each 45 degree step while turning. */
export function playTurn() {
  voice(2100, 0, 0.03, 0.06, 'sine');
}

/** Glass note when a crystal lights. */
export function playLit(step = 0) {
  const notes = [659.25, 783.99, 987.77, 1174.66];
  const f = notes[step % notes.length];
  voice(f, 0, 1.4, 0.22, 'sine');
  voice(f * 2, 0, 0.6, 0.05, 'sine');
}

/** Rising chord when the level is solved. */
export function playSolved() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    voice(f, i * 0.09, 2.2, 0.16, 'sine');
    voice(f * 1.5, i * 0.09 + 0.02, 1.2, 0.03, 'triangle');
  });
}

/** Shimmer when the beam first lands on a palm. */
export function playPalm() {
  voice(1567.98, 0, 0.5, 0.07, 'sine');
  voice(2093, 0.03, 0.4, 0.04, 'sine');
}
