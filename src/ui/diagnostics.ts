import type { AnchorState, RigidPose, SlamStatus, MarkerStatus } from '../ar/tracking-port';
import type { FactoryState } from '../core/types';
import { triggerDownload } from '../persistence/import-export';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  at: string;
  level: DiagnosticLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * In-memory ring buffer, 100 entries. Nothing is sent anywhere; export is an
 * explicit user action and contains no camera frames or personal data.
 */
export class DiagnosticsLog {
  private entries: DiagnosticEntry[] = [];
  private readonly limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  push(level: DiagnosticLevel, category: string, message: string, data?: Record<string, unknown>): void {
    const entry: DiagnosticEntry = {
      at: new Date().toISOString(),
      level,
      category,
      message,
      ...(data === undefined ? {} : { data }),
    };
    this.entries.push(entry);
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
    if (level === 'error') console.error(`[${category}] ${message}`, data ?? '');
    else if (level === 'warn') console.warn(`[${category}] ${message}`, data ?? '');
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.push('info', category, message, data);
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.push('warn', category, message, data);
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.push('error', category, message, data);
  }

  all(): readonly DiagnosticEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}

export interface DiagnosticsSnapshot {
  mode: string;
  sdkState: string;
  sdkVersion: string;
  camera: string;
  slam: SlamStatus;
  markerName: string;
  markerStatus: MarkerStatus;
  anchor: AnchorState;
  markerToFactory: RigidPose | null;
  worldPose: RigidPose | null;
  poseTranslationErrorMeters: number | null;
  poseAngleErrorDegrees: number | null;
  fps: number;
  frameTimeP95: number;
  drawCalls: number;
  triangles: number;
  visibleMeshes: number;
  buildings: number;
  activeItems: number;
  productionPerMinute: number;
  saveLastSuccessISO: string | null;
  saveSchemaVersion: number;
  storageError: string | null;
  appVersion: string;
  commit: string;
  device: string;
  factory: FactoryState;
  extra?: Record<string, unknown>;
}

export function formatDiagnostics(snapshot: DiagnosticsSnapshot): string {
  const anchor =
    snapshot.anchor.kind === 'marker'
      ? `bound to ${snapshot.anchor.markerName}`
      : 'unbound';
  const poseError =
    snapshot.poseTranslationErrorMeters === null
      ? '—'
      : `${snapshot.poseTranslationErrorMeters.toFixed(3)} m / ${(snapshot.poseAngleErrorDegrees ?? 0).toFixed(2)}°`;
  return [
    `mode: ${snapshot.mode}`,
    `SDK state: ${snapshot.sdkState}`,
    `SDK version: ${snapshot.sdkVersion || 'unknown'}`,
    `camera: ${snapshot.camera}`,
    `SLAM: ${snapshot.slam}`,
    `marker: ${snapshot.markerName} · ${snapshot.markerStatus}`,
    `anchor: ${anchor}`,
    `marker-to-factory: ${formatPose(snapshot.markerToFactory)}`,
    `world factory pose: ${formatPose(snapshot.worldPose)}`,
    `pose error: ${poseError}`,
    `FPS: ${snapshot.fps.toFixed(1)} · frame p95: ${snapshot.frameTimeP95.toFixed(1)} ms`,
    `draw calls: ${snapshot.drawCalls} · triangles: ${snapshot.triangles} · visible meshes: ${snapshot.visibleMeshes}`,
    `buildings: ${snapshot.buildings} · active items: ${snapshot.activeItems}`,
    `production: ${snapshot.productionPerMinute}/min · credits: ${snapshot.factory.credits} · sold: ${snapshot.factory.totalPartsSold}`,
    `save: last ok ${snapshot.saveLastSuccessISO ?? '—'} · schema v${snapshot.saveSchemaVersion}`,
    `storage error: ${snapshot.storageError ?? 'none'}`,
    `app: ${snapshot.appVersion} · commit: ${snapshot.commit}`,
    `device: ${snapshot.device}`,
  ].join('\n');
}

function formatPose(pose: RigidPose | null): string {
  if (!pose) return '—';
  const p = pose.position.map((v) => v.toFixed(3)).join(', ');
  const q = pose.quaternion.map((v) => v.toFixed(3)).join(', ');
  return `p[${p}] q[${q}]`;
}

export class DiagnosticsPanel {
  private readonly dialog: HTMLDialogElement;
  private readonly content: HTMLElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly log: DiagnosticsLog;
  private lastSnapshot: DiagnosticsSnapshot | null = null;

  constructor(
    dialog: HTMLDialogElement,
    content: HTMLElement,
    exportButton: HTMLButtonElement,
    closeButton: HTMLButtonElement,
    log: DiagnosticsLog,
  ) {
    this.dialog = dialog;
    this.content = content;
    this.exportButton = exportButton;
    this.closeButton = closeButton;
    this.log = log;

    this.exportButton.addEventListener('click', () => this.exportNow());
    this.closeButton.addEventListener('click', () => this.close());
  }

  open(snapshot: DiagnosticsSnapshot): void {
    this.lastSnapshot = snapshot;
    this.update(snapshot);
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  update(snapshot: DiagnosticsSnapshot): void {
    this.lastSnapshot = snapshot;
    if (!this.dialog.open) return;
    this.content.textContent = formatDiagnostics(snapshot);
  }

  exportNow(): void {
    const snapshot = this.lastSnapshot;
    const payload = {
      generatedAt: new Date().toISOString(),
      appVersion: snapshot?.appVersion ?? 'unknown',
      commit: snapshot?.commit ?? 'unknown',
      note: 'No camera frames, no personal data, no geolocation.',
      snapshot,
      log: this.log.all(),
    };
    triggerDownload(
      `room-factory-diagnostics-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  }

  getSnapshot(): DiagnosticsSnapshot | null {
    return this.lastSnapshot;
  }
}
