// Dev-only: M3 state and actions. MODE=state | clear | place | daily-solve | desk-on
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  return (frame ?? page).evaluate((mode) => {
    const p = window.__palmlight;
    if (!p) return { error: 'window.__palmlight missing' };
    const b = p.board;
    const r = (v) => Math.round(v * 1000) / 1000;
    if (mode === 'clear') {
      localStorage.clear();
      return { cleared: true };
    }
    if (mode === 'place') {
      b.loadLevel(1);
      b.placed[0] = { kind: 'mirror', col: 2, row: 4, angle: 1 };
      b.seatPieces();
      b.persist();
      return { placed: b.placed };
    }
    if (mode === 'daily-solve') {
      b.openDaily();
      const s = p.solve(b.level);
      if (!s) return { error: 'daily has no solution' };
      s.pieces.forEach((piece, i) => {
        const slot = b.level.tray.findIndex((t, j) => t.kind === piece.kind && t.color === piece.color && !b.placed[j]);
        b.placed[slot >= 0 ? slot : i] = piece;
      });
      b.seatPieces();
      return { daily: b.level.id, pieces: s.pieces.length };
    }
    if (mode === 'desk-on') {
      b.onDesk = true;
      return { onDesk: true };
    }
    const save = JSON.parse(localStorage.getItem('palmlight.save.v1') ?? 'null');
    const root = b.base.root;
    return {
      level: b.level.id,
      daily: b.daily,
      solved: b.solved,
      placed: b.placed.map((m) => (m ? [m.col, m.row, m.angle] : null)),
      hintVisible: b.hintCard?.object3D?.visible ?? null,
      ghostVisible: b.coach.hands.map((h) => h.root.visible),
      coachPlaying: b.coach.playing,
      demo: b.coach.demo?.kind ?? null,
      saveLevel: save?.levelId ?? null,
      saveBoard: save?.boardId ?? null,
      streak: save?.daily?.streak ?? null,
      anchor: localStorage.getItem('palmlight.anchor.v1') ? 'saved' : null,
      deskRestored: b.deskRestored,
      deskSaved: b.deskSaved,
      onDesk: b.onDesk,
      boardAt: [r(root.position.x), r(root.position.y), r(root.position.z), r(root.rotation.y)],
    };
  }, mode);
}
