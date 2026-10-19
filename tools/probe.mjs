// Dev-only: prints Beam board state from the managed emulator browser.
// Usage: npx @iwsdk/cli browser run tools/probe.mjs
export default async function run({ page, frame }) {
  return (frame ?? page).evaluate(() => {
    const beam = window.__beam;
    if (!beam) return { error: 'window.__beam missing (not a dev build, or app not started)' };
    const b = beam.board;
    const root = b.view.root;
    const r = (v) => Math.round(v * 1000) / 1000;
    const pos = (o) => {
      const e = o.matrixWorld.elements;
      return [r(e[12]), r(e[13]), r(e[14])];
    };
    root.updateMatrixWorld(true);
    return {
      boardAt: pos(root),
      boardYawDeg: r((root.rotation.y * 180) / Math.PI),
      onDesk: b.onDesk,
      immersive: b.immersive,
      placed: b.placed,
      candidateOk: b.candidateOk,
      held: b.queries.held.entities.size ?? [...b.queries.held.entities].length,
      mirrors: [...b.queries.mirrors.entities].map((e) => pos(e.object3D)),
      litMask: b.litMask,
      solved: b.solved,
      beamSegments: b.view.beamCore.filter((m) => m.visible).length,
    };
  });
}
