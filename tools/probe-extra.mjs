// Dev-only helpers for tools/m2-final.mjs. MODE=glow | fps-on | fps
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'glow';
  return (frame ?? page).evaluate((mode) => {
    const b = window.__palmlight?.board;
    if (!b) return { error: 'window.__palmlight missing' };
    if (mode === 'fps-on') {
      b.setFrameTimeReadout(true);
      return { on: true };
    }
    if (mode === 'fps') return { label: b.fpsLabel, visible: b.fpsCard?.object3D?.visible ?? null };
    return { glowLevel: [...b.glowLevel], visible: b.base.palmGlows.map((g) => g.visible), touch: [...b.palmTouch] };
  }, mode);
}
