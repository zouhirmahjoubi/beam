// Dev-only: Meta VR Glasses view check. Measures where the board's parts sit in
// the player's view, as angles from the camera, and reports the gaze state.
// MODE=state | pieces
export default async function run({ page, frame }) {
  const mode = process.env.MODE ?? 'state';
  return (frame ?? page).evaluate((mode) => {
    const p = window.__palmlight;
    if (!p) return { error: 'window.__palmlight missing' };
    const { world, board } = p;
    const r = (v) => Math.round(v * 10) / 10;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const camera = world.camera;
    camera.updateMatrixWorld(true);
    const toView = (x, y, z) => {
      const e = camera.matrixWorldInverse.elements;
      return [
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      ];
    };
    const deg = (a) => (a * 180) / Math.PI;
    /**
     * Angular box of an object's world bounds: yaw right+, pitch up+, in degrees.
     * UIKit elements are scaled to their laid-out size, so their rectangle is the
     * unit square; their glyph meshes are instanced and have no bounds of their own.
     * `skip` leaves out parts that are meant to run out of view, like the stand.
     * `uiOnly` measures a UIKit panel by its root element alone: icon and label
     * wrappers carry a size on an unscaled matrix, and icon meshes keep SVG units.
     */
    const extents = (obj, skip = [], uiOnly = false) => {
      if (!obj) return null;
      obj.updateWorldMatrix(true, true);
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      const add = (o, corners) => {
        const e = o.matrixWorld.elements;
        for (const [cx, cy, cz] of corners) {
          const wx = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
          const wy = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
          const wz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
          const [vx, vy, vz] = toView(wx, wy, wz);
          const yaw = deg(Math.atan2(vx, -vz));
          const pitch = deg(Math.atan2(vy, -vz));
          min[0] = Math.min(min[0], yaw); max[0] = Math.max(max[0], yaw);
          min[1] = Math.min(min[1], pitch); max[1] = Math.max(max[1], pitch);
          min[2] = Math.min(min[2], -vz); max[2] = Math.max(max[2], -vz);
        }
      };
      const box = (b) => {
        const out = [];
        for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) out.push([cx, cy, cz]);
        return out;
      };
      const quad = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0], [0.5, 0.5, 0]];
      let rootDone = false;
      obj.traverse((o) => {
        if (skip.includes(o) || !o.visible) return;
        if (o.size && o.size.peek && o.size.peek()) {
          if (uiOnly && rootDone) return;
          rootDone = true;
          add(o, quad);
        } else if (!uiOnly && o.isMesh && o.geometry && !o.isInstancedMesh && !o.parent?.size) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          add(o, box(o.geometry.boundingBox));
        }
      });
      if (!isFinite(min[0])) return null;
      return { yaw: [r(min[0]), r(max[0])], pitch: [r(min[1]), r(max[1])], depth: [r3(min[2]), r3(max[2])] };
    };
    const pieces = [...board.queries.pieces.entities];
    if (mode === 'pieces') {
      return {
        pieces: pieces.map((e) => {
          const o = e.object3D;
          o.updateWorldMatrix(true, false);
          const m = o.matrixWorld.elements;
          return [r3(m[12]), r3(m[13]), r3(m[14])];
        }),
        held: board.queries.held.entities.size,
      };
    }
    const profile = window.__IWSDK_EMULATION_PROFILE ?? null;
    const session = world.renderer.xr.getSession();
    const sources = session ? [...session.inputSources].map((s) => s.targetRayMode) : [];
    return {
      profile,
      gazeEnabled: world.input.xr.gazeEnabled,
      gazeSource: sources.includes('gaze'),
      enabledFeatures: session?.enabledFeatures?.filter((f) => /gaze|eye/.test(f)) ?? [],
      level: board.level.id,
      view: {
        board: extents(board.base.root, [board.base.stand]),
        bar: extents(board.controls?.object3D, [], true),
        hint: extents(board.hintCard?.object3D, [], true),
        tray: extents(board.base.trayPad),
      },
    };
  }, mode);
}
