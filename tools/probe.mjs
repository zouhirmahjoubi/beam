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
    // Right index fingertip in world space (joint 9 is relative to the grip).
    const adapter = beam.world.input.xr.visualAdapters.hand.right;
    let indexTip = null;
    if (adapter?.connected && adapter.jointTransforms) {
      const grip = beam.board.player.gripSpaces.right;
      grip.updateWorldMatrix(true, false);
      const m = grip.matrixWorld.elements;
      const j = adapter.jointTransforms;
      const x = j[9 * 16 + 12], y = j[9 * 16 + 13], z = j[9 * 16 + 14];
      indexTip = [r(m[0] * x + m[4] * y + m[8] * z + m[12]), r(m[1] * x + m[5] * y + m[9] * z + m[13]), r(m[2] * x + m[6] * y + m[10] * z + m[14])];
    }
    return {
      indexTip,
      level: b.level.id,
      completed: [...b.completed],
      boardAt: pos(root),
      boardYawDeg: r((root.rotation.y * 180) / Math.PI),
      onDesk: b.onDesk,
      immersive: b.immersive,
      placed: b.placed,
      candidateOk: b.candidateOk,
      held: [...b.queries.held.entities].length,
      paused: b.paused,
      traySide: b.traySide,
      controlsAt: b.controls?.object3D ? pos(b.controls.object3D) : null,
      controlsVisible: b.controls?.object3D?.visible ?? null,
      pauseVisible: b.pauseCard?.object3D?.visible ?? null,
      hovered: [...b.queries.hovered.entities].length,
      hoverRing: b.base.hoverRing.visible,
      pieces: [...b.queries.pieces.entities].map((e) => pos(e.object3D)),
      palms: b.hands.palms.map(hand),
      palmCells: b.palmCells,
      litMask: b.litMask,
      skyMask: b.skyMask,
      solved: b.solved,
      beams: b.grid ? b.grid.beams.map((x) => x.end) : [],
      free: b.free.slice(0, b.freeCount).map((f) => f.end),
      beamSegments: b.base.beamCore.filter((m) => m.visible).length,
    };
  });
}
