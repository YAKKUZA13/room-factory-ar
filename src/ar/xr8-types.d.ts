import type * as THREE from 'three';

export interface XR8ImageEventDetail {
  name: string;
  type?: string;
  position: { x: number; y: number; z: number };
  rotation: { w: number; x: number; y: number; z: number };
  scale?: number;
  scaledWidth?: number;
  scaledHeight?: number;
}

export interface XR8TrackingStatusDetail {
  status?: string;
  reason?: string;
}

export interface XR8CameraStatusDetail {
  status: 'requesting' | 'hasStream' | 'hasVideo' | 'failed';
}

export interface XR8Reality {
  trackingStatus?: string;
  trackingReason?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { w: number; x: number; y: number; z: number };
}

export interface XR8Hit {
  type?: string;
  position: { x: number; y: number; z: number };
  rotation?: { w: number; x: number; y: number; z: number };
  distance?: number;
}

export interface XR8Scene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export interface XR8PipelineModule {
  name: string;
  onStart?: (options?: { canvas?: HTMLCanvasElement; canvasWidth?: number; canvasHeight?: number }) => void;
  onUpdate?: (options?: { processCpuResult?: { reality?: XR8Reality } }) => void;
  onDetach?: () => void;
  onException?: (error: unknown) => void;
  onCameraStatusChange?: (detail: XR8CameraStatusDetail) => void;
  listeners?: Array<{
    event: string;
    process: (event: { name: string; detail: unknown }) => void;
  }>;
}

export interface XR8Api {
  addCameraPipelineModule(module: XR8PipelineModule): void;
  addCameraPipelineModules(modules: XR8PipelineModule[]): void;
  removeCameraPipelineModule?(module: XR8PipelineModule): void;
  removeCameraPipelineModules?(modules: XR8PipelineModule[]): void;
  clearCameraPipelineModules?(): void;
  run(options: {
    canvas: HTMLCanvasElement;
    allowedDevices?: unknown;
    ownRunLoop?: boolean;
    webgl2?: boolean;
  }): void;
  stop?(): void;
  pause?(): void;
  resume?(): void;
  isPaused?(): boolean;
  version?(): string;
  loadChunk?(name: string): Promise<void>;
  XrController: {
    configure(options: {
      disableWorldTracking?: boolean;
      enableWorldPoints?: boolean;
      enableLighting?: boolean;
      scale?: 'responsive' | 'absolute';
      imageTargetData?: unknown[];
      leftHandedAxes?: boolean;
      mirroredDisplay?: boolean;
    }): void;
    pipelineModule(): XR8PipelineModule;
    hitTest?: (...args: unknown[]) => unknown;
    recenter?(): void;
    updateCameraProjectionMatrix?(options: {
      origin: THREE.Vector3;
      facing: THREE.Quaternion;
    }): void;
  };
  Threejs: {
    pipelineModule(): XR8PipelineModule;
    xrScene(): XR8Scene | null;
    configure?(options: Record<string, unknown>): void;
  };
  GlTextureRenderer: {
    pipelineModule(): XR8PipelineModule;
  };
  XrConfig?: {
    device(): {
      MOBILE_AND_HEADSETS?: unknown;
      MOBILE?: unknown;
      ANY?: unknown;
    };
    camera(): {
      BACK?: unknown;
      FRONT?: unknown;
    };
  };
  XrDevice?: {
    isDeviceBrowserCompatible?: (options?: unknown) => boolean;
    device?: unknown;
  };
  XRExtras?: Record<string, unknown>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    XR8?: XR8Api;
    THREE?: typeof THREE;
  }
}

export {};
