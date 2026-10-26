import { MARKER_FILTER } from '../core/constants';
import type { MarkerObservation, MarkerStatus, RigidPose } from './tracking-port';
import { angleErrorDegrees, isValidPose, normalizeQuaternion, normalizePose } from './transforms';

export interface MarkerFilterConfig {
  minSamples: number;
  maxSamples: number;
  minDurationMs: number;
  maxPositionSpreadMeters: number;
  maxAngleSpreadDegrees: number;
  maxObservationAgeMs: number;
  sampleRetentionMs: number;
}

export type MarkerRejectReason =
  | 'unknown-marker'
  | 'invalid-pose'
  | 'non-finite-time'
  | 'stale-observation'
  | 'duplicate-timestamp';

export interface FilterDecision {
  accepted: boolean;
  reason?: MarkerRejectReason;
  stable: boolean;
  samples: number;
  durationMs: number;
  spreadMeters?: number;
  spreadDegrees?: number;
  pose?: RigidPose;
  sdkScale?: number;
}

const DEFAULT_CONFIG: MarkerFilterConfig = {
  minSamples: MARKER_FILTER.minSamples,
  maxSamples: MARKER_FILTER.maxSamples,
  minDurationMs: MARKER_FILTER.minDurationMs,
  maxPositionSpreadMeters: MARKER_FILTER.maxPositionSpreadMeters,
  maxAngleSpreadDegrees: MARKER_FILTER.maxAngleSpreadDegrees,
  maxObservationAgeMs: MARKER_FILTER.maxObservationAgeMs,
  sampleRetentionMs: MARKER_FILTER.sampleRetentionMs,
};

interface Sample {
  pose: RigidPose;
  timeMs: number;
}

/**
 * Rejects spikes, NaN and unknown targets, and only reports a stable pose after
 * at least minSamples observations spanning minDurationMs with a small spread.
 * Position is averaged arithmetically; quaternions are hemisphere-aligned before
 * averaging (never Euler angles). See SPEC.md §4.4.
 */
export class MarkerPoseFilter {
  readonly expectedName: string;
  private readonly config: MarkerFilterConfig;
  private samples: Sample[] = [];
  private stablePose: RigidPose | null = null;
  private status: MarkerStatus = 'scanning';
  private lastTimeMs = Number.NEGATIVE_INFINITY;
  private lastDecision: FilterDecision = {
    accepted: false,
    stable: false,
    samples: 0,
    durationMs: 0,
  };

  constructor(expectedName: string, config: Partial<MarkerFilterConfig> = {}) {
    this.expectedName = expectedName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  add(observation: MarkerObservation, nowMs: number = observation.timeMs): FilterDecision {
    if (observation.name !== this.expectedName) {
      return this.reject('unknown-marker');
    }
    if (!Number.isFinite(observation.timeMs) || !Number.isFinite(nowMs)) {
      return this.reject('non-finite-time');
    }
    if (nowMs - observation.timeMs > this.config.maxObservationAgeMs) {
      return this.reject('stale-observation');
    }
    if (observation.timeMs <= this.lastTimeMs - 1) {
      return this.reject('duplicate-timestamp');
    }
    if (!isValidPose(observation.poseWorld)) {
      return this.reject('invalid-pose');
    }

    let pose: RigidPose;
    try {
      pose = normalizePose(observation.poseWorld);
    } catch {
      return this.reject('invalid-pose');
    }

    this.lastTimeMs = observation.timeMs;
    this.samples.push({ pose, timeMs: observation.timeMs });
    const cutoff = observation.timeMs - this.config.sampleRetentionMs;
    if (this.samples.length > this.config.maxSamples) {
      this.samples.splice(0, this.samples.length - this.config.maxSamples);
    }
    while (this.samples.length > 0 && (this.samples[0]?.timeMs ?? 0) < cutoff) {
      this.samples.shift();
    }

    return this.evaluate(observation.sdkScale);
  }

  private reject(reason: MarkerRejectReason): FilterDecision {
    this.stablePose = null;
    this.status = this.samples.length > 0 ? 'visible-unstable' : 'scanning';
    this.lastDecision = {
      accepted: false,
      reason,
      stable: false,
      samples: this.samples.length,
      durationMs: this.duration(),
    };
    return this.lastDecision;
  }

  private evaluate(sdkScale?: number): FilterDecision {
    const samples = this.samples;
    if (samples.length < this.config.minSamples) {
      return this.markUnstable();
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last) return this.markUnstable();
    const durationMs = last.timeMs - first.timeMs;
    if (durationMs < this.config.minDurationMs) {
      return this.markUnstable(durationMs);
    }

    const meanPosition: [number, number, number] = [0, 0, 0];
    const reference = normalizeQuaternion(samples[0]?.pose.quaternion ?? [0, 0, 0, 1]);
    if (!reference) return this.markUnstable(durationMs);
    const meanQuaternion: [number, number, number, number] = [0, 0, 0, 0];

    for (const sample of samples) {
      meanPosition[0] += sample.pose.position[0];
      meanPosition[1] += sample.pose.position[1];
      meanPosition[2] += sample.pose.position[2];
      const q = normalizeQuaternion(sample.pose.quaternion);
      if (!q) return this.markUnstable(durationMs);
      const dot = q[0] * reference[0] + q[1] * reference[1] + q[2] * reference[2] + q[3] * reference[3];
      const sign = dot < 0 ? -1 : 1;
      meanQuaternion[0] += q[0] * sign;
      meanQuaternion[1] += q[1] * sign;
      meanQuaternion[2] += q[2] * sign;
      meanQuaternion[3] += q[3] * sign;
    }

    const count = samples.length;
    const meanPose: RigidPose = {
      position: [meanPosition[0] / count, meanPosition[1] / count, meanPosition[2] / count],
      quaternion: normalizeQuaternion(meanQuaternion) ?? reference,
    };

    let spreadMeters = 0;
    let spreadDegrees = 0;
    for (const sample of samples) {
      spreadMeters = Math.max(spreadMeters, distance(meanPose, sample.pose));
      spreadDegrees = Math.max(spreadDegrees, angleErrorDegrees(meanPose, sample.pose));
    }

    const spreadOk =
      spreadMeters <= this.config.maxPositionSpreadMeters &&
      spreadDegrees <= this.config.maxAngleSpreadDegrees;

    if (!spreadOk) {
      this.stablePose = null;
      this.status = 'visible-unstable';
      this.lastDecision = {
        accepted: true,
        stable: false,
        samples: count,
        durationMs,
        spreadMeters,
        spreadDegrees,
        sdkScale,
      };
      return this.lastDecision;
    }

    this.stablePose = meanPose;
    this.status = 'stable';
    this.lastDecision = {
      accepted: true,
      stable: true,
      samples: count,
      durationMs,
      spreadMeters,
      spreadDegrees,
      pose: meanPose,
      sdkScale,
    };
    return this.lastDecision;
  }

  private markUnstable(durationMs = this.duration()): FilterDecision {
    this.stablePose = null;
    this.status = 'visible-unstable';
    this.lastDecision = {
      accepted: true,
      stable: false,
      samples: this.samples.length,
      durationMs,
    };
    return this.lastDecision;
  }

  private duration(): number {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    return first && last ? Math.max(0, last.timeMs - first.timeMs) : 0;
  }

  getStablePose(): RigidPose | null {
    return this.stablePose ? { ...this.stablePose, position: [...this.stablePose.position], quaternion: [...this.stablePose.quaternion] } as RigidPose : null;
  }

  getStatus(): MarkerStatus {
    return this.status;
  }

  getLastDecision(): FilterDecision {
    return this.lastDecision;
  }

  getSampleCount(): number {
    return this.samples.length;
  }

  markLost(): void {
    this.samples = [];
    this.stablePose = null;
    this.status = 'lost';
  }

  reset(): void {
    this.samples = [];
    this.stablePose = null;
    this.status = 'scanning';
    this.lastTimeMs = Number.NEGATIVE_INFINITY;
    this.lastDecision = {
      accepted: false,
      stable: false,
      samples: 0,
      durationMs: 0,
    };
  }
}

function distance(a: RigidPose, b: RigidPose): number {
  return Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
}
