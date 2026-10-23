// Dev-only: where the last placed sound played and where the listener is.
export default async function run({ page, frame }) {
  return (frame ?? page).evaluate(() => {
    const p = window.__palmlight;
    if (!p) return { error: 'window.__palmlight missing' };
    const { world, board: b, audioDebug } = p;
    const r = (v) => Math.round(v * 1000) / 1000;
    const v3 = (v) => (v ? [r(v.x), r(v.y), r(v.z)] : null);
    const crystals = (b.content?.crystals ?? []).map((m) => v3(m.getWorldPosition(b.soundAt.clone())));
    const head = v3((b.immersive ? b.player.head : world.camera).getWorldPosition(b.soundAt.clone()));
    const center = v3(b.base.root.getWorldPosition(b.soundAt.clone()));
    return { level: b.level.id, solved: b.solved, recent: audioDebug.recent.map(v3), listener: v3(audioDebug.listener), crystals, center, head };
  });
}
