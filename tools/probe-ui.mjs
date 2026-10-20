// Dev-only: where the board buttons are and whether a pointer touches them.
export default async function run({ page, frame }) {
  return (frame ?? page).evaluate(() => {
    const { world, board } = window.__palmlight;
    const entity = world.getSceneEntity('board-controls');
    const panel = world.getSceneObject('board-controls');
    const names = entity ? entity.getComponents().map((c) => c.id ?? c.name ?? String(c)) : [];
    const r = (v) => Math.round(v * 1000) / 1000;
    const out = { components: names, buttons: {} };
    for (const id of ['restart-button', 'next-button', 'hand-button']) {
      const el = panel?.getElementById(id);
      if (!el) { out.buttons[id] = 'missing'; continue; }
      el.updateWorldMatrix(true, false);
      const e = el.matrixWorld.elements;
      out.buttons[id] = [r(e[12]), r(e[13]), r(e[14])];
    }
    out.hits = board.buttonHits.map((h) => { const e = h.object3D.matrixWorld.elements; return [r(e[12]), r(e[13]), r(e[14]), r(h.object3D.scale.x)]; });
    out.hitsPlaced = board.hitsPlaced;
    return out;
  });
}
