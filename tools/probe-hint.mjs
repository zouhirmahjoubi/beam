// Dev-only: hint state. MODE=state | daily-solve (today's daily solved through the dev hook)
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  return (frame ?? page).evaluate((mode) => {
    const p = window.__palmlight;
    if (!p) return { error: 'window.__palmlight missing' };
    const b = p.board;
    if (mode === 'daily-solve') {
      b.openDaily();
      const s = p.solve(b.level);
      if (!s) return { error: 'daily has no solution' };
      s.pieces.forEach((piece, i) => {
        const slot = b.level.tray.findIndex((t, j) => t.kind === piece.kind && t.color === piece.color && !b.placed[j]);
        b.placed[slot >= 0 ? slot : i] = piece;
      });
      b.seatPieces();
      return { daily: b.level.id };
    }
    const page = document.getElementById('share-page');
    return {
      level: b.level.id,
      hintsLeft: b.hintsLeft,
      hintLabel: b.hintLabelText(),
      dailyLabel: b.dailyText(),
      playing: b.coach.playing,
      demo: b.coach.demo?.kind ?? null,
      sharePage: page ? { link: page.querySelector('input')?.value ?? null, text: page.querySelector('textarea')?.value ?? null } : null,
    };
  }, mode);
}
