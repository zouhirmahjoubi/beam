// Dev-only: Find my desk state and actions. MODE=state | clear | stub | desk-on | desk-off
// The emulator has no room scan, so `stub` adds a fake initiateRoomCapture that counts calls.
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  return (frame ?? page).evaluate((mode) => {
    const p = window.__palmlight;
    if (!p) return { error: 'window.__palmlight missing' };
    const b = p.board;
    const r = (v) => Math.round(v * 1000) / 1000;
    const at = (o) => {
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      return [r(e[12]), r(e[13]), r(e[14])];
    };
    if (mode === 'clear') {
      localStorage.clear();
      return { cleared: true };
    }
    if (mode === 'stub') {
      const session = p.world.renderer.xr.getSession();
      if (!session) return { error: 'no session' };
      window.__deskScans = 0;
      session.initiateRoomCapture = async () => {
        window.__deskScans += 1;
      };
      return { stubbed: true };
    }
    if (mode === 'desk-on' || mode === 'desk-off') {
      b.onDesk = mode === 'desk-on';
      // Mark the spot as saved, so the placement window being over saves no anchor.
      b.deskSaved = b.onDesk;
      return { onDesk: b.onDesk };
    }
    // The desk hit is created last, after the four bar hits.
    const hit = [...b.queries.buttons.entities].at(-1)?.object3D;
    const el = b.buttonEls[4];
    return {
      deskShown: b.deskShown,
      cardVisible: b.deskCard?.object3D?.visible ?? null,
      cardAt: b.deskCard?.object3D ? at(b.deskCard.object3D) : null,
      boardAt: at(b.base.root),
      barAt: b.controls?.object3D ? at(b.controls.object3D) : null,
      widths: [b.barEl, b.deskBarEl].map((e) => (e ? r(e.getWorldScale(e.position.clone()).x) : null)),
      hitAt: hit ? at(hit) : null,
      hitVisible: hit?.visible ?? null,
      hitScale: hit ? [r(hit.scale.x), r(hit.scale.y)] : null,
      buttonAt: el ? at(el) : null,
      sizes: b.buttonEls.map((e) => e?.size?.value ?? null),
      roomScanUsed: b.roomScanUsed,
      scans: window.__deskScans ?? 0,
      placeUntil: r(b.placeUntil),
      now: r(b.now),
      onDesk: b.onDesk,
      settled: b.desk.settled,
    };
  }, mode);
}
