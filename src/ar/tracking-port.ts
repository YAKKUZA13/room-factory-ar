import type * as THREE from 'three';
import type { Result } from '../core/types';

/**
 * SLAM status is deliberately independent from marker visibility.
 * See SPEC.md §4.8.
 */
export type SlamStatus = 'unavailable' | 'initializing' | 'limited' | 'normal' | 'lost';

export type MarkerStatus =
  | 'not-configured'
  | 'scanning'
  | 'visible-unstable'
  | 'stable'
  | 'lost';

export type PlacementStatus =
  | 'not-placed'
  | 'free-preview'
  | 'free-unbound'
  | 'binding'
  | 'bound-needs-marker'
  | 'bound-tracking'
  | 'temporarily-placed'
  | 'relocalization-needed';

export interface RigidPose {
  position: [number, number, number];
  /** Quaternion in Three.js order: x, y, z, w. */
  quaternion: [number, number, number, number];
}

export interface MarkerObservation {
  /** Must match the configured image target name exactly. */
  name: string;
  poseWorld: RigidPose;
  /** performance.now() within the current AR session. */
  timeMs: number;
  /** SDK-reported absolute scale, kept for diagnostics only. */
  sdkScale?: number;
}

export type AnchorState =
  | { kind: 'unbound' }
  | {
      kind: 'marker';
      markerName: string;
      /** Rigid factory pose relative to the physical marker: T_M_F. */
      markerToFactory: RigidPose;
      bindingVersion: 1;
    };

export type AnchorErrorCode =
  | 'no-factory-pose'
  | 'slam-not-tracking'
  | 'marker-mismatch'
  | 'invalid-pose'
  | 'already-bound'
  | 'internal-error';

export interface AnchorError {
  code: AnchorErrorCode;
  message: string;
}

export type Unsubscribe = () => void;

/**
 * Local adapter interface. 8th Wall does not ship this abstraction; EightWallAdapter
 * is the only module allowed to touch XR8 directly. MockAdapter is explicitly MOCK.
 */
export interface TrackingPort {
  start(canvas: HTMLCanvasElement): Promise<void>;
  stop(): Promise<void>;
  getCamera(): THREE.Camera | null;
  getScene(): THREE.Scene | null;
  getStatus(): SlamStatus;
  onTrackingChange(cb: (status: SlamStatus) => void): Unsubscribe;
  onMarkerObservation(cb: (value: MarkerObservation) => void): Unsubscribe;
  onMarkerLost(cb: (markerName: string) => void): Unsubscribe;
  onFrame(cb: (timeMs: number) => void): Unsubscribe;
  tryHitTest(screenX: number, screenY: number): Promise<RigidPose | null>;
  /** Optional engine lifecycle hooks; pause is not a game pause. */
  pause?(): void;
  resume?(): void;
}

export interface AnchorManagerPort {
  getAnchor(): AnchorState;
  getWorldFactoryPose(): RigidPose | null;
  beginFreePlacement(): void;
  confirmFreePlacement(worldPose: RigidPose): void;
  bindToMarker(observation: MarkerObservation): Result<AnchorState, import('../core/types').DomainError>;
  requestRelocalization(): void;
  restoreFromMarker(observation: MarkerObservation): Result<RigidPose, import('../core/types').DomainError>;
  placeTemporarily(pose: RigidPose): void;
  rebindToMarker(observation: MarkerObservation): Result<void, import('../core/types').DomainError>;
}
