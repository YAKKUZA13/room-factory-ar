import { describe, expect, it } from 'vitest';
import { MarkerPoseFilter } from '../../src/ar/marker-pose-filter';
import type { MarkerObservation, RigidPose } from '../../src/ar/tracking-port';

const NAME = 'room-factory-marker';

function obs(
  position: [number, number, number],
  timeMs: number,
  options: Partial<MarkerObservation> = {},
): MarkerObservation {
  return {
    name: NAME,
    poseWorld: { position, quaternion: [0, 0, 0, 1] },
    timeMs,
    ...options,
  };
}

function feedStable(filter: MarkerPoseFilter, jitter = 0): void {
  for (let i = 0; i < 10; i += 1) {
    const noise = jitter === 0 ? 0 : (i % 2 === 0 ? jitter : -jitter);
    filter.add(obs([0.5 + noise, 0.01, -0.2], 1000 + i * 60));
  }
}

describe('MarkerPoseFilter', () => {
  it('accepts a stable window after at least 8 updates over 500 ms', () => {
    const filter = new MarkerPoseFilter(NAME);
    let decision = filter.add(obs([0.5, 0.01, -0.2], 1000));
    expect(decision.stable).toBe(false);
    for (let i = 1; i < 10; i += 1) {
      decision = filter.add(obs([0.5, 0.01, -0.2], 1000 + i * 60));
    }
    expect(decision.stable).toBe(true);
    expect(decision.samples).toBe(10);
    expect(filter.getStatus()).toBe('stable');
    expect(filter.getStablePose()).not.toBeNull();
  });

  it('does not accept fewer than 8 samples', () => {
    const filter = new MarkerPoseFilter(NAME);
    let decision = filter.add(obs([0, 0, 0], 1000));
    for (let i = 1; i < 7; i += 1) {
      decision = filter.add(obs([0, 0, 0], 1000 + i * 100));
    }
    expect(decision.samples).toBe(7);
    expect(decision.stable).toBe(false);
    expect(decision.durationMs).toBe(600);
  });

  it('does not accept 8 samples that span less than 500 ms', () => {
    const filter = new MarkerPoseFilter(NAME);
    let decision = filter.add(obs([0, 0, 0], 1000));
    for (let i = 1; i < 8; i += 1) {
      decision = filter.add(obs([0, 0, 0], 1000 + i * 20));
    }
    expect(decision.stable).toBe(false);
    expect(decision.durationMs).toBe(140);
  });

  it('rejects a single large spike and loses stable status', () => {
    const filter = new MarkerPoseFilter(NAME);
    feedStable(filter);
    const decision = filter.add(obs([0.9, 0.4, 0.8], 1650));
    expect(decision.accepted).toBe(true);
    expect(decision.stable).toBe(false);
    expect(decision.spreadMeters).toBeGreaterThan(0.03);
    expect(filter.getStablePose()).toBeNull();
  });

  it('rejects an unknown image target name', () => {
    const filter = new MarkerPoseFilter(NAME);
    const decision = filter.add(obs([0, 0, 0], 1000, { name: 'other-card' }));
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe('unknown-marker');
  });

  it('rejects NaN positions and zero quaternions', () => {
    const filter = new MarkerPoseFilter(NAME);
    const badPosition = filter.add(obs([Number.NaN, 0, 0], 1000));
    expect(badPosition.accepted).toBe(false);
    const badQuaternion = filter.add(
      obs([0, 0, 0], 1100, {
        poseWorld: { position: [0, 0, 0], quaternion: [0, 0, 0, 0] },
      }),
    );
    expect(badQuaternion.accepted).toBe(false);
  });

  it('rejects stale observations', () => {
    const filter = new MarkerPoseFilter(NAME);
    const decision = filter.add(obs([0, 0, 0], 1000), 2000);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe('stale-observation');
  });

  it('averages hemisphere-flipped quaternions correctly', () => {
    const filter = new MarkerPoseFilter(NAME);
    let decision = filter.getLastDecision();
    for (let i = 0; i < 10; i += 1) {
      const pose: RigidPose = {
        position: [0, 0, 0],
        // q and -q represent the same rotation; sign must not break averaging.
        quaternion: i % 2 === 0 ? [0, 0.70710678, 0, 0.70710678] : [0, -0.70710678, 0, -0.70710678],
      };
      decision = filter.add({
        name: NAME,
        poseWorld: pose,
        timeMs: 1000 + i * 60,
      });
    }
    expect(decision.stable).toBe(true);
    const stable = filter.getStablePose();
    expect(stable?.quaternion[1]).toBeCloseTo(0.70710678, 5);
    expect(stable?.quaternion[3]).toBeCloseTo(0.70710678, 5);
  });

  it('resets to scanning and marks lost on demand', () => {
    const filter = new MarkerPoseFilter(NAME);
    feedStable(filter);
    filter.markLost();
    expect(filter.getStatus()).toBe('lost');
    expect(filter.getStablePose()).toBeNull();
    filter.reset();
    expect(filter.getStatus()).toBe('scanning');
    expect(filter.getSampleCount()).toBe(0);
  });
});
