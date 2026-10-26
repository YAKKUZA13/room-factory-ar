import * as THREE from 'three';
import { AnchorManager } from '../ar/anchor-manager';
import { EightWallAdapter } from '../ar/eightwall-adapter';
import { MarkerPoseFilter, type FilterDecision } from '../ar/marker-pose-filter';
import { MockAdapter } from '../ar/mock-adapter';
import { PlacementController } from '../ar/placement-controller';
import type {
  AnchorState,
  MarkerObservation,
  MarkerStatus,
  RigidPose,
  SlamStatus,
  TrackingPort,
} from '../ar/tracking-port';
import {
  IDENTITY_POSE,
  angleErrorDegrees,
  translationErrorMeters,
} from '../ar/transforms';
import {
  AUTOSAVE_INTERVAL_MS,
  COMMAND_SAVE_DEBOUNCE_MS,
  MARKER_TARGET_NAME,
} from '../core/constants';
import { getEnergyStats } from '../core/economy';
import { buildOccupancy, cellKey, countItems } from '../core/grid';
import { createInitialFactoryState } from '../core/initial-world';
import { cloneFactoryState } from '../core/state';
import type {
  BuildingType,
  Direction,
  DomainError,
  FactoryCommand,
  FactoryState,
  GridPoint,
} from '../core/types';
import { FactoryEngine } from '../core/simulation';
import {
  createPersistedSave,
  defaultPreferences,
  defaultTutorialState,
  type PersistedSaveV1,
  type Preferences,
  type TutorialState,
} from '../persistence/migrations';
import { exportSaveFile, parseSaveImport, readFileAsText, triggerDownload } from '../persistence/import-export';
import { SaveRepository, createBrowserStorage, type LoadSaveResult } from '../persistence/save-repository';
import { FactoryRenderer } from '../render/factory-renderer';
import { Desktop3DViewer, type ViewerStats } from '../viewer/desktop-3d-viewer';
import { CanvasInputController } from './input-controller';
import { SimulationDriver, bindPageLifecycle, formatDeviceInfo, isLikelyMobile, supportsWebGL2 } from './lifecycle';
import { SessionMachine } from './session-machine';
import {
  APP_VERSION,
  COMMIT_HASH,
  FORCED_MODE,
  IS_DEBUG,
  IS_MOCK_AR,
  MOCK_ORIGIN_OFFSET,
  navigateTo3d,
} from '../config';
import { DiagnosticsLog, DiagnosticsPanel, type DiagnosticsSnapshot } from '../ui/diagnostics';
import { Inspector } from '../ui/inspector';
import { Notifications } from '../ui/notifications';
import { Screens } from '../ui/screens';
import { uiStrings } from '../ui/strings';
import { Toolbar, type EditTool } from '../ui/toolbar';

export interface AppControllerOptions {
  sceneCanvas: HTMLCanvasElement;
  canvasHost: HTMLElement;
  screens: Screens;
}

type AppMode = 'desktop' | 'ar' | 'mock';
type BindingMode = 'bind' | 'rebind';

interface DebugApi {
  getState(): FactoryState;
  getAnchor(): AnchorState;
  getWorldPose(): RigidPose | null;
  getDisplayPose(): RigidPose | null;
  getMode(): AppMode;
  getSession(): string;
  getMarkerStatus(): MarkerStatus;
  getMarkerPose(): RigidPose | null;
  getCellScreenPoint(x: number, z: number): { x: number; y: number } | null;
  dispatch(command: FactoryCommand): ReturnType<FactoryEngine['dispatch']>;
  save(): PersistedSaveV1;
  getSave(): PersistedSaveV1;
  getDiagnostics(): DiagnosticsSnapshot;
  setMarkerVisible(visible: boolean): void;
  setTracking(status: SlamStatus): void;
  getErrors(): readonly unknown[];
}

declare global {
  interface Window {
    __ROOM_FACTORY_DEBUG__?: DebugApi;
  }
}

export class AppController {
  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly canvasHost: HTMLElement;
  private readonly screens: Screens;
  private readonly notifications: Notifications;
  private readonly toolbar: Toolbar;
  private readonly inspector: Inspector;
  private readonly diagnosticsLog = new DiagnosticsLog();
  private readonly diagnosticsPanel: DiagnosticsPanel;
  private readonly simulation = new SimulationDriver();

  private engine!: FactoryEngine;
  private anchor!: AnchorManager;
  private readonly markerFilter = new MarkerPoseFilter(MARKER_TARGET_NAME);
  private readonly session: SessionMachine;
  private readonly placement = new PlacementController();
  private readonly factoryRenderer = new FactoryRenderer();
  private viewer: Desktop3DViewer | null = null;
  private adapter: TrackingPort | null = null;
  private mockAdapter: MockAdapter | null = null;
  private arInput: CanvasInputController | null = null;
  private arCanvas: HTMLCanvasElement | null = null;
  private arStarting = false;
  private arAttempt = 0;

  private repository: SaveRepository | null = null;
  private mode: AppMode = 'desktop';
  private mockMarkerOffsetActive = false;
  private tutorial: TutorialState = defaultTutorialState();
  private preferences: Preferences = defaultPreferences();
  private editTool: EditTool = { mode: 'inspect' };
  private placementRotation: Direction = 0;
  private selectedId: string | null = null;
  private hoverCell: GridPoint | null = null;
  private markerStatus: MarkerStatus = 'not-configured';
  private lastMarkerObservation: MarkerObservation | null = null;
  private bindingMode: BindingMode = 'bind';
  private bindingTimer = 0;
  private lastCorrectionAt = 0;
  private correctionDialogOpen = false;
  private lastLimitedAt = 0;
  private hasSave = false;
  private sessionStarted = false;
  private corruptRaw: string | null = null;
  private storageError: string | null = null;
  private storageWarned = false;
  private lastSaveSuccessISO: string | null = null;
  private lastPersistAt = 0;
  private lastSavedSimulationTime = -1;
  private lastAutosaveCheck = 0;
  private commandDirty = false;
  private anchorDirty = false;
  private tutorialDirty = false;
  private preferencesDirty = false;
  private saveTimer = 0;
  private tutorialHideTimer = 0;
  private productionTimes: number[] = [];
  private arFrameDeltas: number[] = [];
  private lastFrameTime = 0;
  private errorRetryAction: (() => void | Promise<void>) | null = null;
  private lastDiagnosticsAt = 0;
  private disposed = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly dragNdc = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane();
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragNormal = new THREE.Vector3(0, 1, 0);

  constructor(options: AppControllerOptions) {
    this.sceneCanvas = options.sceneCanvas;
    this.canvasHost = options.canvasHost;
    this.screens = options.screens;
    this.session = new SessionMachine((transition, accepted) => {
      this.diagnosticsLog.push(
        accepted ? 'info' : 'warn',
        'session',
        `${transition.from} -> ${transition.to}: ${transition.reason}`,
      );
    });

    const notificationsRoot = document.getElementById('notifications');
    if (!notificationsRoot) throw new Error('Missing #notifications');
    this.notifications = new Notifications(notificationsRoot);

    const toolbarRoot = document.getElementById('toolbar-root');
    const inspectorRoot = document.getElementById('inspector-root');
    if (!toolbarRoot || !inspectorRoot) throw new Error('Missing game UI roots');
    this.toolbar = new Toolbar(toolbarRoot, {
      onSelect: (type) => this.selectTool(type),
      onDeleteMode: () => this.selectDeleteMode(),
      onCancel: () => this.cancelTool(),
      onRotate: () => this.rotateAction(),
    });
    this.inspector = new Inspector(inspectorRoot, {
      onClose: () => this.selectBuilding(null),
      onDelete: (id) => void this.requestRemove(id),
      onToggle: (id, enabled) => this.dispatchCommand({ type: 'toggle', id, enabled }),
    });
    this.diagnosticsPanel = new DiagnosticsPanel(
      this.screens.diagnosticsDialog,
      this.screens.diagnosticsContent,
      this.screens.diagnosticsExport,
      this.screens.diagnosticsClose,
      this.diagnosticsLog,
    );

    this.loadInitialState();
    this.engine.subscribe((state) => this.onEngineState(state));
    this.wireUi();
    this.wireLifecycle();

    this.screens.aboutVersion.textContent = `${APP_VERSION} (${COMMIT_HASH})`;
    this.factoryRenderer.setReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    this.updateStartScreen();
    this.onEngineState(this.engine.state);
    if (this.tutorial.complete) this.screens.hideTutorial();
    this.syncChrome();
    this.exposeDebugApi();

    if (this.corruptRaw !== null) {
      this.showRecovery();
    } else if (FORCED_MODE === '3d') {
      window.setTimeout(() => this.startDesktop(), 30);
    }
    if (this.storageError && !this.storageWarned) {
      this.storageWarned = true;
      window.setTimeout(() => this.notifications.storageUnavailable(), 300);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.persistNow(false);
    this.viewer?.dispose();
    void this.adapter?.stop();
    this.arInput?.dispose();
    this.factoryRenderer.dispose();
    this.unbindPageLifecycle?.();
  }

  // ---------------------------------------------------------------- boot ----

  private loadInitialState(): void {
    const storage = createBrowserStorage();
    this.repository = new SaveRepository(storage);
    const loaded: LoadSaveResult = this.repository.load();
    let factory: FactoryState;
    let anchor: AnchorState = { kind: 'unbound' };

    if (loaded.status === 'ok') {
      factory = loaded.save.factory;
      anchor = loaded.save.anchor;
      this.tutorial = loaded.save.tutorial;
      this.preferences = loaded.save.preferences;
      this.hasSave = true;
      this.lastSaveSuccessISO = loaded.save.savedAtISO;
    } else {
      factory = createInitialFactoryState();
      this.tutorial = defaultTutorialState();
      this.preferences = defaultPreferences();
      if (loaded.status === 'corrupt') {
        this.corruptRaw = loaded.raw;
      } else if (loaded.status === 'unavailable') {
        this.storageError = loaded.error.message;
      }
    }

    this.engine = new FactoryEngine(factory);
    this.anchor = this.createAnchorManager(anchor);
    this.applyPreferences();
  }

  private createAnchorManager(state: AnchorState): AnchorManager {
    return new AnchorManager(state, {
      markerName: MARKER_TARGET_NAME,
      slamStatus: this.adapter?.getStatus() ?? 'unavailable',
      onAnchorChange: () => {
        this.anchorDirty = true;
        this.persistNow(false);
      },
    });
  }

  private replaceAnchor(state: AnchorState): void {
    this.anchor = this.createAnchorManager(state);
    this.anchor.setSlamStatus(this.adapter?.getStatus() ?? 'unavailable');
    this.anchorDirty = true;
    this.updateStartScreen();
  }

  private applyPreferences(): void {
    this.screens.settingsGrid.checked = this.preferences.showGrid;
    this.screens.settingsMuted.checked = this.preferences.muted;
    this.screens.settingsPerformance.value = this.preferences.performanceMode;
    this.factoryRenderer.setGridVisible(this.preferences.showGrid);
    this.viewer?.setPerformanceMode(this.preferences.performanceMode);
  }

  private wireLifecycle(): void {
    this.unbindPageLifecycle = bindPageLifecycle({
      onPersist: () => this.persistNow(false),
      onHidden: () => {
        this.simulation.reset();
        if (this.mode === 'desktop' || this.mode === 'mock') this.viewer?.stop();
        this.adapter?.pause?.();
      },
      onVisible: () => {
        this.simulation.reset();
        if (this.mode === 'desktop' || this.mode === 'mock') this.viewer?.start();
        this.adapter?.resume?.();
      },
    });
  }

  private unbindPageLifecycle: (() => void) | null = null;

  // ------------------------------------------------------------- UI wiring --

  private wireUi(): void {
    this.screens.start3d.addEventListener('click', () => this.startDesktop());
    this.screens.continue3d.addEventListener('click', () => this.startDesktop());
    this.screens.startAr.addEventListener('click', () => void this.startArFlow());
    this.screens.continueAr.addEventListener('click', () => void this.startArFlow());
    this.screens.newGame.addEventListener('click', () => void this.newGame());
    this.screens.how.addEventListener('click', () => this.screens.openDialog(this.screens.helpDialog));
    this.screens.settingsStart.addEventListener('click', () => this.openSettings());
    this.screens.about.addEventListener('click', () => this.screens.openDialog(this.screens.aboutDialog));

    this.screens.permissionAllow.addEventListener('click', () => void this.beginArSession());
    this.screens.permission3d.addEventListener('click', () => this.startDesktop());
    this.screens.permissionBack.addEventListener('click', () => this.showStartScreen());

    this.screens.heightDown.addEventListener('click', () => this.adjustPlacementHeight(-0.05));
    this.screens.heightUp.addEventListener('click', () => this.adjustPlacementHeight(0.05));
    this.screens.rotateLeft.addEventListener('click', () => this.rotatePlacement(-15));
    this.screens.rotateRight.addEventListener('click', () => this.rotatePlacement(15));
    this.screens.scanScale.addEventListener('input', () => {
      const value = Number(this.screens.scanScale.value);
      this.placement.setScale(value);
      this.screens.setScaleValue(value);
      this.updatePlacementPreview();
    });
    this.screens.place.addEventListener('click', () => void this.confirmFreePlacement());
    this.screens.scan3d.addEventListener('click', () => void this.go3d());

    this.screens.openPrint.addEventListener('click', () => {
      window.open(this.screens.aboutPrintLink.href, '_blank', 'noopener');
    });
    this.screens.bindingCancel.addEventListener('click', () => this.cancelBinding());

    this.screens.reloc3d.addEventListener('click', () => void this.go3d());
    this.screens.relocTemporary.addEventListener('click', () => void this.beginTemporaryPlacement());
    this.screens.relocHelp.addEventListener('click', () => this.screens.openDialog(this.screens.helpDialog));

    this.screens.recoveryExport.addEventListener('click', () => this.exportCorruptRaw());
    this.screens.recoveryRestart.addEventListener('click', () => this.recoverFreshStart());

    this.screens.errorRetry.addEventListener('click', () => {
      const action = this.errorRetryAction;
      if (action) void action();
    });
    this.screens.error3d.addEventListener('click', () => this.startDesktop());

    this.screens.pauseButton.addEventListener('click', () => this.togglePause());
    this.screens.menuButton.addEventListener('click', () => this.openMenu());
    this.screens.bindNow.addEventListener('click', () => this.startBinding(this.boundKind() ? 'rebind' : 'bind'));

    this.screens.menuClose.addEventListener('click', () => this.screens.closeDialog(this.screens.menuDialog));
    this.screens.menuPause.addEventListener('click', () => {
      this.togglePause();
      this.screens.closeDialog(this.screens.menuDialog);
    });
    this.screens.menuSave.addEventListener('click', () => {
      this.persistNow(true);
      this.screens.closeDialog(this.screens.menuDialog);
    });
    this.screens.menuBind.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      this.startBinding(this.boundKind() ? 'rebind' : 'bind');
    });
    this.screens.menuGrid.addEventListener('click', () => {
      this.preferences.showGrid = !this.preferences.showGrid;
      this.preferencesDirty = true;
      this.applyPreferences();
      this.scheduleSave();
      this.openMenu();
    });
    this.screens.menuMode3d.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      void this.go3d();
    });
    this.screens.menuModeAr.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      void this.startArFlow();
    });
    this.screens.menuExport.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      void this.exportCurrentSave();
    });
    this.screens.menuImport.addEventListener('click', () => {
      this.screens.importFile.value = '';
      this.screens.importFile.click();
    });
    this.screens.importFile.addEventListener('change', () => {
      const file = this.screens.importFile.files?.[0];
      if (file) void this.importFile(file);
    });
    this.screens.menuDiagnostics.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      this.openDiagnostics();
    });
    this.screens.menuSettings.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      this.openSettings();
    });
    this.screens.menuHelp.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      this.screens.openDialog(this.screens.helpDialog);
    });
    this.screens.menuReset.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      void this.resetFactory();
    });
    this.screens.menuAbout.addEventListener('click', () => {
      this.screens.closeDialog(this.screens.menuDialog);
      this.screens.openDialog(this.screens.aboutDialog);
    });

    this.screens.settingsClose.addEventListener('click', () => this.screens.closeDialog(this.screens.settingsDialog));
    this.screens.settingsGrid.addEventListener('change', () => {
      this.preferences.showGrid = this.screens.settingsGrid.checked;
      this.preferencesDirty = true;
      this.applyPreferences();
      this.scheduleSave();
    });
    this.screens.settingsMuted.addEventListener('change', () => {
      this.preferences.muted = this.screens.settingsMuted.checked;
      this.preferencesDirty = true;
      this.scheduleSave();
    });
    this.screens.settingsPerformance.addEventListener('change', () => {
      this.preferences.performanceMode = this.screens.settingsPerformance.value as Preferences['performanceMode'];
      this.preferencesDirty = true;
      this.applyPreferences();
      this.scheduleSave();
    });
    this.screens.settingsScale.addEventListener('input', () => {
      if (this.engine.state.buildings.length > 0) return;
      const scale = Number(this.screens.settingsScale.value);
      if (!Number.isFinite(scale)) return;
      this.engine.replaceState({
        ...cloneFactoryState(this.engine.state),
        cellSizeMeters: scale / 10,
      });
      this.factoryRenderer.setCellSize(this.engine.state.cellSizeMeters);
      this.commandDirty = true;
      this.syncScaleSetting();
      this.scheduleSave();
    });
    this.screens.helpClose.addEventListener('click', () => this.screens.closeDialog(this.screens.helpDialog));
    this.screens.aboutClose.addEventListener('click', () => this.screens.closeDialog(this.screens.aboutDialog));

    document.addEventListener('room-factory:export-request', () => {
      void this.exportCurrentSave();
    });
    document.addEventListener('keydown', this.handleKeydown);

    window.addEventListener('error', (event) => {
      this.diagnosticsLog.error('window', event.message, {
        file: event.filename,
        line: event.lineno,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      this.diagnosticsLog.error('promise', String(event.reason));
    });
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    ) {
      return;
    }
    if (event.key === 'Escape') {
      if (this.editTool.mode !== 'inspect') {
        this.cancelTool();
        event.preventDefault();
      }
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      this.rotateAction();
      event.preventDefault();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedId) {
        void this.requestRemove(this.selectedId);
        event.preventDefault();
      }
    }
  };

  // ------------------------------------------------------------ mode flow --

  private startDesktop(): void {
    if (this.corruptRaw !== null) {
      this.showRecovery();
      return;
    }
    if (this.mode === 'ar') {
      void this.go3d();
      return;
    }
    this.arAttempt += 1;
    this.arStarting = false;
    if (this.arCanvas) this.destroyArCanvas();
    this.clearHover();
    if (this.mode === 'mock') {
      void this.adapter?.stop();
      this.adapter = null;
      this.mockAdapter = null;
      this.arInput?.dispose();
      this.arInput = null;
    }
    this.mode = 'desktop';
    this.mockMarkerOffsetActive = false;
    this.sessionStarted = true;
    this.session.force('DESKTOP_3D', 'desktop mode');
    this.screens.showScreen(null);
    this.screens.showGame(true);
    this.screens.setArActions(false, false);
    this.screens.setTrackingBadge(null);
    this.screens.setModeBadge(null);
    this.screens.setDesktopHintVisible(true);
    this.screens.setPlacementHint(null);
    this.ensureViewer();
    this.viewer?.setControlsEnabled(true);
    this.viewer?.start();
    this.factoryRenderer.setCellSize(this.engine.state.cellSizeMeters);
    this.factoryRenderer.setWorldPose(IDENTITY_POSE);
    this.factoryRenderer.setPlacementPreview(null, true);
    this.factoryRenderer.setMarkerDebugPose(null);
    if (this.tutorial.complete) this.screens.hideTutorial();
    if (!this.tutorial.complete && this.tutorial.step === 0) {
      this.tutorial.step = 1;
      this.tutorialDirty = true;
    }
    this.syncChrome();
    this.onEngineState(this.engine.state);
    this.scheduleSave();
    this.simulation.reset();
    this.diagnosticsLog.info('mode', 'desktop 3D started');
  }

  private ensureViewer(): void {
    if (this.viewer) return;
    this.viewer = new Desktop3DViewer(this.sceneCanvas, this.factoryRenderer, {
      onFrame: (delta, elapsed) => this.onRenderFrame(delta, elapsed),
      onTap: (x, y) => this.handleCanvasTap(x, y),
      onHover: (x, y) => this.handleHover(x, y),
      onHoverEnd: () => this.clearHover(),
    });
    this.viewer.setPerformanceMode(this.preferences.performanceMode);
  }

  private async startArFlow(): Promise<void> {
    if (this.corruptRaw !== null) {
      this.showRecovery();
      return;
    }
    if (this.mode === 'ar' || this.mode === 'mock') return;
    if (IS_MOCK_AR) {
      await this.startMockAr();
      return;
    }
    if (!isLikelyMobile()) {
      this.session.force('UNSUPPORTED', 'desktop device');
      this.showError(uiStrings.unsupportedTitle, uiStrings.unsupportedText, () =>
        void this.startArFlow(),
      );
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !supportsWebGL2()) {
      this.session.force('UNSUPPORTED', 'missing camera or webgl2');
      this.showError(uiStrings.unsupportedTitle, uiStrings.unsupportedText, () =>
        void this.startArFlow(),
      );
      return;
    }
    this.screens.showGame(false);
    this.screens.showScreen('permission');
    this.screens.setDesktopHintVisible(false);
    this.screens.setPermissionStatus('');
    this.viewer?.stop();
    this.session.transition('PERMISSION_REQUIRED', 'camera permission screen');
  }

  private async beginArSession(): Promise<void> {
    if (this.mode === 'ar' || this.arStarting) return;
    this.arStarting = true;
    const attempt = ++this.arAttempt;
    this.sessionStarted = true;
    this.destroyArCanvas();
    this.screens.setPermissionStatus(uiStrings.launchingCamera, true);
    this.session.transition('INITIALIZING', 'camera start');
    this.viewer?.stop();
    this.viewer?.dispose();
    this.viewer = null;
    this.sceneCanvas.hidden = true;
    const canvas = document.createElement('canvas');
    canvas.id = 'ar-canvas';
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-label', 'AR камера');
    this.canvasHost.appendChild(canvas);
    this.arCanvas = canvas;

    const adapter = new EightWallAdapter({
      markerName: MARKER_TARGET_NAME,
      onLog: (level, message, data) => this.diagnosticsLog.push(level, 'xr8', message, data),
      onError: (error) => this.handleArRuntimeError(error),
    });
    this.adapter = adapter;
    this.subscribeAdapter(adapter);

    try {
      await adapter.start(canvas);
      if (attempt !== this.arAttempt) {
        await adapter.stop().catch(() => undefined);
        return;
      }
      this.mode = 'ar';
      const scene = adapter.getScene();
      if (!scene) throw new Error('XR scene is not ready');
      this.factoryRenderer.attach(scene);
      this.factoryRenderer.setCellSize(this.engine.state.cellSizeMeters);
      this.factoryRenderer.setWorldPose(null);
      this.screens.showScreen(null);
      this.screens.showGame(false);
      this.screens.setDesktopHintVisible(false);
      this.screens.setModeBadge(null);
      this.arInput = new CanvasInputController(canvas, {
        onTap: (x, y) => this.handleCanvasTap(x, y),
        onDragMove: (x, y) => this.dragPlacement(x, y),
      });
      this.setupAnchorSession();
      this.diagnosticsLog.info('ar', 'AR session ready');
    } catch (error) {
      if (attempt !== this.arAttempt) {
        await adapter.stop().catch(() => undefined);
        return;
      }
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.diagnosticsLog.error('ar', 'AR start failed', { message: normalized.message });
      await adapter.stop().catch(() => undefined);
      this.adapter = null;
      this.destroyArCanvas();
      this.sceneCanvas.hidden = false;
      const denied = /камер|permission|denied/i.test(normalized.message);
      this.session.force(denied ? 'CAMERA_DENIED' : 'ENGINE_ERROR', 'ar start failed');
      this.showError(
        denied ? uiStrings.cameraDeniedTitle : uiStrings.runtimeFailedTitle,
        normalized.message,
        () => void this.startArFlow(),
      );
    } finally {
      if (attempt === this.arAttempt) this.arStarting = false;
    }
  }

  private async startMockAr(): Promise<void> {
    this.arAttempt += 1;
    this.arStarting = false;
    this.destroyArCanvas();
    this.sceneCanvas.hidden = false;
    this.mode = 'mock';
    this.sessionStarted = true;
    this.mockMarkerOffsetActive = false;
    this.ensureViewer();
    this.screens.showGame(false);
    this.screens.showScreen(null);
    this.screens.setDesktopHintVisible(false);
    this.screens.setModeBadge(uiStrings.mockBadge);
    this.viewer?.setControlsEnabled(true);
    this.viewer?.start();
    this.factoryRenderer.setCellSize(this.engine.state.cellSizeMeters);
    this.factoryRenderer.setWorldPose(null);
    this.session.force('INITIALIZING', 'mock AR');
    const adapter = new MockAdapter({
      markerName: MARKER_TARGET_NAME,
      worldOffset: MOCK_ORIGIN_OFFSET,
    });
    this.adapter = adapter;
    this.mockAdapter = adapter;
    this.subscribeAdapter(adapter);
    try {
      await adapter.start(this.sceneCanvas);
      this.screens.showGame(false);
      this.setupAnchorSession();
      this.diagnosticsLog.info('mock', 'Mock AR session started');
    } catch (error) {
      this.diagnosticsLog.error('mock', 'Mock start failed', { error: String(error) });
      this.showError(uiStrings.errorTitle, uiStrings.errorGeneric, () => this.startDesktop());
    }
  }

  private subscribeAdapter(adapter: TrackingPort): void {
    adapter.onTrackingChange((status) => this.handleTrackingChange(status));
    adapter.onMarkerObservation((observation) => this.handleMarkerObservation(observation));
    adapter.onMarkerLost((name) => this.handleMarkerLost(name));
    adapter.onFrame((time) => {
      if (this.mode === 'ar') this.handleArFrame(time);
    });
  }

  private setupAnchorSession(): void {
    this.markerFilter.reset();
    this.markerStatus = this.anchor.getAnchor().kind === 'marker' ? 'scanning' : 'not-configured';
    if (this.anchor.getAnchor().kind === 'marker') {
      this.session.transition('NEEDS_RELOCALIZATION', 'saved marker anchor');
      this.beginRelocalization();
    } else {
      this.session.transition('SCANNING', 'unbound factory');
      this.beginFreePlacement(false);
    }
  }

  private async go3d(): Promise<void> {
    this.persistNow(false);
    if (this.mode === 'ar') {
      navigateTo3d();
      return;
    }
    if (this.mode === 'mock') {
      await this.adapter?.stop();
      this.adapter = null;
      this.mockAdapter = null;
      this.arInput?.dispose();
      this.arInput = null;
      this.mode = 'desktop';
      this.startDesktop();
      return;
    }
    this.screens.closeDialog(this.screens.menuDialog);
  }

  private showStartScreen(): void {
    this.arAttempt += 1;
    this.arStarting = false;
    this.destroyArCanvas();
    this.viewer?.stop();
    this.simulation.reset();
    this.screens.showScreen('start');
    this.screens.showGame(false);
    this.screens.setDesktopHintVisible(false);
    this.screens.setModeBadge(null);
    this.screens.setTrackingBadge(null);
    this.session.force('STARTING', 'home');
    this.updateStartScreen();
  }

  private showError(title: string, message: string, retry: () => void | Promise<void>): void {
    this.errorRetryAction = retry;
    this.screens.setError(title, message);
    this.screens.showGame(false);
    this.screens.showScreen('error');
  }

  private handleArRuntimeError(error: Error): void {
    if (this.session.current === 'ENGINE_ERROR' || this.mode === 'desktop') return;
    this.persistNow(false);
    this.session.force('ENGINE_ERROR', 'XR runtime error');
    void this.adapter?.stop();
    this.destroyArCanvas();
    this.showError(uiStrings.runtimeFailedTitle, error.message, () => window.location.reload());
  }

  // ------------------------------------------------------------ placement --

  private async beginFreePlacement(temporary: boolean): Promise<void> {
    const current = this.session.current;
    if (current === 'FREE_PLACEMENT') {
      // already previewing
    } else if (
      current === 'SCANNING' ||
      current === 'NEEDS_RELOCALIZATION' ||
      current === 'RELOCALIZING' ||
      current === 'TRACKING_LIMITED'
    ) {
      this.session.transition('FREE_PLACEMENT', 'free placement');
    } else {
      this.session.force('FREE_PLACEMENT', 'free placement');
    }
    this.anchor.beginFreePlacement();
    this.mockMarkerOffsetActive = false;
    this.clearHover();
    this.factoryRenderer.setWorldPose(null);
    this.factoryRenderer.setPlacementPreview(null, true);
    this.placement.reset();
    this.placement.setScale(
      this.engine.state.buildings.length === 0
        ? Math.min(1, Math.max(0.5, this.engine.state.cellSizeMeters / 0.1))
        : 1,
    );
    this.screens.showGame(false);
    this.screens.showScreen('scanning');
    this.screens.setDesktopHintVisible(false);
    this.screens.setScanHint(uiStrings.scanningHint);
    this.screens.setScanScaleEnabled(this.engine.state.buildings.length === 0);
    this.screens.setScaleValue(this.placement.getScale());
    this.screens.scanScale.value = String(this.placement.getScale());
    this.toolbar.setEnabled(false);
    this.screens.setArActions(false, false);
    this.arInput?.setDragEnabled(true);
    this.viewer?.setControlsEnabled(false);

    const camera = this.getActiveCamera();
    if (camera) {
      this.placement.setFromCamera(camera);
      this.updatePlacementPreview();
      const canvas = this.getActiveCanvas();
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const hit = await this.adapter?.tryHitTest(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        if (hit && this.session.current === 'FREE_PLACEMENT') {
          this.placement.setFromHitTest(hit, camera);
          this.updatePlacementPreview();
        }
      }
    }
    this.diagnosticsLog.info('placement', temporary ? 'temporary placement started' : 'free placement started');
  }

  private adjustPlacementHeight(delta: number): void {
    this.placement.adjustHeight(delta);
    this.updatePlacementPreview();
  }

  private rotatePlacement(delta: number): void {
    this.placement.rotateByDegrees(delta);
    this.updatePlacementPreview();
  }

  private updatePlacementPreview(): void {
    const pose = this.placement.getPose();
    if (!pose) return;
    this.factoryRenderer.setPlacementPreview(pose, true);
    if (this.engine.state.buildings.length === 0) {
      this.factoryRenderer.setCellSize(this.placement.getCellSize());
    }
  }

  private async confirmFreePlacement(): Promise<void> {
    if (this.mode !== 'desktop' && this.adapter?.getStatus() !== 'normal') {
      this.notifications.warning(uiStrings.arEditLocked);
      return;
    }
    const pose = this.placement.getPose();
    if (!pose) {
      this.notifications.warning(uiStrings.freePlacementLocked);
      return;
    }
    if (this.engine.state.buildings.length === 0) {
      const cellSize = this.placement.getCellSize();
      if (Math.abs(cellSize - this.engine.state.cellSizeMeters) > 1e-6) {
        this.engine.replaceState({
          ...cloneFactoryState(this.engine.state),
          cellSizeMeters: cellSize,
        });
      }
    }
    const temporary = this.anchor.getAnchor().kind === 'marker';
    if (temporary) {
      this.anchor.placeTemporarily(pose);
    } else {
      this.anchor.confirmFreePlacement(pose);
    }
    this.factoryRenderer.setPlacementPreview(null, true);
    this.mockMarkerOffsetActive = false;
    this.applyWorldPose(pose, false);
    this.session.transition('FREE_UNBOUND', 'factory placed');    if (!this.tutorial.complete && this.tutorial.step === 0) {
      this.tutorial.step = 1;
      this.tutorialDirty = true;
    }
    this.screens.showScreen(null);
    this.screens.showGame(true);
    this.screens.setScanHint(uiStrings.scanningHint);
    this.viewer?.setControlsEnabled(true);
    this.arInput?.setDragEnabled(false);
    this.syncChrome();
    this.syncHud(this.engine.state);
    if (this.tutorial.complete) this.screens.hideTutorial();
    else this.screens.setTutorial(this.tutorial.step, false);
    this.notifications.success(temporary ? uiStrings.temporarySaved : uiStrings.placed);
    this.persistNow(false);
    this.diagnosticsLog.info('placement', 'factory confirmed');
  }

  private async beginTemporaryPlacement(): Promise<void> {
    this.screens.setRelocStatus(uiStrings.relocationTemporary);
    await this.beginFreePlacement(true);
  }

  private dragPlacement(clientX: number, clientY: number): void {
    const pose = this.placement.getPose();
    const camera = this.getActiveCamera();
    const canvas = this.getActiveCanvas();
    if (!pose || !camera || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.dragNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.dragNdc, camera);
    this.dragPlane.setFromNormalAndCoplanarPoint(
      this.dragNormal,
      new THREE.Vector3(pose.position[0], pose.position[1], pose.position[2]),
    );
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);
    if (!hit) return;
    this.placement.setPosition(hit.x, pose.position[1], hit.z);
    this.updatePlacementPreview();
  }

  // -------------------------------------------------------------- binding --

  private startBinding(mode: BindingMode): void {
    if (this.mode === 'desktop') {
      this.notifications.info(uiStrings.bindAvailableInAr);
      return;
    }
    if (
      this.session.current !== 'FREE_UNBOUND' &&
      this.session.current !== 'BOUND_TRACKING'
    ) {
      this.notifications.warning(uiStrings.freePlacementLocked);
      return;
    }    this.bindingMode = mode;
    this.session.transition('BINDING', mode === 'rebind' ? 'rebind marker' : 'bind marker');
    this.markerFilter.reset();
    this.markerStatus = 'scanning';
    this.lastMarkerObservation = null;
    this.screens.setBindingStatus(uiStrings.bindingSearching, 'pulse');
    this.screens.showGame(false);
    this.screens.showScreen('binding');
    this.screens.setArActions(false, this.anchor.isTemporary());
    window.clearTimeout(this.bindingTimer);
    this.bindingTimer = window.setTimeout(() => {
      if (this.session.current === 'BINDING') {
        this.screens.setBindingStatus(uiStrings.bindingFailed, 'error');
      }
    }, 30_000);
    this.diagnosticsLog.info('binding', `started (${mode})`);
  }

  private cancelBinding(): void {
    window.clearTimeout(this.bindingTimer);
    const restoreBound = this.anchor.getAnchor().kind === 'marker';
    this.session.transition(restoreBound ? 'BOUND_TRACKING' : 'FREE_UNBOUND', 'binding cancelled');
    this.screens.showScreen(null);
    this.screens.showGame(true);
    this.screens.setArActions(true, this.anchor.isTemporary());
    this.markerStatus = this.markerFilter.getStatus();
    this.syncChrome();
  }

  private updateBindingDecision(decision: FilterDecision): void {
    if (this.session.current !== 'BINDING') return;
    if (!decision.accepted) {
      this.screens.setBindingStatus(uiStrings.bindingSearching, 'pulse');
      return;
    }
    if (decision.stable) {
      const observation = this.lastMarkerObservation;
      if (!observation) return;
      const result =
        this.bindingMode === 'rebind'
          ? this.anchor.rebindToMarker(observation)
          : this.anchor.bindToMarker(observation);
      if (result.ok) {
        window.clearTimeout(this.bindingTimer);
        this.markerStatus = 'stable';
        this.screens.setBindingStatus(uiStrings.bindingDone, 'ok');
        this.session.transition('BOUND_TRACKING', 'marker bound');
        this.mockMarkerOffsetActive = false;
        this.lastCorrectionAt = performance.now();
        this.notifications.success(uiStrings.bindingSaved);
        this.diagnosticsLog.info('binding', 'marker binding saved');
        window.setTimeout(() => {
          if (this.session.current === 'BOUND_TRACKING') {
            this.screens.showScreen(null);
            this.screens.showGame(true);
            this.screens.setArActions(true, this.anchor.isTemporary());
            this.syncChrome();
            this.syncHud(this.engine.state);
          }
        }, 750);
      } else {
        this.screens.setBindingStatus(result.error.message, 'error');
      }
      return;
    }
    this.screens.setBindingStatus(uiStrings.bindingStabilizing, 'pulse');
  }

  private async tryRestore(observation: MarkerObservation): Promise<void> {
    if (this.adapter?.getStatus() !== 'normal') {
      this.screens.setRelocStatus(uiStrings.trackingLimitedWait, 'pulse');
      return;
    }
    const result = this.anchor.restoreFromMarker(observation);
    if (!result.ok) {
      this.screens.setRelocStatus(result.error.message, 'error');
      return;
    }
    this.markerStatus = 'stable';
    this.session.transition('BOUND_TRACKING', 'marker restored');
    this.mockMarkerOffsetActive = true;
    this.applyWorldPose(result.value, true);
    this.screens.showScreen(null);
    this.screens.showGame(true);
    this.screens.setArActions(true, false);
    this.screens.setRelocStatus(uiStrings.relocationSuccess, 'ok');
    this.notifications.success(uiStrings.relocationSuccess);
    this.lastCorrectionAt = performance.now();
    this.syncChrome();
    this.syncHud(this.engine.state);
    this.diagnosticsLog.info('anchor', 'relocalized via stable marker');
  }

  private beginRelocalization(): void {
    if (this.session.current === 'NEEDS_RELOCALIZATION') {
      this.session.transition('RELOCALIZING', 'scan marker');
    } else if (this.session.current !== 'RELOCALIZING') {
      this.session.force('RELOCALIZING', 'scan marker');
    }
    this.anchor.requestRelocalization();
    this.markerFilter.reset();
    this.markerStatus = 'scanning';
    this.lastMarkerObservation = null;
    this.factoryRenderer.setWorldPose(null);
    this.factoryRenderer.setPlacementPreview(null, true);
    this.factoryRenderer.setMarkerDebugPose(null);
    this.screens.showGame(false);
    this.screens.showScreen('relocalization');
    this.screens.setRelocStatus(uiStrings.relocationSearching, 'pulse');
    this.screens.setDesktopHintVisible(false);
    this.arInput?.setDragEnabled(false);
    this.diagnosticsLog.info('anchor', 'relocalization started');
  }

  // -------------------------------------------------------------- markers --

  private handleMarkerObservation(observation: MarkerObservation): void {
    this.lastMarkerObservation = observation;
    if (IS_DEBUG) this.factoryRenderer.setMarkerDebugPose(observation.poseWorld);
    const current = this.session.current;
    if (
      current !== 'BINDING' &&
      current !== 'RELOCALIZING' &&
      current !== 'NEEDS_RELOCALIZATION' &&
      current !== 'BOUND_TRACKING'
    ) {
      return;
    }
    const decision = this.markerFilter.add(observation, performance.now());
    this.markerStatus = this.markerFilter.getStatus();
    if (current === 'BINDING') {
      this.updateBindingDecision(decision);
      return;
    }
    if (current === 'RELOCALIZING' || current === 'NEEDS_RELOCALIZATION') {
      if (decision.stable) {
        void this.tryRestore(observation);
      } else if (decision.accepted && decision.samples > 2) {
        this.screens.setRelocStatus('Стабилизируем измерения…', 'pulse');
      }
      return;
    }
    if (current === 'BOUND_TRACKING' && decision.stable) {
      if (this.adapter?.getStatus() === 'normal') this.screens.setTrackingBadge(null);
      void this.applyMarkerCorrection(observation);
    }
  }

  private handleMarkerLost(name: string): void {
    if (name !== MARKER_TARGET_NAME) return;
    this.markerStatus = 'lost';
    this.markerFilter.markLost();
    if (IS_DEBUG) this.factoryRenderer.setMarkerDebugPose(null);
    this.diagnosticsLog.info('marker', 'image target lost');
    if (this.session.current === 'BINDING') {
      this.screens.setBindingStatus(uiStrings.bindingSearching, 'pulse');
    } else if (this.session.current === 'RELOCALIZING') {
      this.screens.setRelocStatus(uiStrings.relocationSearching, 'pulse');
    } else if (this.session.current === 'BOUND_TRACKING') {
      this.screens.setTrackingBadge(uiStrings.markerLost, 'info');
      window.setTimeout(() => {
        if (this.session.current === 'BOUND_TRACKING' && this.markerFilter.getStatus() !== 'stable') {
          this.screens.setTrackingBadge(null);
        }
      }, 4000);
    }
  }

  private async applyMarkerCorrection(observation: MarkerObservation): Promise<void> {
    if (this.correctionDialogOpen) return;
    if (performance.now() - this.lastCorrectionAt < 900) return;
    this.lastCorrectionAt = performance.now();
    const correction = this.anchor.applyMarkerCorrection(observation);
    if (correction.requiresConfirmation) {
      this.correctionDialogOpen = true;
      this.screens.setTrackingBadge(uiStrings.correctionBadge, 'warning');
      this.syncChrome();
      const result = await this.screens.confirm({
        title: uiStrings.largeCorrectionTitle,
        message: uiStrings.largeCorrectionBody,
        confirmLabel: uiStrings.restoreBinding,
      });
      this.correctionDialogOpen = false;
      if (result.confirmed) {
        this.anchor.applyMarkerCorrection(observation, true);
        this.screens.setTrackingBadge(null);
      } else {
        this.screens.setTrackingBadge(uiStrings.relocationTemporaryBadge, 'warning');
      }
      this.syncChrome();
      return;
    }
    if (correction.applied) {
      this.diagnosticsLog.info('anchor', 'small marker correction applied', {
        meters: correction.translationMeters,
        degrees: correction.angleDegrees,
      });
    }
  }

  // ------------------------------------------------------------- tracking --

  private handleTrackingChange(status: SlamStatus): void {
    this.anchor.setSlamStatus(status);
    if (status === 'unavailable') return;
    this.diagnosticsLog.info('tracking', `SLAM ${status}`);
    if (status === 'limited') {
      this.lastLimitedAt = Date.now();
      this.screens.setTrackingBadge(uiStrings.trackingLimited, 'warning');
      if (
        this.session.current === 'BOUND_TRACKING' ||
        this.session.current === 'FREE_UNBOUND'
      ) {
        this.session.transition('TRACKING_LIMITED', 'slam limited');
      }
      this.syncChrome();
      return;
    }
    if (status === 'normal') {
      this.screens.setTrackingBadge(null);
      if (this.session.current === 'TRACKING_LIMITED') {
        const duration = this.lastLimitedAt ? Date.now() - this.lastLimitedAt : 0;
        if (this.anchor.getAnchor().kind === 'marker' && duration > 3000) {
          this.session.transition('NEEDS_RELOCALIZATION', 'world reference lost');
          this.beginRelocalization();
        } else if (this.anchor.getAnchor().kind === 'marker' && this.anchor.getWorldFactoryPose()) {
          this.session.transition('BOUND_TRACKING', 'slam recovered');
          this.screens.setTrackingBadge(uiStrings.trackingRecovered, 'info');
          window.setTimeout(() => this.screens.setTrackingBadge(null), 1600);
        } else if (this.anchor.getWorldFactoryPose()) {
          this.session.transition('FREE_UNBOUND', 'slam recovered');
        }
      }
      this.syncChrome();
      return;
    }
    if (status === 'lost') {
      this.screens.setTrackingBadge(uiStrings.trackingLost, 'error');
      if (this.anchor.getAnchor().kind === 'marker' && this.mode !== 'desktop') {
        this.session.transition('NEEDS_RELOCALIZATION', 'SLAM lost');
        this.beginRelocalization();
      } else if (this.anchor.getWorldFactoryPose()) {
        this.session.transition('TRACKING_LIMITED', 'SLAM lost');
      }
      this.syncChrome();
    }
  }

  // ---------------------------------------------------------- sim / frame --

  private handleArFrame(timeMs: number): void {
    if (this.mode !== 'ar') return;
    const delta = this.lastFrameTime > 0 ? Math.min(0.25, (timeMs - this.lastFrameTime) / 1000) : 0.016;
    this.lastFrameTime = timeMs;
    this.arFrameDeltas.push(delta);
    if (this.arFrameDeltas.length > 90) this.arFrameDeltas.shift();
    this.onRenderFrame(delta, timeMs / 1000);
  }

  private onRenderFrame(deltaSeconds: number, elapsedSeconds: number): void {
    if (document.hidden) {
      this.simulation.reset();
      return;
    }
    this.simulation.tick(deltaSeconds, this.engine);
    this.processSimulationEvents();
    if (this.mode !== 'desktop') {
      this.anchor.update(deltaSeconds);
      const displayPose = this.anchor.getDisplayFactoryPose();
      if (displayPose) this.applyWorldPose(displayPose);
    }
    this.factoryRenderer.updateVisuals(0, elapsedSeconds);
    this.maybeAutosave();
    this.maybeUpdateDiagnostics();
  }

  private processSimulationEvents(): void {
    const events = this.engine.consumeEvents();
    if (events.length === 0) return;
    for (const event of events) {
      if (event.type === 'part-sold') {
        this.productionTimes.push(event.at);
        this.factoryRenderer.flashSale(event.buildingId);
        if (event.totalPartsSold === 1) {
          this.diagnosticsLog.info('economy', 'first part sold');
        }
      }
    }
  }

  private onEngineState(state: Readonly<FactoryState>): void {
    this.factoryRenderer.updateFactory(state);
    this.syncHud(state);
    this.updateTutorial(state);
    this.syncInspector(state);
    this.screens.setPaused(state.isPaused);
    this.toolbar.update(state, this.editTool, this.placementRotation);
  }

  private syncHud(state: Readonly<FactoryState>): void {
    const energy = getEnergyStats(state);
    const limit = state.simulationTimeSeconds;
    this.productionTimes = this.productionTimes.filter((time) => time >= limit - 60);
    const windowSeconds = Math.max(1, Math.min(60, state.simulationTimeSeconds));
    const partsPerMinute =
      state.totalPartsSold > 0 ? Math.round((this.productionTimes.length * 60) / windowSeconds) : 0;
    this.screens.setHud({
      credits: state.credits,
      supply: energy.supply,
      demand: energy.demand,
      partsPerMinute,
      totalParts: state.totalPartsSold,
      brownout: energy.brownout,
      paused: state.isPaused,
    });
  }

  private syncInspector(state: Readonly<FactoryState>): void {
    if (!this.selectedId) {
      this.inspector.hide();
      return;
    }
    const building = state.buildings.find((item) => item.id === this.selectedId);
    if (!building) {
      this.selectedId = null;
      this.inspector.hide();
      this.factoryRenderer.setSelectedBuilding(null);
      return;
    }
    this.inspector.show(building, getEnergyStats(state).brownout);
    this.factoryRenderer.setSelectedBuilding(building.id);
  }

  private updateTutorial(state: Readonly<FactoryState>): void {
    if (this.tutorial.complete) {
      return;
    }
    let next = this.tutorial.step;
    if (state.buildings.some((b) => b.type === 'generator')) next = Math.max(next, 2);
    if (state.buildings.some((b) => b.type === 'extractor')) next = Math.max(next, 3);
    if (
      state.buildings.some((b) => b.type === 'processor') &&
      state.buildings.some((b) => b.type === 'conveyor')
    ) {
      next = Math.max(next, 4);
    }
    if (state.totalPartsSold >= 1) {
      this.tutorial = { step: 5, complete: true };
      this.tutorialDirty = true;
      this.screens.setTutorial(5, true);
      window.clearTimeout(this.tutorialHideTimer);
      this.tutorialHideTimer = window.setTimeout(() => this.screens.hideTutorial(), 6000);
      this.scheduleSave();
      return;
    }
    if (next !== this.tutorial.step) {
      this.tutorial.step = next;
      this.tutorialDirty = true;
      this.scheduleSave();
    }
    this.screens.setTutorial(this.tutorial.step, false);
  }

  private maybeAutosave(): void {
    const now = Date.now();
    if (now - this.lastAutosaveCheck < 1000) return;
    this.lastAutosaveCheck = now;
    if (now - this.lastPersistAt < AUTOSAVE_INTERVAL_MS) return;
    if (
      this.engine.state.simulationTimeSeconds !== this.lastSavedSimulationTime ||
      this.commandDirty ||
      this.anchorDirty ||
      this.tutorialDirty ||
      this.preferencesDirty
    ) {
      this.persistNow(false);
    }
  }

  private maybeUpdateDiagnostics(): void {
    if (!this.screens.diagnosticsDialog.open) return;
    const now = performance.now();
    if (now - this.lastDiagnosticsAt < 600) return;
    this.lastDiagnosticsAt = now;
    this.diagnosticsPanel.update(this.buildDiagnostics());
  }

  // ------------------------------------------------------------ edit tools --

  private selectTool(type: BuildingType): void {
    if (!this.canEdit()) {
      this.notifications.warning(uiStrings.arEditLocked);
      return;
    }
    this.editTool = { mode: 'place', buildingType: type, rotation: this.placementRotation };
    this.selectBuilding(null);
    this.screens.setPlacementHint(uiStrings.toolHint);
    if (this.hoverCell) {
      const occupied = buildOccupancy(this.engine.state.buildings).has(
        cellKey(this.hoverCell.x, this.hoverCell.z),
      );
      this.factoryRenderer.setHoverCell(this.hoverCell, !occupied);
      this.factoryRenderer.setBuildingGhost(
        type,
        this.hoverCell,
        this.placementRotation,
        !occupied,
      );
    }
    this.toolbar.update(this.engine.state, this.editTool, this.placementRotation);
    this.diagnosticsLog.info('edit', `tool place ${type}`);
  }

  private selectDeleteMode(): void {
    if (!this.canEdit()) {
      this.notifications.warning(uiStrings.arEditLocked);
      return;
    }
    this.editTool = { mode: 'delete' };
    this.selectBuilding(null);
    this.screens.setPlacementHint(uiStrings.deleteHint);
    this.clearHover();
    this.toolbar.update(this.engine.state, this.editTool, this.placementRotation);
  }

  private cancelTool(): void {
    this.editTool = { mode: 'inspect' };
    this.screens.setPlacementHint(null);
    this.clearHover();
    this.toolbar.update(this.engine.state, this.editTool, this.placementRotation);
  }

  private clearHover(): void {
    this.hoverCell = null;
    this.factoryRenderer.setHoverCell(null);
    this.factoryRenderer.setBuildingGhost(null, null, this.placementRotation, false);
  }

  private rotateAction(): void {
    if (this.editTool.mode === 'place') {
      this.placementRotation = ((this.placementRotation + 1) % 4) as Direction;
      this.editTool = {
        mode: 'place',
        buildingType: this.editTool.buildingType,
        rotation: this.placementRotation,
      };
      this.toolbar.update(this.engine.state, this.editTool, this.placementRotation);
      if (this.hoverCell) {
        const occupied = buildOccupancy(this.engine.state.buildings).has(
          cellKey(this.hoverCell.x, this.hoverCell.z),
        );
        this.factoryRenderer.setBuildingGhost(
          this.editTool.buildingType,
          this.hoverCell,
          this.placementRotation,
          !occupied,
        );
      }
      return;
    }
    if (this.selectedId) {
      this.dispatchCommand({ type: 'rotate', id: this.selectedId, clockwise: true });
    }
  }

  private selectBuilding(id: string | null): void {
    this.selectedId = id;
    if (!id) {
      this.inspector.hide();
      this.factoryRenderer.setSelectedBuilding(null);
      return;
    }
    const building = this.engine.state.buildings.find((item) => item.id === id);
    if (!building) {
      this.selectedId = null;
      this.inspector.hide();
      this.factoryRenderer.setSelectedBuilding(null);
      return;
    }
    this.clearHover();
    this.editTool = { mode: 'inspect' };
    this.screens.setPlacementHint(null);
    this.inspector.show(building, getEnergyStats(this.engine.state).brownout);
    this.factoryRenderer.setSelectedBuilding(id);
    this.toolbar.update(this.engine.state, this.editTool, this.placementRotation);
  }

  private handleCanvasTap(clientX: number, clientY: number): void {
    if (this.screens.gameUi.hidden) return;
    if (this.mode !== 'desktop' && !this.session.canEdit()) {
      this.notifications.warning(uiStrings.arEditLocked);
      return;
    }
    if (this.mode === 'desktop' && !this.canEdit()) return;
    const camera = this.getActiveCamera();
    const canvas = this.getActiveCanvas();
    if (!camera || !canvas) return;
    const viewport = canvas.getBoundingClientRect();

    if (this.editTool.mode === 'delete') {
      const id = this.factoryRenderer.pickBuilding(clientX, clientY, camera, viewport);
      if (id) void this.requestRemove(id);
      return;
    }
    if (this.editTool.mode === 'place') {
      const cell = this.factoryRenderer.pickCell(clientX, clientY, camera, viewport);
      if (!cell) {
        this.selectBuilding(null);
        return;
      }
      const occupancy = buildOccupancy(this.engine.state.buildings);
      if (occupancy.has(cellKey(cell.x, cell.z))) {
        this.notifications.warning(uiStrings.cellOccupied);
        return;
      }
      this.dispatchCommand({
        type: 'place',
        buildingType: this.editTool.buildingType,
        x: cell.x,
        z: cell.z,
        rotation: this.editTool.rotation,
      });
      this.clearHover();
      return;
    }
    const id = this.factoryRenderer.pickBuilding(clientX, clientY, camera, viewport);
    this.selectBuilding(id);
  }

  private handleHover(clientX: number, clientY: number): void {
    if (this.mode !== 'desktop') return;
    const camera = this.getActiveCamera();
    if (!camera) return;
    const viewport = this.sceneCanvas.getBoundingClientRect();
    if (this.editTool.mode === 'place') {
      const cell = this.factoryRenderer.pickCell(clientX, clientY, camera, viewport);
      if (!cell) {
        this.clearHover();
        return;
      }
      const occupied = buildOccupancy(this.engine.state.buildings).has(cellKey(cell.x, cell.z));
      this.hoverCell = cell;
      this.factoryRenderer.setHoverCell(cell, !occupied);
      this.factoryRenderer.setBuildingGhost(
        this.editTool.buildingType,
        cell,
        this.editTool.rotation,
        !occupied,
      );
      return;
    }
    if (this.editTool.mode === 'delete') {
      this.hoverCell = null;
      this.factoryRenderer.setBuildingGhost(null, null, this.placementRotation, false);
      const id = this.factoryRenderer.pickBuilding(clientX, clientY, camera, viewport);
      const building = id ? this.engine.state.buildings.find((b) => b.id === id) : null;
      if (building) this.factoryRenderer.setHoverCell({ x: building.x, z: building.z }, false);
      else this.factoryRenderer.setHoverCell(null);
      return;
    }
    this.clearHover();
  }

  private canEdit(): boolean {
    if (this.mode === 'desktop') return true;
    if (this.mode === 'ar' && this.adapter?.getStatus() !== 'normal') return false;
    return this.session.canEdit() && !this.correctionDialogOpen;
  }

  private dispatchCommand(command: FactoryCommand): boolean {
    const result = this.engine.dispatch(command);
    if (!result.ok) {
      this.notifications.error(this.localizedError(result.error));
      return false;
    }
    this.commandDirty = true;
    this.scheduleSave();
    this.syncChrome();
    return true;
  }

  private async requestRemove(id: string): Promise<void> {
    const building = this.engine.state.buildings.find((item) => item.id === id);
    if (!building) return;
    const needsConfirm =
      building.type === 'generator' || building.type === 'processor' || building.buffer.length > 0;
    if (needsConfirm) {
      const result = await this.screens.confirm({
        title: uiStrings.deleteTitle,
        message:
          building.purchaseSource === 'starter'
            ? uiStrings.deleteStarterBody
            : uiStrings.deleteBody,
        confirmLabel: uiStrings.deleteConfirm,
        danger: true,
      });
      if (!result.confirmed) return;
    }
    if (this.dispatchCommand({ type: 'remove', id })) {
      this.selectBuilding(null);
      this.notifications.info(uiStrings.removed);
    }
  }

  private togglePause(): void {
    const next = !this.engine.state.isPaused;
    this.dispatchCommand({ type: 'pause', paused: next });
    this.screens.setPaused(next);
    this.diagnosticsLog.info('simulation', next ? 'paused' : 'resumed');
  }

  // --------------------------------------------------------------- saving --

  private buildSave(): PersistedSaveV1 {
    return createPersistedSave(
      this.engine.state,
      this.anchor.getAnchor(),
      this.tutorial,
      this.preferences,
    );
  }

  private persistNow(manual: boolean): PersistedSaveV1 | null {
    if (!this.sessionStarted && !manual) return null;
    if (this.corruptRaw !== null && !this.hasSave) {
      if (manual) this.notifications.error(uiStrings.saveCorrupt);
      return null;
    }
    const repository = this.repository;
    if (!repository) return null;
    const save = this.buildSave();
    const result = repository.save(save);
    if (result.ok) {
      this.hasSave = true;
      this.lastSaveSuccessISO = save.savedAtISO;
      this.lastSavedSimulationTime = save.factory.simulationTimeSeconds;
      this.lastPersistAt = Date.now();
      this.commandDirty = false;
      this.anchorDirty = false;
      this.tutorialDirty = false;
      this.preferencesDirty = false;
      this.storageError = null;
      this.updateStartScreen();
      if (manual) this.notifications.success(uiStrings.saveOk);
      return save;
    }
    this.storageError = result.error.message;
    this.lastPersistAt = Date.now();
    this.diagnosticsLog.error('save', 'save failed', { message: result.error.message });
    if (manual) {
      this.notifications.error(uiStrings.saveError, {
        label: uiStrings.exportJson,
        onClick: () => {
          void this.exportCurrentSave();
        },
      });
    } else if (!this.storageWarned) {
      this.storageWarned = true;
      this.notifications.storageUnavailable();
    }
    return save;
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persistNow(false), COMMAND_SAVE_DEBOUNCE_MS);
  }

  private async exportCurrentSave(): Promise<void> {
    try {
      const result = await exportSaveFile(this.buildSave());
      this.notifications.success(
        result === 'shared' ? 'Файл передан через меню «Поделиться».' : 'JSON сохранения скачан.',
      );
    } catch (error) {
      this.notifications.error(`${uiStrings.saveError}: ${String(error)}`);
    }
  }

  private async importFile(file: File): Promise<void> {
    const textResult = await readFileAsText(file);
    if (!textResult.ok) {
      this.notifications.error(textResult.error.message);
      return;
    }
    const parsed = parseSaveImport(textResult.value);
    if (!parsed.ok) {
      this.notifications.error(`${uiStrings.importError}: ${parsed.error.message}`);
      return;
    }
    const confirm = await this.screens.confirm({
      title: uiStrings.importTitle,
      message: uiStrings.importWarning,
      confirmLabel: uiStrings.importJson,
      danger: true,
    });
    if (!confirm.confirmed) return;
    this.applyImportedSave(parsed.value);
    this.screens.closeDialog(this.screens.menuDialog);
    this.notifications.success(uiStrings.importOk);
  }

  private applyImportedSave(save: PersistedSaveV1): void {
    this.engine.replaceState(save.factory);
    this.replaceAnchor(save.anchor);
    this.tutorial = save.tutorial;
    this.preferences = { ...save.preferences };
    this.applyPreferences();
    this.selectedId = null;
    this.editTool = { mode: 'inspect' };
    this.factoryRenderer.setSelectedBuilding(null);
    this.factoryRenderer.setPlacementPreview(null, true);
    this.factoryRenderer.setCellSize(save.factory.cellSizeMeters);
    this.tutorialDirty = true;
    this.preferencesDirty = true;
    this.updateStartScreen();
    if (this.mode === 'desktop') {
      this.factoryRenderer.setWorldPose(IDENTITY_POSE);
      this.screens.showScreen(null);
      this.screens.showGame(true);
    } else {
      this.markerFilter.reset();
      this.lastMarkerObservation = null;
      if (save.anchor.kind === 'marker') {
        this.session.force('NEEDS_RELOCALIZATION', 'imported marker anchor');
        this.beginRelocalization();
      } else {
        this.session.force('SCANNING', 'imported unbound factory');
        void this.beginFreePlacement(false);
      }
    }
    this.persistNow(false);
    this.syncChrome();
    this.onEngineState(this.engine.state);
  }

  // --------------------------------------------------------------- menus ----

  private openMenu(): void {
    const inAr = this.mode !== 'desktop';
    this.screens.setMenuState({
      paused: this.engine.state.isPaused,
      gridVisible: this.preferences.showGrid,
      markerBound: this.anchor.getAnchor().kind === 'marker',
      inAr,
    });
    this.screens.menuBind.hidden = !inAr;
    this.screens.menuMode3d.hidden = !inAr;
    this.screens.menuModeAr.hidden = inAr;
    this.screens.openDialog(this.screens.menuDialog);
  }

  private openSettings(): void {
    this.screens.settingsGrid.checked = this.preferences.showGrid;
    this.screens.settingsMuted.checked = this.preferences.muted;
    this.screens.settingsPerformance.value = this.preferences.performanceMode;
    this.syncScaleSetting();
    this.screens.openDialog(this.screens.settingsDialog);
  }

  private syncScaleSetting(): void {
    const scale = this.engine.state.cellSizeMeters / 0.1;
    const locked = this.engine.state.buildings.length > 0;
    this.screens.settingsScale.value = String(scale);
    this.screens.settingsScaleValue.textContent = `${scale.toFixed(2)}×`;
    this.screens.settingsScale.disabled = locked;
    this.screens.settingsScaleHint.textContent = locked
      ? uiStrings.scaleLocked
      : uiStrings.scaleFree;
  }

  private openDiagnostics(): void {
    this.lastDiagnosticsAt = 0;
    this.diagnosticsPanel.open(this.buildDiagnostics());
  }

  private async newGame(): Promise<void> {
    const result = await this.screens.confirm({
      title: uiStrings.newGameTitle,
      message: uiStrings.newGameBody,
      confirmLabel: uiStrings.newGame,
      danger: true,
    });
    if (!result.confirmed) return;
    this.engine.replaceState(createInitialFactoryState());
    this.replaceAnchor({ kind: 'unbound' });
    this.tutorial = defaultTutorialState();
    this.tutorial.step = 1;
    this.tutorialDirty = true;
    this.selectedId = null;
    this.editTool = { mode: 'inspect' };
    this.factoryRenderer.setSelectedBuilding(null);
    this.factoryRenderer.setPlacementPreview(null, true);
    this.persistNow(false);
    this.startDesktop();
  }

  private async resetFactory(): Promise<void> {
    const result = await this.screens.confirm({
      title: uiStrings.resetTitle,
      message: uiStrings.resetBody,
      confirmLabel: uiStrings.resetFactory,
      danger: true,
      extraLabel: uiStrings.resetAnchor,
    });
    if (!result.confirmed) return;
    this.engine.dispatch({ type: 'reset-factory' });
    if (result.extra) {
      const currentPose = this.anchor.getWorldFactoryPose();
      this.replaceAnchor({ kind: 'unbound' });
      if (this.mode !== 'desktop' && currentPose) {
        this.anchor.confirmFreePlacement(currentPose);
        this.session.force('FREE_UNBOUND', 'anchor reset');
      }
    }
    this.tutorial = defaultTutorialState();
    if (
      this.mode === 'desktop' ||
      this.session.current === 'FREE_UNBOUND' ||
      this.session.current === 'BOUND_TRACKING'
    ) {
      this.tutorial.step = 1;
    }
    this.tutorialDirty = true;
    this.selectedId = null;
    this.editTool = { mode: 'inspect' };
    this.factoryRenderer.setSelectedBuilding(null);
    this.factoryRenderer.setPlacementPreview(null, true);
    if (this.mode === 'desktop') {
      this.factoryRenderer.setWorldPose(IDENTITY_POSE);
    } else if (result.extra) {
      this.applyWorldPose(this.anchor.getDisplayFactoryPose());
    }
    this.persistNow(false);
    this.syncChrome();
    this.onEngineState(this.engine.state);
    this.notifications.success(uiStrings.resetOk);
    this.diagnosticsLog.info('factory', 'reset');
  }

  // --------------------------------------------------------------- recovery -

  private showRecovery(): void {
    this.screens.showGame(false);
    this.screens.showScreen('recovery');
    this.screens.setDesktopHintVisible(false);
    this.session.force('ENGINE_ERROR', 'corrupt save');
    this.diagnosticsLog.error('save', 'corrupt save detected');
  }

  private exportCorruptRaw(): void {
    const raw = this.corruptRaw ?? this.repository?.readRaw() ?? '';
    triggerDownload(
      `room-factory-corrupt-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`,
      raw,
    );
  }

  private recoverFreshStart(): void {
    this.repository?.clear();
    const fresh = createInitialFactoryState();
    this.engine.replaceState(fresh);
    this.replaceAnchor({ kind: 'unbound' });
    this.tutorial = defaultTutorialState();
    this.tutorial.step = 1;
    this.tutorialDirty = true;
    this.preferences = defaultPreferences();
    this.corruptRaw = null;
    this.storageError = null;
    this.hasSave = true;
    this.applyPreferences();
    this.persistNow(false);
    this.showStartScreen();
    this.notifications.success(uiStrings.startOver);
  }

  // --------------------------------------------------------------- helpers --

  private getActiveCamera(): THREE.Camera | null {
    if (this.mode === 'ar') return this.adapter?.getCamera() ?? null;
    return this.viewer?.getCamera() ?? null;
  }

  private applyWorldPose(pose: RigidPose | null, markerRelative = this.mockMarkerOffsetActive): void {
    if (!pose) {
      this.factoryRenderer.setWorldPose(null);
      return;
    }
    if (this.mode === 'mock' && markerRelative) {
      const [ox, oy, oz] = MOCK_ORIGIN_OFFSET;
      this.factoryRenderer.setWorldPose({
        position: [pose.position[0] - ox, pose.position[1] - oy, pose.position[2] - oz],
        quaternion: pose.quaternion,
      });
      return;
    }
    this.factoryRenderer.setWorldPose(pose);
  }

  private getActiveCanvas(): HTMLCanvasElement | null {
    if (this.mode === 'ar') return this.arCanvas;
    return this.sceneCanvas;
  }

  private boundKind(): boolean {
    return this.anchor.getAnchor().kind === 'marker';
  }

  private syncChrome(): void {
    const editAllowed = this.canEdit();
    this.toolbar.setEnabled(editAllowed);
    const placed =
      this.mode === 'desktop' ||
      this.session.current === 'FREE_UNBOUND' ||
      this.session.current === 'BOUND_TRACKING' ||
      this.session.current === 'TRACKING_LIMITED';
    this.screens.setArActions(this.mode !== 'desktop' && placed, this.anchor.isTemporary());
    this.screens.bindNow.disabled = !editAllowed;
    this.screens.bindNow.textContent = this.boundKind()
      ? uiStrings.rebindMarker
      : uiStrings.bindMarker;
    this.screens.setModeBadge(this.mode === 'mock' ? uiStrings.mockBadge : null);
    this.screens.setDesktopHintVisible(this.mode === 'desktop');
    this.screens.setPlacementHint(
      this.editTool.mode === 'place'
        ? uiStrings.toolHint
        : this.editTool.mode === 'delete'
          ? uiStrings.deleteHint
          : null,
    );
    if (!editAllowed && this.mode !== 'desktop' && this.session.current === 'TRACKING_LIMITED') {
      this.screens.setTrackingBadge(uiStrings.trackingLimitedHint, 'warning');
    }
  }

  private updateStartScreen(): void {
    const bound = this.anchor?.getAnchor().kind === 'marker';
    const state = this.engine?.state;
    this.screens.setStartState({
      hasSave: this.hasSave,
      summary: state
        ? uiStrings.saveSummary(state.buildings.length, state.credits, bound)
        : '',
      markerBound: bound,
    });
  }

  private localizedError(error: DomainError): string {
    switch (error.code) {
      case 'occupied':
        return uiStrings.cellOccupied;
      case 'insufficient-credits':
        return uiStrings.notEnoughCredits;
      case 'out-of-bounds':
        return 'Клетка вне сетки.';
      case 'building-not-found':
        return 'Здание не найдено.';
      case 'slam-not-tracking':
        return uiStrings.arEditLocked;
      case 'storage-unavailable':
        return uiStrings.storageUnavailable;
      default:
        return error.message;
    }
  }

  private destroyArCanvas(): void {
    this.arInput?.dispose();
    this.arInput = null;
    if (this.arCanvas) {
      this.arCanvas.remove();
      this.arCanvas = null;
    }
    this.sceneCanvas.hidden = false;
  }

  // ------------------------------------------------------------ diagnostics -

  private buildDiagnostics(): DiagnosticsSnapshot {
    const state = this.engine.state;
    const energy = getEnergyStats(state);
    const adapter = this.adapter;
    const isEightWall = adapter instanceof EightWallAdapter;
    const viewerStats: ViewerStats | null = this.viewer?.getStats() ?? null;
    const renderStats =
      isEightWall && this.mode === 'ar'
        ? (adapter as EightWallAdapter).getRenderStats()
        : { drawCalls: viewerStats?.drawCalls ?? 0, triangles: viewerStats?.triangles ?? 0 };
    const fps =
      this.mode === 'ar'
        ? this.getArFps()
        : viewerStats?.fps ?? 0;
    const anchorState = this.anchor.getAnchor();
    const markerToFactory =
      anchorState.kind === 'marker' ? anchorState.markerToFactory : null;
    let poseTranslationErrorMeters: number | null = null;
    let poseAngleErrorDegrees: number | null = null;
    if (this.lastMarkerObservation && anchorState.kind === 'marker') {
      const expected = this.anchor.computeMarkerTarget(this.lastMarkerObservation);
      const current = this.anchor.getWorldFactoryPose();
      if (expected.ok && current) {
        poseTranslationErrorMeters = translationErrorMeters(current, expected.value);
        poseAngleErrorDegrees = angleErrorDegrees(current, expected.value);
      }
    }
    const modeLabel =
      this.mode === 'ar' ? 'AR' : this.mode === 'mock' ? 'mock' : 'desktop 3D';
    return {
      mode: modeLabel,
      sdkState:
        this.mode === 'mock'
          ? 'mock'
          : this.mode === 'ar'
            ? 'ready'
            : 'unloaded',
      sdkVersion: isEightWall ? (adapter as EightWallAdapter).getSdkVersion() : '',
      camera:
        this.mode === 'mock'
          ? 'mock'
          : isEightWall
            ? (adapter as EightWallAdapter).getCameraStatus()
            : 'unavailable',
      slam: adapter?.getStatus() ?? 'unavailable',
      markerName: MARKER_TARGET_NAME,
      markerStatus: this.markerStatus,
      anchor: this.anchor.getAnchor(),
      markerToFactory,
      worldPose: this.anchor.getDisplayFactoryPose(),
      poseTranslationErrorMeters,
      poseAngleErrorDegrees,
      fps,
      frameTimeP95: viewerStats?.frameTimeP95 ?? this.getArFrameP95(),
      drawCalls: renderStats.drawCalls,
      triangles: renderStats.triangles,
      visibleMeshes: this.factoryRenderer.getStats().meshes,
      buildings: state.buildings.length,
      activeItems: countItems(state),
      productionPerMinute: Math.round(
        (this.productionTimes.length * 60) / Math.max(1, Math.min(60, state.simulationTimeSeconds)),
      ),
      saveLastSuccessISO: this.lastSaveSuccessISO,
      saveSchemaVersion: state.schemaVersion,
      storageError: this.storageError,
      appVersion: APP_VERSION,
      commit: COMMIT_HASH,
      device: formatDeviceInfo(),
      factory: cloneFactoryState(state),
      extra: {
        energySupply: energy.supply,
        energyDemand: energy.demand,
        brownout: energy.brownout,
        session: this.session.current,
        bindings: this.areaCounts(state),
      },
    };
  }

  private areaCounts(state: Readonly<FactoryState>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const building of state.buildings) {
      counts[building.type] = (counts[building.type] ?? 0) + 1;
    }
    return counts;
  }

  private getArFps(): number {
    if (this.arFrameDeltas.length === 0) return 0;
    const sum = this.arFrameDeltas.reduce((total, delta) => total + delta, 0);
    return sum > 0 ? this.arFrameDeltas.length / sum : 0;
  }

  private getArFrameP95(): number {
    if (this.arFrameDeltas.length === 0) return 0;
    const sorted = [...this.arFrameDeltas].map((d) => d * 1000).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  }

  // -------------------------------------------------------------- debug API -

  private exposeDebugApi(): void {
    if (!IS_DEBUG && !IS_MOCK_AR) return;
    const api: DebugApi = {
      getState: () => cloneFactoryState(this.engine.state),
      getAnchor: () => this.anchor.getAnchor(),
      getWorldPose: () => this.anchor.getWorldFactoryPose(),
      getDisplayPose: () => this.anchor.getDisplayFactoryPose(),
      getMode: () => this.mode,
      getSession: () => this.session.current,
      getMarkerStatus: () => this.markerStatus,
      getMarkerPose: () =>
        this.lastMarkerObservation?.poseWorld ?? this.mockAdapter?.getMarkerPose() ?? null,
      getCellScreenPoint: (x, z) => {
        const camera = this.getActiveCamera();
        const canvas = this.getActiveCanvas();
        if (!camera || !canvas) return null;
        return this.factoryRenderer.getCellScreenPoint(x, z, camera, canvas.getBoundingClientRect());
      },
      dispatch: (command) => this.engine.dispatch(command),
      save: () => this.buildSave(),
      getSave: () => this.buildSave(),
      getDiagnostics: () => this.buildDiagnostics(),
      setMarkerVisible: (visible) => this.mockAdapter?.setMarkerVisible(visible),
      setTracking: (status) => {
        this.mockAdapter?.setTrackingStatus(status);
      },
      getErrors: () => this.diagnosticsLog.all().filter((entry) => entry.level === 'error'),
    };
    window.__ROOM_FACTORY_DEBUG__ = api;
  }
}
