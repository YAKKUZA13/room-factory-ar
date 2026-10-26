import { describe, expect, it } from 'vitest';
import { AnchorManager } from '../../src/ar/anchor-manager';
import { angleErrorDegrees, composePose, poseWithYaw, translationErrorMeters } from '../../src/ar/transforms';
import type { MarkerObservation, RigidPose } from '../../src/ar/tracking-port';

const NAME = 'room-factory-marker';
const IDENTITY: RigidPose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };

function markerPose(pose: RigidPose): MarkerObservation {
  return { name: NAME, poseWorld: pose, timeMs: 1000, sdkScale: 1 };
}

function manager(slam: 'normal' | 'limited' = 'normal'): AnchorManager {
  return new AnchorManager(
    { kind: 'unbound' },
    { markerName: NAME, slamStatus: slam },
  );
}

describe('AnchorManager', () => {
  it('binds T_M_F = inverse(T_W_M) * T_W_F without moving the factory', () => {
    const anchor = manager();
    const factoryPose = poseWithYaw([0.3, 0, 0.4], 25);
    anchor.confirmFreePlacement(factoryPose);
    const result = anchor.bindToMarker(markerPose(poseWithYaw([0.8, 0.1, -0.4], 90)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('marker');
    if (result.value.kind !== 'marker') return;
    const marker = poseWithYaw([0.8, 0.1, -0.4], 90);
    const restored = composePose(marker, result.value.markerToFactory);
    expect(translationErrorMeters(restored, factoryPose)).toBeLessThan(1e-5);
    expect(angleErrorDegrees(restored, factoryPose)).toBeLessThan(1e-4);
    // Binding does not cause a visible jump in the current session.
    expect(translationErrorMeters(anchor.getWorldFactoryPose() as RigidPose, factoryPose)).toBeLessThan(1e-9);
  });

  it('restores T_W_F from a new marker world pose in a new SLAM session', () => {
    const anchor = manager();
    const factoryPose = poseWithYaw([0.2, 0.05, -0.15], -40);
    anchor.confirmFreePlacement(factoryPose);
    const bind = anchor.bindToMarker(markerPose(IDENTITY));
    expect(bind.ok).toBe(true);

    // New session: SLAM world origin is completely different.
    const newMarker = poseWithYaw([1.7, -0.2, 2.4], 135);
    const restore = anchor.restoreFromMarker(markerPose(newMarker));
    expect(restore.ok).toBe(true);
    if (!restore.ok) return;
    if (bind.ok && bind.value.kind === 'marker') {
      const expectedPose = composePose(newMarker, bind.value.markerToFactory);
      expect(translationErrorMeters(restore.value, expectedPose)).toBeLessThan(1e-6);
    }
    expect(anchor.getWorldFactoryPose()).not.toBeNull();
  });

  it('does not reuse a previous world pose for an unbound factory', () => {
    const anchor = manager();
    expect(anchor.getWorldFactoryPose()).toBeNull();
    const fresh = new AnchorManager(
      { kind: 'unbound' },
      { markerName: NAME, slamStatus: 'normal' },
    );
    expect(fresh.getWorldFactoryPose()).toBeNull();
    expect(fresh.getAnchor()).toEqual({ kind: 'unbound' });
  });

  it('refuses binding while SLAM is LIMITED but keeps an existing anchor', () => {
    const anchor = manager('limited');
    anchor.confirmFreePlacement(IDENTITY);
    const result = anchor.bindToMarker(markerPose(IDENTITY));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('slam-not-tracking');
    expect(anchor.getAnchor()).toEqual({ kind: 'unbound' });

    const bound = new AnchorManager(
      {
        kind: 'marker',
        markerName: NAME,
        markerToFactory: IDENTITY,
        bindingVersion: 1,
      },
      { markerName: NAME, slamStatus: 'limited' },
    );
    expect(bound.getAnchor().kind).toBe('marker');
    const restore = bound.restoreFromMarker(markerPose(IDENTITY));
    expect(restore.ok).toBe(false);
    expect(bound.getAnchor().kind).toBe('marker');
  });

  it('rejects a marker with the wrong name', () => {
    const anchor = manager();
    anchor.confirmFreePlacement(IDENTITY);
    const result = anchor.bindToMarker({
      name: 'another-marker',
      poseWorld: IDENTITY,
      timeMs: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('marker-mismatch');
  });

  it('temporary placement never overwrites the marker anchor', () => {
    const boundPose: RigidPose = poseWithYaw([0.1, 0, 0.2], 10);
    const anchor = new AnchorManager(
      {
        kind: 'marker',
        markerName: NAME,
        markerToFactory: boundPose,
        bindingVersion: 1,
      },
      { markerName: NAME, slamStatus: 'normal' },
    );
    anchor.placeTemporarily(poseWithYaw([3, 0, 3], 90));
    expect(anchor.isTemporary()).toBe(true);
    expect(anchor.getAnchor()).toEqual({
      kind: 'marker',
      markerName: NAME,
      markerToFactory: boundPose,
      bindingVersion: 1,
    });
  });

  it('small marker drift is applied smoothly; large drift requires confirmation', () => {
    const factoryPose = poseWithYaw([0, 0, 0], 0);
    const anchor = new AnchorManager(
      {
        kind: 'marker',
        markerName: NAME,
        markerToFactory: factoryPose,
        bindingVersion: 1,
      },
      { markerName: NAME, slamStatus: 'normal' },
    );
    anchor.restoreFromMarker(markerPose(IDENTITY));
    const small = anchor.applyMarkerCorrection(markerPose(poseWithYaw([0.03, 0, 0], 2)));
    expect(small.requiresConfirmation).toBe(false);
    expect(small.applied).toBe(true);
    expect(small.translationMeters).toBeCloseTo(0.03, 5);

    const large = anchor.applyMarkerCorrection(markerPose(poseWithYaw([0.5, 0, 0], 40)));
    expect(large.requiresConfirmation).toBe(true);
    expect(large.applied).toBe(false);
    expect(anchor.getAnchor().kind).toBe('marker');
  });

  it('smooths the display pose toward the requested pose', () => {
    const anchor = new AnchorManager(
      {
        kind: 'marker',
        markerName: NAME,
        markerToFactory: poseWithYaw([0, 0, 0], 0),
        bindingVersion: 1,
      },
      { markerName: NAME, slamStatus: 'normal' },
    );
    anchor.restoreFromMarker(markerPose(IDENTITY));
    const from = anchor.getDisplayFactoryPose() as RigidPose;
    // A re-observed marker implies a new world pose. Display lags behind it.
    anchor.restoreFromMarker(markerPose(poseWithYaw([1, 0, 0], 90)));
    anchor.update(0.05);
    const mid = anchor.getDisplayFactoryPose() as RigidPose;
    expect(translationErrorMeters(mid, from)).toBeGreaterThan(0);
    expect(translationErrorMeters(mid, poseWithYaw([1, 0, 0], 90))).toBeGreaterThan(0);
    anchor.update(2);
    const done = anchor.getDisplayFactoryPose() as RigidPose;
    expect(translationErrorMeters(done, poseWithYaw([1, 0, 0], 90))).toBeLessThan(1e-3);
  });

  it('rebinding stores a new T_M_F without touching the factory layout', () => {
    const anchor = new AnchorManager(
      {
        kind: 'marker',
        markerName: NAME,
        markerToFactory: IDENTITY,
        bindingVersion: 1,
      },
      { markerName: NAME, slamStatus: 'normal' },
    );
    anchor.placeTemporarily(poseWithYaw([2, 0, 0], 0));
    const result = anchor.rebindToMarker(markerPose(poseWithYaw([1, 0, 0], 0)));
    expect(result.ok).toBe(true);
    const stored = anchor.getAnchor();
    expect(stored.kind).toBe('marker');
    if (stored.kind === 'marker') {
      expect(translationErrorMeters(stored.markerToFactory, poseWithYaw([1, 0, 0], 0))).toBeLessThan(1e-6);
    }
  });
});
