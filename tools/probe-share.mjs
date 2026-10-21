// Dev-only: shared puzzle state and actions. MODE=state | link | solve | place | next
// `link` puts ?p=CODE in the address (CODE may be empty), ready for a reload.
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  return (frame ?? page).evaluate(
    ({ mode, code }) => {
      const p = window.__palmlight;
      if (!p) return { error: 'window.__palmlight missing' };
      const b = p.board;
      if (mode === 'link') {
        window.history.replaceState(null, '', code ? `?p=${code}` : window.location.pathname);
        return { search: window.location.search };
      }
      const putSolution = (count) => {
        const s = p.solve(b.level);
        if (!s) return { error: 'no solution' };
        s.pieces.slice(0, count).forEach((piece, i) => {
          const slot = b.level.tray.findIndex((t, j) => t.kind === piece.kind && t.color === piece.color && !b.placed[j]);
          b.placed[slot >= 0 ? slot : i] = piece;
        });
        b.seatPieces();
        b.persist();
        return { pieces: s.pieces.length };
      };
      if (mode === 'solve') return putSolution(Infinity);
      if (mode === 'place') return putSolution(1);
      if (mode === 'next') {
        b.nextLevel();
        return { level: b.level.id };
      }
      const save = JSON.parse(localStorage.getItem('palmlight.save.v1') ?? 'null');
      return {
        level: b.level.id,
        extra: b.extra,
        shared: b.shared,
        daily: b.daily,
        notice: b.notice,
        solved: b.solved,
        placed: b.placed.filter(Boolean).length,
        search: window.location.search,
        saveBoard: save?.boardId ?? null,
        completed: save?.completed ?? [],
        streak: save?.daily?.streak ?? null,
      };
    },
    { mode, code: process.env.CODE ?? '' },
  );
}
