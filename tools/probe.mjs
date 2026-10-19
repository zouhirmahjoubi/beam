// Dev-only: prints Palmlight board state from the managed emulator browser.
// Usage: npx @iwsdk/cli browser run tools/probe.mjs
export default async function run({ page, frame }) {
  return (frame ?? page).evaluate(() => {
    const beam = window.__palmlight;
    if (!beam) return { error: 'window.__palmlight missing (not a dev build, or app not started)' };
    const b = beam.board;
    const root = b.base.root;
    const r = (v) => Math.round(v * 1000) / 1000;
    const pos = (o) => {
      const e = o.matrixWorld.elements;
      return [r(e[12]), r(e[13]), r(e[14])];
    };
    root.updateMatrixWorld(true);
    const hand = (h) => ({
      tracked: h.tracked,
      center: [r(h.center.x), r(h.center.y), r(h.center.z)],
      normal: [r(h.normal.x), r(h.normal.y), r(h.normal.z)],
    });
    return {
      level: b.level.id,
      completed: [...b.completed],
      boardAt: pos(root),
      boardYawDeg: r((root.rotation.y * 180) / Math.PI),
      onDesk: b.onDesk,
      immersive: b.immersive,
      placed: b.placed,
      candidateOk: b.candidateOk,
      held: [...b.queries.held.entities].length,
      hovered: [...b.queries.hovered.entities].length,
      hoverRing: b.base.hoverRing.visible,
      pieces: [...b.queries.pieces.entities].map((e) => pos(e.object3D)),
      palms: b.hands.palms.map(hand),
      palmCells: b.palmCells,
      litMask: b.litMask,
      skyMask: b.skyMask,
      solved: b.solved,
      beams: b.grid ? b.grid.beams.map((x) => x.end) : [],
      free: b.free.map((f) => f.end),
      beamSegments: b.base.beamCore.filter((m) => m.visible).length,
    };
  });
}
