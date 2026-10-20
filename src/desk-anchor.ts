/**
 * Desk memory: the board's spot is saved as a WebXR persistent anchor, so the
 * next session puts the board back on the same part of the desk. The Quest
 * browser keeps up to 8 per site and none in private browsing, so every step
 * fails quietly and the game falls back to normal desk placement.
 */
import { Quaternion, Vector3 } from '@iwsdk/core';

const KEY = 'palmlight.anchor.v1';

// Minimal WebXR anchor typings (not in the TypeScript DOM library).
interface AnchorLike {
  anchorSpace: unknown;
  requestPersistentHandle?: () => Promise<string>;
  delete?: () => void;
}
interface PoseLike {
  transform: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
}
export interface FrameLike {
  session: SessionLike;
  createAnchor?: (pose: unknown, space: unknown) => Promise<AnchorLike> | undefined;
  getPose: (space: unknown, base: unknown) => PoseLike | null | undefined;
}
interface SessionLike {
  restorePersistentAnchor?: (handle: string) => Promise<AnchorLike>;
  deletePersistentAnchor?: (handle: string) => Promise<void>;
}

function readHandle(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeHandle(handle: string | null): void {
  try {
    if (handle) localStorage.setItem(KEY, handle);
    else localStorage.removeItem(KEY);
  } catch {
    // Blocked storage only costs the memory, never the game.
  }
}

export class DeskAnchor {
  private anchor: AnchorLike | null = null;
  private restoring = false;
  private saving = false;
  /** Set once a restore attempt has finished, whatever the outcome. */
  settled = false;

  /** Whether an earlier session left a saved spot to try. */
  hasSaved(): boolean {
    return readHandle() !== null;
  }

  /** Start restoring the saved spot for this session. */
  restore(frame: FrameLike): void {
    const handle = readHandle();
    const session = frame.session;
    if (this.restoring) return;
    if (!handle || !session.restorePersistentAnchor) {
      this.settled = true;
      return;
    }
    this.restoring = true;
    session
      .restorePersistentAnchor(handle)
      .then((anchor) => {
        this.anchor = anchor;
      })
      .catch(() => {
        // The anchor is gone (cleared site data, another room): forget it.
        writeHandle(null);
      })
      .finally(() => {
        this.restoring = false;
        this.settled = true;
      });
  }

  /** The restored spot this frame, in the reference space. False until it tracks. */
  pose(frame: FrameLike, space: unknown, position: Vector3, quaternion: Quaternion): boolean {
    if (!this.anchor) return false;
    const pose = frame.getPose(this.anchor.anchorSpace, space);
    if (!pose) return false;
    const { position: p, orientation: o } = pose.transform;
    position.set(p.x, p.y, p.z);
    quaternion.set(o.x, o.y, o.z, o.w);
    return true;
  }

  /** Save the board's current spot, replacing any earlier one. */
  save(frame: FrameLike, space: unknown, position: Vector3, quaternion: Quaternion): void {
    if (this.saving || !frame.createAnchor || typeof XRRigidTransform === 'undefined') return;
    this.saving = true;
    const old = readHandle();
    const transform = new XRRigidTransform(
      { x: position.x, y: position.y, z: position.z },
      { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
    );
    Promise.resolve(frame.createAnchor(transform, space))
      .then(async (anchor) => {
        if (!anchor?.requestPersistentHandle) return;
        const handle = await anchor.requestPersistentHandle();
        if (old && old !== handle) await frame.session.deletePersistentAnchor?.(old).catch(() => undefined);
        writeHandle(handle);
        this.anchor?.delete?.();
        this.anchor = anchor;
      })
      .catch(() => undefined)
      .finally(() => {
        this.saving = false;
      });
  }

  /** Forget the session's anchor, keeping the saved handle for next time. */
  reset(): void {
    this.anchor = null;
    this.restoring = false;
    this.settled = false;
  }
}
