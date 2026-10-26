import type * as THREE from 'three';
import type {
  MarkerObservation,
  RigidPose,
  SlamStatus,
  TrackingPort,
  Unsubscribe,
} from './tracking-port';
import { clonePose, poseWithYaw } from './transforms';

export interface MockAdapterOptions {
  markerName: string;
  worldOffset?: [number, number, number];
  basePose?: RigidPose;
  intervalMs?: number;
  autoEmit?: boolean;
}

/**
 * Explicitly MOCK tracking. It must never be presented as real SLAM; the UI adds
 * a MOCK AR badge. Used by ?mockAR=1 for E2E and manual walkthroughs.
 */
export class MockAdapter implements TrackingPort {
  readonly isMock = true;
  private readonly markerName: string;
  private readonly worldOffset: [number, number, number];
  private readonly basePose: RigidPose;
  private readonly intervalMs: number;
  private readonly autoEmit: boolean;
  private status: SlamStatus = 'unavailable';
  private markerVisible = true;
  private timer: number | null = null;
  private readonly trackingListeners = new Set<(status: SlamStatus) => void>();
  private readonly observationListeners = new Set<(value: MarkerObservation) => void>();
  private readonly lostListeners = new Set<(markerName: string) => void>();
  private readonly frameListeners = new Set<(timeMs: number) => void>();
  private startedAt = 0;
  private lastLostEmitted = false;

  constructor(options: MockAdapterOptions) {
    this.markerName = options.markerName;
    this.worldOffset = options.worldOffset ?? [0, 0, 0];
    this.basePose = options.basePose ?? poseWithYaw([0.35, 0.02, -0.45], 15);
    this.intervalMs = options.intervalMs ?? 70;
    this.autoEmit = options.autoEmit ?? true;
  }

  async start(_canvas: HTMLCanvasElement): Promise<void> {
    this.startedAt = performance.now();
    this.setStatus('normal');
    if (this.autoEmit && this.timer === null) {
      this.timer = window.setInterval(() => this.emitObservation(), this.intervalMs);
    }
    this.emitObservation();
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.setStatus('unavailable');
  }

  getCamera(): THREE.Camera | null {
    return null;
  }

  getScene(): THREE.Scene | null {
    return null;
  }

  getStatus(): SlamStatus {
    return this.status;
  }

  onTrackingChange(cb: (status: SlamStatus) => void): Unsubscribe {
    this.trackingListeners.add(cb);
    return () => this.trackingListeners.delete(cb);
  }

  onMarkerObservation(cb: (value: MarkerObservation) => void): Unsubscribe {
    this.observationListeners.add(cb);
    return () => this.observationListeners.delete(cb);
  }

  onMarkerLost(cb: (markerName: string) => void): Unsubscribe {
    this.lostListeners.add(cb);
    return () => this.lostListeners.delete(cb);
  }

  onFrame(cb: (timeMs: number) => void): Unsubscribe {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  pause(): void {
    // The mock has no camera stream or engine loop to pause.
  }

  resume(): void {
    // The mock has no camera stream or engine loop to resume.
  }

  async tryHitTest(_screenX: number, _screenY: number): Promise<RigidPose | null> {
    return poseWithYaw([0, 0, 0], 0);
  }

  setMarkerVisible(visible: boolean): void {
    this.markerVisible = visible;
    if (!visible) {
      if (!this.lastLostEmitted) {
        for (const listener of this.lostListeners) listener(this.markerName);
        this.lastLostEmitted = true;
      }
    } else {
      this.lastLostEmitted = false;
      this.emitObservation();
    }
  }

  setTrackingStatus(status: SlamStatus): void {
    this.setStatus(status);
  }

  getMarkerPose(): RigidPose {
    return this.computePose(performance.now());
  }

  getWorldOffset(): [number, number, number] {
    return [...this.worldOffset];
  }

  pulseFrames(nowMs: number): void {
    for (const listener of this.frameListeners) listener(nowMs);
  }

  private setStatus(status: SlamStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.trackingListeners) listener(status);
  }

  private emitObservation(): void {
    if (!this.markerVisible || this.status === 'unavailable' || this.status === 'lost') return;
    const pose = this.computePose(performance.now());
    const observation: MarkerObservation = {
      name: this.markerName,
      poseWorld: pose,
      timeMs: performance.now(),
      sdkScale: 1,
    };
    for (const listener of this.observationListeners) listener(observation);
  }

  private computePose(nowMs: number): RigidPose {
    const t = (nowMs - this.startedAt) / 1000;
    const jitterX = Math.sin(t * 1.3) * 0.0018;
    const jitterY = Math.cos(t * 1.1) * 0.0012;
    const jitterZ = Math.sin(t * 0.7) * 0.0018;
    const yaw = 15 + Math.sin(t * 0.9) * 0.12;
    const pose = poseWithYaw(
      [
        this.basePose.position[0] + jitterX,
        this.basePose.position[1] + jitterY,
        this.basePose.position[2] + jitterZ,
      ],
      yaw,
    );
    return {
      position: [
        pose.position[0] + this.worldOffset[0],
        pose.position[1] + this.worldOffset[1],
        pose.position[2] + this.worldOffset[2],
      ],
      quaternion: clonePose(pose).quaternion,
    };
  }
}
