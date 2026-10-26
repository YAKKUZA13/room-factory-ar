import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  angleErrorDegrees,
  composePose,
  fromMatrix,
  poseFromXR,
  poseWithYaw,
  relativePose,
  toMatrix,
  translationErrorMeters,
} from '../../src/ar/transforms';
import type { RigidPose } from '../../src/ar/tracking-port';

function expectPoseClose(actual: RigidPose, expected: RigidPose, epsilon = 1e-5): void {
  expect(translationErrorMeters(actual, expected)).toBeLessThanOrEqual(epsilon);
  expect(angleErrorDegrees(actual, expected)).toBeLessThanOrEqual(epsilon * 10);
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomPose(rng: () => number): RigidPose {
  const position: [number, number, number] = [
    (rng() - 0.5) * 4,
    (rng() - 0.5) * 2,
    (rng() - 0.5) * 4,
  ];
  const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
  const angle = rng() * Math.PI * 2;
  const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  return {
    position,
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  };
}

describe('pose matrix math', () => {
  it('computes marker-relative pose for a translated factory', () => {
    const marker = poseWithYaw([0, 0, 0], 0);
    const factory: RigidPose = { position: [0.3, 0, 0.4], quaternion: [0, 0, 0, 1] };
    const relative = relativePose(marker, factory);
    expectPoseClose(relative, factory);
  });

  it('round-trips a rotated and translated marker pose', () => {
    const marker = poseWithYaw([0.5, 0.1, -0.2], 90);
    const factory: RigidPose = {
      position: [0.2, 0.3, 0.7],
      quaternion: poseWithYaw([0, 0, 0], -30).quaternion,
    };
    const relative = relativePose(marker, factory);
    const restored = composePose(marker, relative);
    expectPoseClose(restored, factory);
    expect(translationErrorMeters(restored, factory)).toBeLessThanOrEqual(1e-5);
  });

  it('identity * inverse * factory ≈ factory for 100 seeded random poses', () => {
    const rng = seeded(20261026);
    for (let i = 0; i < 100; i += 1) {
      const marker = randomPose(rng);
      const factory = randomPose(rng);
      const relative = relativePose(marker, factory);
      const restored = composePose(marker, relative);
      expect(translationErrorMeters(restored, factory)).toBeLessThan(1e-5);
      expect(angleErrorDegrees(restored, factory)).toBeLessThan(1e-4);
    }
  });

  it('does not mix up {w,x,y,z} and (x,y,z,w) quaternion order', () => {
    const pose = poseFromXR(
      { x: 0, y: 0, z: 0 },
      { w: Math.SQRT1_2, x: 0, y: Math.SQRT1_2, z: 0 },
    );
    expect(pose).not.toBeNull();
    const matrix = toMatrix(pose as RigidPose);
    const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix);
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.y).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('rejects matrices with non-unit scale', () => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion(),
      new THREE.Vector3(1.2, 1.2, 1.2),
    );
    expect(() => fromMatrix(matrix)).toThrow(/scale/i);
  });

  it('round-trips toMatrix/fromMatrix', () => {
    const pose: RigidPose = {
      position: [-0.4, 1.2, 0.33],
      quaternion: poseWithYaw([0, 0, 0], 123).quaternion,
    };
    expectPoseClose(fromMatrix(toMatrix(pose)), pose, 1e-6);
  });

  it('computes translation and angle errors', () => {
    const a = poseWithYaw([0, 0, 0], 0);
    const b = poseWithYaw([0.3, 0.4, 0], 15);
    expect(translationErrorMeters(a, b)).toBeCloseTo(0.5, 6);
    expect(angleErrorDegrees(a, b)).toBeCloseTo(15, 4);
  });
});
