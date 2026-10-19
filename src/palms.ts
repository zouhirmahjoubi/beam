import { Matrix4, Vector3, type Object3D } from '@iwsdk/core';

// WebXR hand joint order: wrist is 0, the middle finger runs 10 to 14.
const WRIST = 0;
const MIDDLE_METACARPAL = 10;
const MIDDLE_PROXIMAL = 11;
const FLOATS_PER_JOINT = 16;

/** Palm radius used for hits, in meters. */
export const PALM_RADIUS = 0.055;

export interface PalmState {
  tracked: boolean;
  /** Board-local palm center. */
  center: Vector3;
  /** Board-local unit normal pointing out of the palm. */
  normal: Vector3;
}

interface HandAdapter {
  connected: boolean;
  jointTransforms?: Float32Array;
}

export interface HandSource {
  visualAdapters: { hand: { left: HandAdapter; right: HandAdapter } };
}

/**
 * Reads both hands' joint poses each frame and turns them into palm discs in
 * board space. Allocation free after construction.
 */
export class PalmReader {
  readonly palms: [PalmState, PalmState] = [
    { tracked: false, center: new Vector3(), normal: new Vector3() },
    { tracked: false, center: new Vector3(), normal: new Vector3() },
  ];
  private toBoard = new Matrix4();
  private boardInverse = new Matrix4();
  private joint = new Matrix4();
  private a = new Vector3();
  private b = new Vector3();

  /** `grips` are the player's left and right grip spaces; joints are stored relative to them. */
  update(source: HandSource, grips: { left: Object3D; right: Object3D }, board: Object3D): void {
    board.updateWorldMatrix(true, false);
    this.boardInverse.copy(board.matrixWorld).invert();
    const hands = source.visualAdapters.hand;
    this.read(hands.left, grips.left, this.palms[0]);
    this.read(hands.right, grips.right, this.palms[1]);
  }

  private read(hand: HandAdapter | undefined, grip: Object3D, out: PalmState): void {
    const jt = hand?.connected ? hand.jointTransforms : undefined;
    const base = MIDDLE_PROXIMAL * FLOATS_PER_JOINT;
    if (!jt || jt.length < base + FLOATS_PER_JOINT || jt[WRIST * FLOATS_PER_JOINT + 15] === 0) {
      out.tracked = false;
      return;
    }
    // Grip space -> world -> board local.
    grip.updateWorldMatrix(true, false);
    this.toBoard.multiplyMatrices(this.boardInverse, grip.matrixWorld);
    this.a.fromArray(jt, WRIST * FLOATS_PER_JOINT + 12);
    this.b.fromArray(jt, base + 12);
    out.center.addVectors(this.a, this.b).multiplyScalar(0.5).applyMatrix4(this.toBoard);

    // The joint's +Y axis points out of the back of the hand, so the palm faces -Y.
    this.joint.fromArray(jt, MIDDLE_METACARPAL * FLOATS_PER_JOINT);
    out.normal.setFromMatrixColumn(this.joint, 1).negate();
    out.normal.transformDirection(this.toBoard);
    out.tracked = true;
  }
}
