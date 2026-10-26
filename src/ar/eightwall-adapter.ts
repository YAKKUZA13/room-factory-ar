import * as THREE from 'three';
import { MARKER_METADATA_URL, MARKER_TARGET_NAME } from '../config';
import type {
  MarkerObservation,
  RigidPose,
  SlamStatus,
  TrackingPort,
  Unsubscribe,
} from './tracking-port';
import { poseFromXR } from './transforms';
import { loadMarkerMetadata, loadXrRuntime } from './xr-loader';
import { bindCanvasViewport } from './canvas-viewport';
import type {
  XR8Api,
  XR8CameraStatusDetail,
  XR8Hit,
  XR8ImageEventDetail,
  XR8PipelineModule,
  XR8Reality,
  XR8TrackingStatusDetail,
} from './xr8-types';

export type LogLevel = 'info' | 'warn' | 'error';

export interface EightWallAdapterOptions {
  markerName?: string;
  metadataUrl?: string;
  onLog?: (level: LogLevel, message: string, data?: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}

const START_TIMEOUT_MS = 30_000;

function mapTracking(status: string | undefined, reason: string | undefined): SlamStatus | null {
  if (reason === 'INITIALIZING') return 'initializing';
  if (status === 'NORMAL') return 'normal';
  if (status === 'LIMITED') return 'limited';
  return null;
}

/**
 * The only module allowed to touch XR8. It exposes the local TrackingPort
 * abstraction and nothing about the game economy. Verified API notes:
 * - image events use rotation {w,x,y,z};
 * - hitTest (current engine docs) is synchronous, takes 0..1 screen coords and
 *   returns an array; the older callback signature is kept as a fallback;
 * - tracking status is read from processCpuResult.reality.trackingStatus and
 *   reality.trackingstatus events, never from processGpuResult.tracking.
 */
export class EightWallAdapter implements TrackingPort {
  private readonly markerName: string;
  private readonly metadataUrl: string;
  private readonly onLog?: (level: LogLevel, message: string, data?: Record<string, unknown>) => void;
  private readonly onError?: (error: Error) => void;

  private status: SlamStatus = 'unavailable';
  private xr8: XR8Api | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private modules: XR8PipelineModule[] = [];
  private started = false;
  private releaseViewport: (() => void) | null = null;
  private starting = false;
  private startResolve: (() => void) | null = null;
  private startReject: ((error: Error) => void) | null = null;
  private startTimer = 0;
  private cameraStatus = 'unavailable';
  private sdkVersion = '';
  private markerVisible = false;
  private lastMarkerPose: RigidPose | null = null;
  private lastMarkerScale: number | undefined;
  private lastMarkerRepeatAt = 0;
  private readonly trackingListeners = new Set<(status: SlamStatus) => void>();
  private readonly observationListeners = new Set<(value: MarkerObservation) => void>();
  private readonly lostListeners = new Set<(markerName: string) => void>();
  private readonly frameListeners = new Set<(timeMs: number) => void>();

  constructor(options: EightWallAdapterOptions = {}) {
    this.markerName = options.markerName ?? MARKER_TARGET_NAME;
    this.metadataUrl = options.metadataUrl ?? MARKER_METADATA_URL;
    this.onLog = options.onLog;
    this.onError = options.onError;
  }

  async start(canvas: HTMLCanvasElement): Promise<void> {
    if (this.starting || this.started) {
      throw new Error('AR-сессия уже запущена; для нового сеанса перезагрузите страницу.');
    }
    this.starting = true;
    this.canvas = canvas;
    this.setStatus('initializing');

    try {
      const xr8 = await loadXrRuntime();
      this.xr8 = xr8;
      this.sdkVersion = typeof xr8.version === 'function' ? String(xr8.version()) : '';
      window.THREE = THREE;
      this.onLog?.('info', 'XR8 runtime loaded', { version: this.sdkVersion });

      const metadata = await loadMarkerMetadata(this.metadataUrl);
      if (metadata.name !== this.markerName) {
        throw new Error(
          `Image target name mismatch: expected ${this.markerName}, metadata has ${metadata.name}.`,
        );
      }
      this.onLog?.('info', 'Marker metadata loaded', {
        name: metadata.name,
        type: metadata.type,
        imagePath: metadata.imagePath,
      });

      xr8.XrController.configure({
        disableWorldTracking: false,
        enableWorldPoints: false,
        scale: 'absolute',
        imageTargetData: [metadata],
      });

      const appModule = this.createAppModule();
      this.modules = [
        xr8.GlTextureRenderer.pipelineModule(),
        xr8.Threejs.pipelineModule(),
        xr8.XrController.pipelineModule(),
        appModule,
      ];
      xr8.addCameraPipelineModules(this.modules);
      this.releaseViewport = bindCanvasViewport(canvas);

      await new Promise<void>((resolve, reject) => {
        this.startResolve = resolve;
        this.startReject = reject;
        this.startTimer = window.setTimeout(() => {
          reject(
            new Error(
              'Камера не запустилась за 30 секунд. Проверьте разрешение и закройте другие AR-вкладки.',
            ),
          );
        }, START_TIMEOUT_MS);

        try {
          const allowedDevices = xr8.XrConfig?.device().MOBILE_AND_HEADSETS;
          xr8.run({ canvas, ...(allowedDevices === undefined ? {} : { allowedDevices }) });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      this.started = true;
      this.starting = false;
      this.onLog?.('info', 'AR camera pipeline started', {
        camera: this.cameraStatus,
      });
    } catch (error) {
      this.releaseViewport?.();
      this.releaseViewport = null;
      this.starting = false;
      this.clearStartPromise();
      this.setStatus('lost');
      if (this.xr8) {
        try {
          if (this.xr8.removeCameraPipelineModules && this.modules.length > 0) {
            this.xr8.removeCameraPipelineModules(this.modules);
          }
          this.xr8.stop?.();
        } catch {
          // Ignore a failed cleanup; the caller shows the fallback UI.
        }
      }
      this.modules = [];
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.onLog?.('error', 'AR start failed', { message: normalized.message });
      throw normalized;
    }
  }

  async stop(): Promise<void> {
    this.releaseViewport?.();
    this.releaseViewport = null;
    this.clearStartPromise();
    const xr8 = this.xr8;
    if (xr8) {
      try {
        if (xr8.removeCameraPipelineModules && this.modules.length > 0) {
          xr8.removeCameraPipelineModules(this.modules);
        }
        xr8.stop?.();
      } catch (error) {
        this.onLog?.('warn', 'XR8 stop threw', { error: String(error) });
      }
    }
    this.modules = [];
    this.scene = null;
    this.camera = null;
    this.canvas = null;
    this.setStatus('unavailable');
    this.started = false;
  }

  getCamera(): THREE.Camera | null {
    return this.camera;
  }

  getScene(): THREE.Scene | null {
    return this.scene;
  }

  getStatus(): SlamStatus {
    return this.status;
  }

  getCameraStatus(): string {
    return this.cameraStatus;
  }

  getSdkVersion(): string {
    return this.sdkVersion;
  }

  getRenderStats(): { drawCalls: number; triangles: number } {
    const info = this.xr8?.Threejs.xrScene()?.renderer.info;
    return {
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
    };
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
    try {
      this.xr8?.pause?.();
    } catch (error) {
      this.onLog?.('warn', 'XR8 pause failed', { error: String(error) });
    }
  }

  resume(): void {
    try {
      this.xr8?.resume?.();
    } catch (error) {
      this.onLog?.('warn', 'XR8 resume failed', { error: String(error) });
    }
  }

  async tryHitTest(screenX: number, screenY: number): Promise<RigidPose | null> {
    const xr8 = this.xr8;
    const canvas = this.canvas;
    if (!xr8 || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const x = Math.min(1, Math.max(0, (screenX - rect.left) / width));
    const y = Math.min(1, Math.max(0, (screenY - rect.top) / height));
    const fn = xr8.XrController.hitTest;
    if (typeof fn !== 'function') return null;

    let syncResult: unknown;
    try {
      // Current documentation: hitTest(x, y, includedTypes) -> array.
      syncResult = fn(x, y, ['FEATURE_POINT']);
    } catch (error) {
      this.onLog?.('warn', 'hitTest sync form failed; trying callback form', {
        error: String(error),
      });
    }
    if (Array.isArray(syncResult)) return this.parseHitTest(syncResult);
    if (syncResult && typeof syncResult === 'object') return this.parseHitTest([syncResult]);

    // Older engine releases used NDC coordinates and a callback.
    return new Promise<RigidPose | null>((resolve) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
      }, 400);
      try {
        fn({ x: x * 2 - 1, y: -(y * 2 - 1) }, (hit: unknown) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          if (Array.isArray(hit)) resolve(this.parseHitTest(hit));
          else if (hit && typeof hit === 'object') resolve(this.parseHitTest([hit]));
          else resolve(null);
        });
      } catch {
        done = true;
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  }

  private parseHitTest(results: unknown[]): RigidPose | null {
    const priority: Record<string, number> = {
      DETECTED_SURFACE: 0,
      ESTIMATED_SURFACE: 1,
      FEATURE_POINT: 2,
      UNSPECIFIED: 3,
    };
    const hits = results
      .filter((item): item is XR8Hit => {
        if (!item || typeof item !== 'object') return false;
        const position = (item as XR8Hit).position;
        return Boolean(
          position &&
            Number.isFinite(position.x) &&
            Number.isFinite(position.y) &&
            Number.isFinite(position.z),
        );
      })
      .sort(
        (a, b) =>
          (priority[a.type ?? 'UNSPECIFIED'] ?? 4) - (priority[b.type ?? 'UNSPECIFIED'] ?? 4),
      );
    for (const hit of hits) {
      // hitTest rotation uses {x,y,z,w}; convert into image-event order for the helper.
      const rotation = hit.rotation;
      const pose = poseFromXR(
        hit.position,
        rotation
          ? { w: rotation.w, x: rotation.x, y: rotation.y, z: rotation.z }
          : { w: 1, x: 0, y: 0, z: 0 },
      );
      if (pose) return pose;
    }
    return null;
  }

  private createAppModule(): XR8PipelineModule {
    return {
      name: 'room-factory-session',
      onStart: () => {
        const xr8 = this.xr8;
        if (!xr8) {
          this.rejectStart(new Error('XR8 disappeared during start'));
          return;
        }
        const xrScene = xr8.Threejs.xrScene();
        if (!xrScene) {
          this.rejectStart(new Error('XR8.Threejs.xrScene() returned null'));
          return;
        }
        this.scene = xrScene.scene;
        this.camera = xrScene.camera;
        this.onLog?.('info', 'XR scene ready');
        this.resolveStart();
      },
      onUpdate: (args) => {
        const reality = args?.processCpuResult?.reality;
        if (reality) this.applyReality(reality);
        const now = performance.now();
        this.repeatMarkerPoseIfNeeded(now);
        for (const listener of this.frameListeners) listener(now);
      },
      onCameraStatusChange: (detail: XR8CameraStatusDetail) => {
        this.cameraStatus = detail?.status ?? 'failed';
        this.onLog?.('info', 'Camera status changed', { status: this.cameraStatus });
        if (this.cameraStatus === 'failed') {
          const error = new Error(
            'Камера недоступна или доступ запрещён. Разрешите камеру и повторите попытку.',
          );
          if (this.starting) {
            this.rejectStart(error);
          } else {
            this.setStatus('lost');
            this.onError?.(error);
          }
        }
      },
      onException: (error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.onLog?.('error', 'XR8 exception', { message: normalized.message });
        this.onError?.(normalized);
        if (this.starting) this.rejectStart(normalized);
        this.setStatus('lost');
      },
      onDetach: () => {
        this.onLog?.('info', 'XR pipeline detached');
      },
      listeners: [
        {
          event: 'reality.imagefound',
          process: (event) => this.handleImageEvent(event.detail, 'found'),
        },
        {
          event: 'reality.imageupdated',
          process: (event) => this.handleImageEvent(event.detail, 'updated'),
        },
        {
          event: 'reality.imagelost',
          process: (event) => this.handleImageLost(event.detail),
        },
        {
          event: 'reality.trackingstatus',
          process: (event) => this.handleTrackingEvent(event.detail),
        },
      ],
    };
  }

  private handleImageEvent(detail: unknown, kind: 'found' | 'updated'): void {
    const data = detail as XR8ImageEventDetail | null;
    if (!data || data.name !== this.markerName) return;
    const poseWorld = poseFromXR(data.position, data.rotation);
    if (!poseWorld) {
      this.onLog?.('warn', 'Image target event had invalid pose', { kind });
      return;
    }
    this.markerVisible = true;
    this.lastMarkerPose = poseWorld;
    this.lastMarkerScale = typeof data.scale === 'number' ? data.scale : undefined;
    this.lastMarkerRepeatAt = performance.now();
    this.emitMarkerObservation(poseWorld, this.lastMarkerScale, this.lastMarkerRepeatAt, kind);
  }

  private handleImageLost(detail: unknown): void {
    const data = detail as { name?: string } | null;
    if (!data?.name || data.name !== this.markerName) return;
    this.markerVisible = false;
    this.lastMarkerPose = null;
    for (const listener of this.lostListeners) listener(data.name);
  }

  /**
   * A held marker may not emit imageupdated every frame. The last SDK pose is
   * still the tracked pose until imagelost, so feed it to the stability filter at
   * a bounded rate. This never invents a pose.
   */
  private repeatMarkerPoseIfNeeded(now: number): void {
    if (!this.markerVisible || !this.lastMarkerPose) return;
    if (now - this.lastMarkerRepeatAt < 140) return;
    this.lastMarkerRepeatAt = now;
    this.emitMarkerObservation(this.lastMarkerPose, this.lastMarkerScale, now, 'repeat');
  }

  private emitMarkerObservation(
    poseWorld: RigidPose,
    sdkScale: number | undefined,
    timeMs: number,
    kind: 'found' | 'updated' | 'repeat',
  ): void {
    const observation: MarkerObservation = {
      name: this.markerName,
      poseWorld,
      timeMs,
      sdkScale,
    };
    if (this.observationListeners.size === 0) {
      this.onLog?.('warn', 'Marker observation without listeners', { kind });
    }
    for (const listener of this.observationListeners) listener(observation);
  }

  private handleTrackingEvent(detail: unknown): void {
    const data = detail as XR8TrackingStatusDetail | null;
    const mapped = mapTracking(data?.status, data?.reason);
    if (mapped) this.setStatus(mapped);
  }

  private applyReality(reality: XR8Reality): void {
    const mapped = mapTracking(reality.trackingStatus, reality.trackingReason);
    if (mapped) this.setStatus(mapped);
  }

  private setStatus(status: SlamStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onLog?.('info', 'SLAM status changed', { status });
    for (const listener of this.trackingListeners) listener(status);
  }

  private resolveStart(): void {
    if (!this.startResolve) return;
    const resolve = this.startResolve;
    this.clearStartPromise();
    resolve();
  }

  private rejectStart(error: Error): void {
    if (!this.startReject) return;
    const reject = this.startReject;
    this.clearStartPromise();
    reject(error);
  }

  private clearStartPromise(): void {
    window.clearTimeout(this.startTimer);
    this.startTimer = 0;
    this.startResolve = null;
    this.startReject = null;
  }
}
