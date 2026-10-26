import * as THREE from 'three';
import type { RigidPose } from './tracking-port';

export const IDENTITY_POSE: RigidPose = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
};

export function isFiniteTuple(value: readonly number[], length: number): boolean {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let i = 0; i < length; i += 1) {
    const item = value[i];
    if (typeof item !== 'number' || !Number.isFinite(item)) return false;
  }
  return true;
}

export function isValidPose(pose: RigidPose | null | undefined): pose is RigidPose {
  if (!pose) return false;
  if (!isFiniteTuple(pose.position, 3)) return false;
  if (!isFiniteTuple(pose.quaternion, 4)) return false;
  const [x, y, z, w] = pose.quaternion;
  const length = Math.hypot(x, y, z, w);
  return Number.isFinite(length) && length > 1e-8;
}

export function normalizeQuaternion(
  quaternion: readonly [number, number, number, number] | number[],
): [number, number, number, number] | null {
  if (quaternion.length !== 4) return null;
  const [x, y, z, w] = quaternion;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    typeof w !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(w)
  ) {
    return null;
  }
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length < 1e-8) return null;
  return [x / length, y / length, z / length, w / length];
}

export function clonePose(pose: RigidPose): RigidPose {
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    quaternion: [
      pose.quaternion[0],
      pose.quaternion[1],
      pose.quaternion[2],
      pose.quaternion[3],
    ],
  };
}

export function normalizePose(pose: RigidPose): RigidPose {
  if (!isValidPose(pose)) {
    throw new Error('RigidPose contains non-finite values or a zero quaternion');
  }
  const quaternion = normalizeQuaternion(pose.quaternion);
  if (!quaternion) throw new Error('RigidPose quaternion cannot be normalized');
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    quaternion,
  };
}

/** Converts a pose to a rigid 4×4 matrix (scale = 1). */
export function toMatrix(pose: RigidPose): THREE.Matrix4 {
  const normalized = normalizePose(pose);
  const quaternion = new THREE.Quaternion(
    normalized.quaternion[0],
    normalized.quaternion[1],
    normalized.quaternion[2],
    normalized.quaternion[3],
  );
  const position = new THREE.Vector3(
    normalized.position[0],
    normalized.position[1],
    normalized.position[2],
  );
  const matrix = new THREE.Matrix4();
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
}

/**
 * Extracts a rigid pose from a matrix. Non-unit scale is rejected rather than
 * silently baked into the saved anchor (SPEC.md §5.6 / §14.2 #6).
 */
export function fromMatrix(matrix: THREE.Matrix4): RigidPose {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  if (
    Math.abs(scale.x - 1) > 1e-5 ||
    Math.abs(scale.y - 1) > 1e-5 ||
    Math.abs(scale.z - 1) > 1e-5
  ) {
    throw new Error('Matrix contains non-unit scale; a rigid pose is required');
  }
  if (!Number.isFinite(position.x) || !Number.isFinite(quaternion.w)) {
    throw new Error('Matrix contains non-finite values');
  }
  quaternion.normalize();
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  };
}

/** T_A_C = inverse(T_A_B) * T_A_C */
export function relativePose(parentWorld: RigidPose, childWorld: RigidPose): RigidPose {
  const parent = toMatrix(parentWorld);
  const child = toMatrix(childWorld);
  const result = parent.clone().invert().multiply(child);
  return fromMatrix(result);
}

/** T_A_C = T_A_B * T_B_C */
export function composePose(parentWorld: RigidPose, childLocal: RigidPose): RigidPose {
  const parent = toMatrix(parentWorld);
  const child = toMatrix(childLocal);
  return fromMatrix(parent.multiply(child));
}

export function translationErrorMeters(a: RigidPose, b: RigidPose): number {
  return Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
}

export function angleErrorDegrees(a: RigidPose, b: RigidPose): number {
  const qa = normalizeQuaternion(a.quaternion);
  const qb = normalizeQuaternion(b.quaternion);
  if (!qa || !qb) return Number.POSITIVE_INFINITY;
  const dot = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]);
  const clamped = Math.min(1, Math.max(-1, dot));
  return (2 * Math.acos(clamped) * 180) / Math.PI;
}

/** Converts the 8th Wall `{position:{x,y,z}, rotation:{w,x,y,z}}` shape. */
export function poseFromXR(
  position: { x: number; y: number; z: number },
  rotation: { w: number; x: number; y: number; z: number },
): RigidPose | null {
  const pose: RigidPose = {
    position: [position.x, position.y, position.z],
    // IMPORTANT: 8th Wall uses {w,x,y,z}; Three.js uses (x,y,z,w).
    quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
  };
  return isValidPose(pose) ? normalizePose(pose) : null;
}

/** Applies a pose to a Three.js Object3D without touching scale. */
export function applyPoseToObject(object: THREE.Object3D, pose: RigidPose): void {
  const normalized = normalizePose(pose);
  object.position.set(
    normalized.position[0],
    normalized.position[1],
    normalized.position[2],
  );
  object.quaternion.set(
    normalized.quaternion[0],
    normalized.quaternion[1],
    normalized.quaternion[2],
    normalized.quaternion[3],
  );
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
}

export function poseFromObject(object: THREE.Object3D): RigidPose {
  object.updateMatrixWorld(true);
  return fromMatrix(object.matrixWorld);
}

export function slerpPose(from: RigidPose, to: RigidPose, alpha: number): RigidPose {
  const a = normalizePose(from);
  const b = normalizePose(to);
  const t = Math.min(1, Math.max(0, alpha));
  const qa = new THREE.Quaternion(...a.quaternion);
  const qb = new THREE.Quaternion(...b.quaternion);
  qa.slerp(qb, t);
  return {
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
      a.position[2] + (b.position[2] - a.position[2]) * t,
    ],
    quaternion: [qa.x, qa.y, qa.z, qa.w],
  };
}

/** Small helper for tests/tools that need a Y-axis rotation pose. */
export function poseWithYaw(position: [number, number, number], degrees: number): RigidPose {
  const half = (degrees * Math.PI) / 360;
  return {
    position,
    quaternion: [0, Math.sin(half), 0, Math.cos(half)],
  };
}
