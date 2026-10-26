import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FactoryRenderer } from '../render/factory-renderer';

export interface ViewerStats {
  fps: number;
  frameTimeP95: number;
  drawCalls: number;
  triangles: number;
  visibleMeshes: number;
}

export interface ViewerCallbacks {
  onFrame(deltaSeconds: number, elapsedSeconds: number): void;
  onTap(clientX: number, clientY: number): void;
  onHover(clientX: number, clientY: number): void;
  onHoverEnd(): void;
}

export type PerformanceMode = 'auto' | 'low' | 'high';

/**
 * Standalone desktop/3D viewer. Owns its own WebGLRenderer and RAF loop; the AR
 * pipeline never uses this loop. One viewer exists per page session.
 */
export class Desktop3DViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly factoryRenderer: FactoryRenderer;
  private readonly callbacks: ViewerCallbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly resizeObserver: ResizeObserver;
  private rafId = 0;
  private running = false;
  private lastFrameTime = 0;
  private userInteracted = false;
  private readonly initialDirection = new THREE.Vector3(0.6, 0.36, 0.72).normalize();
  private readonly target = new THREE.Vector3(0, 0.14, 0);
  private fps = 0;
  private fpsFrames = 0;
  private fpsWindowStart = 0;
  private frameTimeSamples: number[] = [];
  private drawCalls = 0;
  private triangles = 0;

  private pointerDown: { id: number; x: number; y: number; time: number } | null = null;
  private lastHover = 0;

  constructor(
    canvas: HTMLCanvasElement,
    factoryRenderer: FactoryRenderer,
    callbacks: ViewerCallbacks,
  ) {
    this.canvas = canvas;
    this.factoryRenderer = factoryRenderer;
    this.callbacks = callbacks;

    this.scene.background = new THREE.Color(0x11161a);
    this.scene.fog = new THREE.Fog(0x11161a, 3.5, 8);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 60);
    this.camera.position.set(1.55, 1.2, 1.7);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(this.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 5;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => {
      this.userInteracted = true;
    });
    this.controls.update();

    this.buildEnvironment();
    this.factoryRenderer.attach(this.scene);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.frameFactory();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = this.lastFrameTime;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  setPerformanceMode(mode: PerformanceMode): void {
    const dpr = window.devicePixelRatio || 1;
    const limit = mode === 'low' ? 1 : mode === 'high' ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(dpr, limit));
    this.resize();
  }

  setControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  getViewport(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  getStats(): ViewerStats {
    let visibleMeshes = 0;
    this.scene.traverseVisible((object) => {
      if (object instanceof THREE.Mesh) visibleMeshes += 1;
    });
    return {
      fps: this.fps,
      frameTimeP95: percentile(this.frameTimeSamples, 0.95),
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      visibleMeshes,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.scene.remove(this.factoryRenderer.root);
    this.controls.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private frame = (time: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const rawDelta = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;
    const delta = Math.max(0, Math.min(0.25, rawDelta));

    this.callbacks.onFrame(delta, time / 1000);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.drawCalls = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
    this.fpsFrames += 1;
    if (time - this.fpsWindowStart >= 1000) {
      this.fps = (this.fpsFrames * 1000) / (time - this.fpsWindowStart);
      this.fpsFrames = 0;
      this.fpsWindowStart = time;
    }
    this.frameTimeSamples.push(delta * 1000);
    if (this.frameTimeSamples.length > 120) this.frameTimeSamples.shift();
  };

  private resize(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, parent?.clientHeight ?? window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (!this.userInteracted) this.frameFactory();
  }

  /** Fits the ~1 m factory platform into the current viewport. */
  private frameFactory(): void {
    const aspect = Math.max(0.2, this.camera.aspect);
    const verticalFov = (this.camera.fov * Math.PI) / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const verticalDistance = 0.68 / Math.tan(verticalFov / 2);
    const horizontalDistance = 0.68 / Math.tan(horizontalFov / 2);
    const distance = Math.min(4.6, Math.max(1.45, Math.max(verticalDistance, horizontalDistance) * 1.12));
    this.camera.position.copy(this.target).addScaledVector(this.initialDirection, distance);
    this.controls.target.copy(this.target);
    this.controls.update();
  }

  private buildEnvironment(): void {
    const tableGeometry = new THREE.CylinderGeometry(1.38, 1.42, 0.07, 64);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2125,
      roughness: 0.8,
      metalness: 0.25,
    });
    const table = new THREE.Mesh(tableGeometry, tableMaterial);
    table.position.y = -0.085;
    this.scene.add(table);
    this.ownedGeometries.push(tableGeometry);
    this.ownedMaterials.push(tableMaterial);

    const rimGeometry = new THREE.TorusGeometry(1.39, 0.008, 6, 96);
    const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xe7ab20, transparent: true, opacity: 0.55 });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.048;
    this.scene.add(rim);
    this.ownedGeometries.push(rimGeometry);
    this.ownedMaterials.push(rimMaterial);

    const shadowGeometry = new THREE.CircleGeometry(0.9, 48);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.046;
    this.scene.add(shadow);
    this.ownedGeometries.push(shadowGeometry);
    this.ownedMaterials.push(shadowMaterial);

    const hemisphere = new THREE.HemisphereLight(0xfff3d9, 0x1c2429, 1.35);
    const key = new THREE.DirectionalLight(0xfff0cc, 1.9);
    key.position.set(2.4, 4, 2.2);
    key.castShadow = false;
    const fill = new THREE.DirectionalLight(0x4d9aa8, 0.55);
    fill.position.set(-2.5, 1.8, -2.2);
    this.scene.add(hemisphere, key, fill);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDown = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start || start.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const duration = performance.now() - start.time;
    if (distance < 6 && duration < 700) {
      this.callbacks.onTap(event.clientX, event.clientY);
    }
  };

  private handlePointerCancel = (): void => {
    this.pointerDown = null;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerDown) return;
    const now = performance.now();
    if (now - this.lastHover < 45) return;
    this.lastHover = now;
    this.callbacks.onHover(event.clientX, event.clientY);
  };

  private handlePointerLeave = (): void => {
    this.callbacks.onHoverEnd();
  };

  private handleContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    console.warn('[viewer] WebGL context lost');
  };

  private handleContextRestored = (): void => {
    console.info('[viewer] WebGL context restored');
    this.resize();
  };
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}
