// Dev-only: accessibility settings state and actions.
// MODE=state | set (KEY=oneHand|reducedMotion|highContrast VALUE=on|off|auto) | ghost
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  const key = process.env.KEY ?? '';
  const value = process.env.VALUE ?? '';
  return (frame ?? page).evaluate(
    ({ mode, key, value }) => {
      const p = window.__palmlight;
      if (!p) return { error: 'window.__palmlight missing' };
      const b = p.board;
      const r = (v) => Math.round(v * 1000) / 1000;
      if (mode === 'set') {
        b.setSetting(key, value === 'auto' ? null : value === 'on');
        return { settings: b.settings };
      }
      if (mode === 'ghost') {
        // Where the coach's ghost hand is right now, to tell a loop from a still pose.
        const h = b.coach.hands[0];
        return { visible: h.root.visible, at: [r(h.root.position.x), r(h.root.position.y), r(h.root.position.z)], opacity: r(h.material.opacity) };
      }
      const save = JSON.parse(localStorage.getItem('palmlight.save.v1') ?? 'null');
      const glow = b.base.beamGlow[0];
      return {
        settings: b.settings,
        savedSettings: save?.settings ?? null,
        reducedMotion: b.coach.reducedMotion,
        level: b.level.id,
        solved: b.solved,
        completed: [...b.completed],
        pins: b.pins.filter(Boolean).length,
        pinGhosts: b.pinGhosts.filter((g) => g.root.visible).length,
        palmCells: b.palmCells.map((c) => c && [c.col, c.row, c.lift]),
        beamGlowWidth: r(glow.scale.x),
        beamGlowOpacity: r(glow.material.opacity),
        settingsVisible: b.settingsCard?.object3D?.visible ?? null,
        controlsVisible: b.controls?.object3D?.visible ?? null,
        labels: b.settingsLabels(),
      };
    },
    { mode, key, value },
  );
}
