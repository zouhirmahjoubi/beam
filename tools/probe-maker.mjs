// Dev-only: puzzle maker state and actions. MODE=state | solve | close-page
// state also returns where the maker buttons and the cell CELL (col * 6 + row) are.
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  return (frame ?? page).evaluate(
    ({ mode, cell }) => {
      const p = window.__palmlight;
      if (!p) return { error: 'window.__palmlight missing' };
      const b = p.board;
      const r = (v) => Math.round(v * 1000) / 1000;
      const at = (o) => {
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements;
        return [r(e[12]), r(e[13]), r(e[14])];
      };
      if (mode === 'solve') {
        // The maker's own solve, using the solver's answer with the palette pieces.
        const s = p.solve(b.level);
        if (!s) return { error: 'no solution' };
        s.pieces.forEach((piece) => {
          const slot = b.level.tray.findIndex((t, j) => t.kind === piece.kind && t.color === piece.color && !b.placed[j]);
          b.placed[slot] = piece;
        });
        b.seatPieces();
        // Real piece moves save; do the same.
        b.persist();
        return { pieces: s.pieces.length };
      }
      if (mode === 'close-page') {
        document.querySelector('#share-page [data-act="close"]')?.click();
        return { closed: !document.getElementById('share-page') };
      }
      // Tiles are created in cell order.
      const tiles = [...b.queries.cells.entities];
      const ids = ['make-button', 'maker-clear', 'maker-move', 'maker-share', 'maker-done'];
      const els = [b.buttonEls[4], ...b.buttonEls.slice(7, 11)];
      const buttons = Object.fromEntries(ids.map((id, i) => [id, els[i] ? at(els[i]) : null]));
      const pageEl = document.getElementById('share-page');
      return {
        making: b.making,
        level: b.level.id,
        tray: b.level.tray.length,
        controlsVisible: b.controls?.object3D?.visible ?? null,
        makerVisible: b.makerCard?.object3D?.visible ?? null,
        caption: b.making ? b.makerText() : null,
        draft: b.draft,
        makerSolved: b.makerSolved,
        placed: b.placed.filter(Boolean).length,
        tilesUp: tiles.filter((t) => t.object3D.position.y > -5).length,
        tileAt: tiles[cell] ? at(tiles[cell].object3D) : null,
        buttons,
        sharePage: pageEl ? pageEl.querySelector('input').value : null,
        search: window.location.search,
      };
    },
    { mode, cell: Number(process.env.CELL ?? 0) },
  );
}
