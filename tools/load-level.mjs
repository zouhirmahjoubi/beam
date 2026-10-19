// Dev-only: jump to a level by index. Usage: LEVEL=5 npx @iwsdk/cli browser run tools/load-level.mjs
export default async function run({ page, frame }) {
  const index = Number(process.env.LEVEL ?? 0);
  return (frame ?? page).evaluate((i) => {
    const b = window.__palmlight?.board;
    if (!b) return { error: 'window.__palmlight missing' };
    b.loadLevel(i);
    b.seatPieces();
    return { level: b.level.id };
  }, index);
}
