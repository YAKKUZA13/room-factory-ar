import { uiStrings } from './strings';

export type ScreenName =
  | 'start'
  | 'permission'
  | 'scanning'
  | 'binding'
  | 'relocalization'
  | 'recovery'
  | 'error';

export interface HudValues {
  credits: number;
  supply: number;
  demand: number;
  partsPerMinute: number;
  totalParts: number;
  brownout: boolean;
  paused: boolean;
}

export interface StartState {
  hasSave: boolean;
  summary: string;
  markerBound: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  extraLabel?: string;
  extraDefault?: boolean;
}

export interface ConfirmResult {
  confirmed: boolean;
  extra: boolean;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element #${id}`);
  return node as T;
}

const TEMPLATE = `
<section class="screen screen--start" data-screen="start">
  <div class="screen__texture" aria-hidden="true"></div>
  <div class="start-card">
    <div class="eyebrow">Niantic Spatial · 8th Wall XR Engine</div>
    <h1 class="logo" aria-label="Room Factory AR">
      <span class="logo__room">ROOM</span>
      <span class="logo__factory">FACTORY</span>
      <span class="logo__ar">AR</span>
    </h1>
    <p class="pitch">${uiStrings.pitch}</p>
    <p class="pitch pitch--small">${uiStrings.pitchLong}</p>

    <div id="continue-panel" class="continue-panel" hidden>
      <div id="save-summary" class="save-summary"></div>
      <div class="start-actions">
        <button id="btn-continue" class="btn btn--primary" data-testid="continue">${uiStrings.continue3d}</button>
        <button id="btn-continue-ar" class="btn" data-testid="continue-ar">${uiStrings.continueAr}</button>
      </div>
      <button id="btn-new-game" class="link link--danger" data-testid="new-game">${uiStrings.newGame}</button>
    </div>

    <div id="fresh-panel" class="start-actions">
      <button id="btn-start-ar" class="btn btn--primary btn--wide" data-testid="start-ar">${uiStrings.startAr}</button>
      <button id="btn-start-3d" class="btn btn--wide" data-testid="start-3d">${uiStrings.start3d}</button>
    </div>

    <div class="start-links">
      <button id="btn-how" class="link">${uiStrings.howItWorks}</button>
      <button id="btn-settings-start" class="link">${uiStrings.settings}</button>
      <button id="btn-about" class="link">${uiStrings.about}</button>
    </div>

    <footer class="start-footer">
      <span>Powered by 8th Wall</span>
      <span class="start-footer__sep">·</span>
      <span>XR Engine © 2026 Niantic Spatial</span>
    </footer>
  </div>
</section>

<section class="screen screen--sheet" data-screen="permission" hidden>
  <div class="sheet-card">
    <div class="sheet-card__icon" aria-hidden="true">◎</div>
    <h2>${uiStrings.permissionTitle}</h2>
    <p>${uiStrings.permissionText}</p>
    <ul class="bullet-list">
      <li>${uiStrings.permissionBullet1}</li>
      <li>${uiStrings.permissionBullet2}</li>
      <li>${uiStrings.permissionBullet3}</li>
    </ul>
    <div id="permission-status" class="status" role="status"></div>
    <div class="dialog-actions dialog-actions--stack">
      <button id="btn-permission-allow" class="btn btn--primary">${uiStrings.permissionAllow}</button>
      <button id="btn-permission-3d" class="btn">${uiStrings.start3d}</button>
      <button id="btn-permission-back" class="link">${uiStrings.back}</button>
    </div>
  </div>
</section>

<section class="screen screen--ar" data-screen="scanning" hidden>
  <div class="scan-top">
    <div id="scan-hint" class="scan-hint">${uiStrings.scanningHint}</div>
    <div class="scan-reticle" aria-hidden="true"></div>
  </div>
  <div class="placement-panel">
    <div class="control-row">
      <button id="scan-height-down" class="ctrl-btn" aria-label="${uiStrings.heightDown}">− ${uiStrings.heightDown}</button>
      <button id="scan-height-up" class="ctrl-btn" aria-label="${uiStrings.heightUp}">+ ${uiStrings.heightUp}</button>
      <button id="scan-rotate-left" class="ctrl-btn" aria-label="${uiStrings.rotateLeft}">⟲</button>
      <button id="scan-rotate-right" class="ctrl-btn" aria-label="${uiStrings.rotateRight}">⟳</button>
    </div>
    <label class="range-row" for="scan-scale">
      <span>${uiStrings.scale}</span>
      <input id="scan-scale" type="range" min="0.5" max="1" step="0.05" value="1" />
      <output id="scan-scale-value">1.0×</output>
    </label>
    <div class="control-row">
      <button id="scan-place" class="btn btn--primary" data-testid="scan-place">${uiStrings.placeFactory}</button>
      <button id="scan-3d" class="btn btn--ghost">${uiStrings.start3d}</button>
    </div>
    <p class="hint">${uiStrings.heightAdjustable}</p>
  </div>
</section>

<section class="screen screen--sheet" data-screen="binding" hidden>
  <div class="sheet-card">
    <h2>${uiStrings.bindingTitle}</h2>
    <p>${uiStrings.bindingIntro}</p>
    <ol class="steps">
      <li>${uiStrings.bindingStep1}</li>
      <li>${uiStrings.bindingStep2}</li>
      <li>${uiStrings.bindingStep3}</li>
    </ol>
    <div class="marker-preview">
      <img id="binding-marker-image" alt="Карточка ROOM FACTORY AR" loading="lazy" />
      <span>${uiStrings.markerInfo}</span>
    </div>
    <button id="btn-open-print" class="btn">${uiStrings.openPrintCard}</button>
    <div id="binding-status" class="status status--pulse">${uiStrings.bindingSearching}</div>
    <div class="dialog-actions">
      <button id="btn-binding-cancel" class="btn btn--ghost">${uiStrings.continueWithoutBinding}</button>
    </div>
  </div>
</section>

<section class="screen screen--sheet" data-screen="relocalization" hidden>
  <div class="sheet-card">
    <div class="sheet-card__icon" aria-hidden="true">⌖</div>
    <h2>${uiStrings.relocationTitle}</h2>
    <p>${uiStrings.relocationIntro}</p>
    <div id="reloc-status" class="status status--pulse">${uiStrings.relocationSearching}</div>
    <div class="dialog-actions dialog-actions--stack">
      <button id="btn-reloc-3d" class="btn">${uiStrings.start3d}</button>
      <button id="btn-reloc-temporary" class="btn">${uiStrings.relocationTemporary}</button>
      <button id="btn-reloc-help" class="link">${uiStrings.relocationHelp}</button>
    </div>
  </div>
</section>

<section class="screen screen--sheet" data-screen="recovery" hidden>
  <div class="sheet-card">
    <div class="sheet-card__icon sheet-card__icon--danger" aria-hidden="true">!</div>
    <h2>${uiStrings.saveCorrupt}</h2>
    <p>${uiStrings.saveCorruptBody}</p>
    <div class="dialog-actions dialog-actions--stack">
      <button id="btn-recovery-export" class="btn btn--primary">${uiStrings.exportRaw}</button>
      <button id="btn-recovery-restart" class="btn">${uiStrings.startOver}</button>
    </div>
  </div>
</section>

<section class="screen screen--sheet" data-screen="error" hidden>
  <div class="sheet-card">
    <div class="sheet-card__icon sheet-card__icon--danger" aria-hidden="true">!</div>
    <h2 id="error-title">${uiStrings.errorTitle}</h2>
    <p id="error-message">${uiStrings.errorGeneric}</p>
    <div class="dialog-actions dialog-actions--stack">
      <button id="btn-error-retry" class="btn btn--primary">${uiStrings.retry}</button>
      <button id="btn-error-3d" class="btn">${uiStrings.open3d}</button>
    </div>
  </div>
</section>

<div id="game-ui" class="game-ui" hidden>
  <header class="hud">
    <div class="hud__brand">ROOM&nbsp;FACTORY <span>AR</span></div>
    <div class="hud__stats">
      <div class="stat">
        <span class="stat__label">${uiStrings.credits}</span>
        <strong id="hud-credits" class="stat__value" data-testid="hud-credits">120</strong>
      </div>
      <div class="stat">
        <span class="stat__label">${uiStrings.energy}</span>
        <strong id="hud-energy" class="stat__value">0 / 0</strong>
      </div>
      <div class="stat stat--wide">
        <span class="stat__label">${uiStrings.production}</span>
        <strong id="hud-production" class="stat__value">0 / мин</strong>
      </div>
      <div class="stat stat--parts">
        <span class="stat__label">${uiStrings.parts}</span>
        <strong id="hud-parts" class="stat__value">0</strong>
      </div>
    </div>
    <div class="hud__actions">
      <button id="btn-pause" class="icon-btn" data-testid="btn-pause" aria-label="${uiStrings.pause}" title="${uiStrings.pause}">Ⅱ</button>
      <button id="btn-menu" class="icon-btn" data-testid="btn-menu" aria-label="${uiStrings.menuAria}" title="${uiStrings.menuAria}">☰</button>
    </div>
    <div id="energy-warning" class="energy-warning" hidden>${uiStrings.energyWarning}</div>
    <div id="tracking-badge" class="tracking-badge" hidden></div>
  </header>

  <div id="tutorial" class="tutorial" hidden>
    <div class="tutorial__head">
      <span class="eyebrow">${uiStrings.tutorialTitle}</span>
      <div id="tutorial-dots" class="tutorial__dots" aria-hidden="true"></div>
    </div>
    <p id="tutorial-text"></p>
  </div>

  <div id="ar-actions" class="ar-actions" hidden>
    <button id="btn-bind-now" class="btn btn--small" data-testid="bind-now">${uiStrings.bindMarker}</button>
    <span id="temporary-badge" class="badge" hidden>${uiStrings.relocationTemporaryBadge}</span>
  </div>

  <div id="toolbar-root" class="toolbar-root"></div>
  <aside id="inspector-root" class="inspector-root" aria-live="polite"></aside>
  <div id="placement-hint" class="placement-hint" hidden></div>
  <div class="desktop-hint">ЛКМ — вращение · колесо — масштаб · ПКМ — панорама · клик — действие</div>
</div>
<div id="mode-badge" class="mode-badge" hidden></div>

<dialog id="menu-dialog" class="dialog">
  <div class="dialog__head">
    <h2>${uiStrings.menuTitle}</h2>
    <button id="menu-close" class="icon-btn" aria-label="${uiStrings.close}">✕</button>
  </div>
  <div class="menu-list">
    <button id="menu-pause" class="menu-item">${uiStrings.pause}</button>
    <button id="menu-save" class="menu-item" data-testid="menu-save">${uiStrings.save}</button>
    <button id="menu-bind" class="menu-item">${uiStrings.bindMarker}</button>
    <button id="menu-grid" class="menu-item">${uiStrings.hideGrid}</button>
    <button id="menu-mode-3d" class="menu-item">${uiStrings.mode3d}</button>
    <button id="menu-mode-ar" class="menu-item">${uiStrings.startAr}</button>
    <button id="menu-export" class="menu-item" data-testid="menu-export">${uiStrings.exportJson}</button>
    <button id="menu-import" class="menu-item" data-testid="menu-import">${uiStrings.importJson}</button>
    <button id="menu-diagnostics" class="menu-item">${uiStrings.diagnostics}</button>
    <button id="menu-settings" class="menu-item">${uiStrings.settings}</button>
    <button id="menu-help" class="menu-item">${uiStrings.howItWorks}</button>
    <button id="menu-reset" class="menu-item menu-item--danger" data-testid="menu-reset">${uiStrings.resetFactory}</button>
    <button id="menu-about" class="menu-item">${uiStrings.about}</button>
  </div>
</dialog>

<input id="import-file" type="file" accept="application/json,.json" hidden />

<dialog id="settings-dialog" class="dialog">
  <div class="dialog__head">
    <h2>${uiStrings.settingsTitle}</h2>
    <button id="settings-close" class="icon-btn" aria-label="${uiStrings.close}">✕</button>
  </div>
  <label class="switch-row">
    <span>${uiStrings.settingsGrid}</span>
    <input id="settings-grid" type="checkbox" />
  </label>
  <label class="switch-row">
    <span>${uiStrings.settingsMuted}</span>
    <input id="settings-muted" type="checkbox" />
  </label>
  <label class="switch-row switch-row--select">
    <span>${uiStrings.settingsPerformance}</span>
    <select id="settings-performance">
      <option value="auto">${uiStrings.performanceAuto}</option>
      <option value="low">${uiStrings.performanceLow}</option>
      <option value="high">${uiStrings.performanceHigh}</option>
    </select>
  </label>
  <div class="switch-row switch-row--stack">
    <div class="switch-row__label">
      <span>${uiStrings.settingsScale}</span>
      <output id="settings-scale-value">1.00×</output>
    </div>
    <input id="settings-scale" type="range" min="0.5" max="1" step="0.05" value="1" />
    <p id="settings-scale-hint" class="hint">${uiStrings.scaleFree}</p>
  </div>
  <p class="hint">${uiStrings.settingsNote}</p>
</dialog>

<dialog id="help-dialog" class="dialog">
  <div class="dialog__head">
    <h2>${uiStrings.helpTitle}</h2>
    <button id="help-close" class="icon-btn" aria-label="${uiStrings.close}">✕</button>
  </div>
  <ol class="steps steps--help" id="help-steps"></ol>
  <p class="hint">${uiStrings.controlsHint}</p>
</dialog>

<dialog id="diagnostics-dialog" class="dialog dialog--wide">
  <div class="dialog__head">
    <h2>${uiStrings.diagnosticsTitle}</h2>
    <button id="diagnostics-close" class="icon-btn" aria-label="${uiStrings.close}">✕</button>
  </div>
  <pre id="diagnostics-content" class="diagnostics-pre">—</pre>
  <p class="hint">${uiStrings.diagnosticsNote}</p>
  <div class="dialog-actions">
    <button id="btn-diagnostics-export" class="btn">${uiStrings.exportDiagnostics}</button>
  </div>
</dialog>

<dialog id="about-dialog" class="dialog">
  <div class="dialog__head">
    <h2>${uiStrings.about}</h2>
    <button id="about-close" class="icon-btn" aria-label="${uiStrings.close}">✕</button>
  </div>
  <p>${uiStrings.aboutBody}</p>
  <dl class="about-grid">
    <dt>XR Engine</dt><dd>8th Wall · Niantic Spatial</dd>
    <dt>Рендер</dt><dd>Three.js</dd>
    <dt>Версия</dt><dd id="about-version">—</dd>
  </dl>
  <div class="dialog-actions dialog-actions--stack">
    <a class="btn" href="https://github.com/8thwall/engine/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${uiStrings.licenseLink}</a>
    <a id="about-print-link" class="btn" href="#" target="_blank" rel="noopener noreferrer">${uiStrings.markerLink}</a>
  </div>
</dialog>

<dialog id="confirm-dialog" class="dialog dialog--confirm">
  <div class="dialog__head">
    <h2 id="confirm-title">${uiStrings.confirm}</h2>
    <button id="confirm-x" class="icon-btn" aria-label="${uiStrings.close}">✕</button>
  </div>
  <p id="confirm-message"></p>
  <label id="confirm-extra-wrap" class="switch-row" hidden>
    <span id="confirm-extra-label"></span>
    <input id="confirm-extra" type="checkbox" />
  </label>
  <div class="dialog-actions">
    <button id="confirm-cancel" class="btn btn--ghost">${uiStrings.cancel}</button>
    <button id="confirm-ok" class="btn btn--primary">${uiStrings.confirm}</button>
  </div>
</dialog>
`;

export function mountScreensTemplate(root: HTMLElement): void {
  root.innerHTML = TEMPLATE;
}

export class Screens {
  readonly root: HTMLElement;
  readonly startAr = el<HTMLButtonElement>('btn-start-ar');
  readonly start3d = el<HTMLButtonElement>('btn-start-3d');
  readonly continue3d = el<HTMLButtonElement>('btn-continue');
  readonly continueAr = el<HTMLButtonElement>('btn-continue-ar');
  readonly newGame = el<HTMLButtonElement>('btn-new-game');
  readonly how = el<HTMLButtonElement>('btn-how');
  readonly settingsStart = el<HTMLButtonElement>('btn-settings-start');
  readonly about = el<HTMLButtonElement>('btn-about');
  readonly continuePanel = el<HTMLElement>('continue-panel');
  readonly freshPanel = el<HTMLElement>('fresh-panel');
  readonly saveSummary = el<HTMLElement>('save-summary');

  readonly permissionAllow = el<HTMLButtonElement>('btn-permission-allow');
  readonly permission3d = el<HTMLButtonElement>('btn-permission-3d');
  readonly permissionBack = el<HTMLButtonElement>('btn-permission-back');
  readonly permissionStatus = el<HTMLElement>('permission-status');

  readonly scanHint = el<HTMLElement>('scan-hint');
  readonly heightDown = el<HTMLButtonElement>('scan-height-down');
  readonly heightUp = el<HTMLButtonElement>('scan-height-up');
  readonly rotateLeft = el<HTMLButtonElement>('scan-rotate-left');
  readonly rotateRight = el<HTMLButtonElement>('scan-rotate-right');
  readonly scanScale = el<HTMLInputElement>('scan-scale');
  readonly scanScaleValue = el<HTMLOutputElement>('scan-scale-value');
  readonly place = el<HTMLButtonElement>('scan-place');
  readonly scan3d = el<HTMLButtonElement>('scan-3d');

  readonly bindingMarkerImage = el<HTMLImageElement>('binding-marker-image');
  readonly bindingStatus = el<HTMLElement>('binding-status');
  readonly bindingCancel = el<HTMLButtonElement>('btn-binding-cancel');
  readonly openPrint = el<HTMLButtonElement>('btn-open-print');

  readonly relocStatus = el<HTMLElement>('reloc-status');
  readonly reloc3d = el<HTMLButtonElement>('btn-reloc-3d');
  readonly relocTemporary = el<HTMLButtonElement>('btn-reloc-temporary');
  readonly relocHelp = el<HTMLButtonElement>('btn-reloc-help');

  readonly recoveryExport = el<HTMLButtonElement>('btn-recovery-export');
  readonly recoveryRestart = el<HTMLButtonElement>('btn-recovery-restart');

  readonly errorTitle = el<HTMLElement>('error-title');
  readonly errorMessage = el<HTMLElement>('error-message');
  readonly errorRetry = el<HTMLButtonElement>('btn-error-retry');
  readonly error3d = el<HTMLButtonElement>('btn-error-3d');

  readonly gameUi = el<HTMLElement>('game-ui');
  readonly hudCredits = el<HTMLElement>('hud-credits');
  readonly hudEnergy = el<HTMLElement>('hud-energy');
  readonly hudProduction = el<HTMLElement>('hud-production');
  readonly hudParts = el<HTMLElement>('hud-parts');
  readonly energyWarning = el<HTMLElement>('energy-warning');
  readonly trackingBadge = el<HTMLElement>('tracking-badge');
  readonly pauseButton = el<HTMLButtonElement>('btn-pause');
  readonly menuButton = el<HTMLButtonElement>('btn-menu');
  readonly tutorial = el<HTMLElement>('tutorial');
  readonly tutorialText = el<HTMLElement>('tutorial-text');
  readonly tutorialDots = el<HTMLElement>('tutorial-dots');
  readonly arActions = el<HTMLElement>('ar-actions');
  readonly bindNow = el<HTMLButtonElement>('btn-bind-now');
  readonly temporaryBadge = el<HTMLElement>('temporary-badge');
  readonly placementHint = el<HTMLElement>('placement-hint');
  readonly modeBadge = el<HTMLElement>('mode-badge');
  readonly desktopHint = document.querySelector<HTMLElement>('.desktop-hint');

  readonly menuDialog = el<HTMLDialogElement>('menu-dialog');
  readonly menuPause = el<HTMLButtonElement>('menu-pause');
  readonly menuSave = el<HTMLButtonElement>('menu-save');
  readonly menuBind = el<HTMLButtonElement>('menu-bind');
  readonly menuGrid = el<HTMLButtonElement>('menu-grid');
  readonly menuMode3d = el<HTMLButtonElement>('menu-mode-3d');
  readonly menuModeAr = el<HTMLButtonElement>('menu-mode-ar');
  readonly menuExport = el<HTMLButtonElement>('menu-export');
  readonly menuImport = el<HTMLButtonElement>('menu-import');
  readonly menuDiagnostics = el<HTMLButtonElement>('menu-diagnostics');
  readonly menuSettings = el<HTMLButtonElement>('menu-settings');
  readonly menuHelp = el<HTMLButtonElement>('menu-help');
  readonly menuReset = el<HTMLButtonElement>('menu-reset');
  readonly menuAbout = el<HTMLButtonElement>('menu-about');
  readonly menuClose = el<HTMLButtonElement>('menu-close');
  readonly importFile = el<HTMLInputElement>('import-file');

  readonly settingsDialog = el<HTMLDialogElement>('settings-dialog');
  readonly settingsGrid = el<HTMLInputElement>('settings-grid');
  readonly settingsMuted = el<HTMLInputElement>('settings-muted');
  readonly settingsPerformance = el<HTMLSelectElement>('settings-performance');
  readonly settingsScale = el<HTMLInputElement>('settings-scale');
  readonly settingsScaleValue = el<HTMLOutputElement>('settings-scale-value');
  readonly settingsScaleHint = el<HTMLElement>('settings-scale-hint');
  readonly settingsClose = el<HTMLButtonElement>('settings-close');

  readonly helpDialog = el<HTMLDialogElement>('help-dialog');
  readonly helpSteps = el<HTMLElement>('help-steps');
  readonly helpClose = el<HTMLButtonElement>('help-close');

  readonly diagnosticsDialog = el<HTMLDialogElement>('diagnostics-dialog');
  readonly diagnosticsContent = el<HTMLElement>('diagnostics-content');
  readonly diagnosticsExport = el<HTMLButtonElement>('btn-diagnostics-export');
  readonly diagnosticsClose = el<HTMLButtonElement>('diagnostics-close');

  readonly aboutDialog = el<HTMLDialogElement>('about-dialog');
  readonly aboutClose = el<HTMLButtonElement>('about-close');
  readonly aboutVersion = el<HTMLElement>('about-version');
  readonly aboutPrintLink = el<HTMLAnchorElement>('about-print-link');

  readonly confirmDialog = el<HTMLDialogElement>('confirm-dialog');
  readonly confirmTitle = el<HTMLElement>('confirm-title');
  readonly confirmMessage = el<HTMLElement>('confirm-message');
  readonly confirmExtraWrap = el<HTMLElement>('confirm-extra-wrap');
  readonly confirmExtraLabel = el<HTMLElement>('confirm-extra-label');
  readonly confirmExtra = el<HTMLInputElement>('confirm-extra');
  readonly confirmOk = el<HTMLButtonElement>('confirm-ok');
  readonly confirmCancel = el<HTMLButtonElement>('confirm-cancel');
  readonly confirmX = el<HTMLButtonElement>('confirm-x');

  private confirmResolver: ((result: ConfirmResult) => void) | null = null;
  private expectedCloseEvents = 0;
  private currentScreen: ScreenName = 'start';

  constructor(root: HTMLElement) {
    this.root = root;

    const base = import.meta.env.BASE_URL;
    this.bindingMarkerImage.src = `${base}marker/room-factory-marker_thumbnail.png`;
    this.bindingMarkerImage.onerror = () => {
      this.bindingMarkerImage.hidden = true;
    };
    this.aboutPrintLink.href = `${base}marker/room-factory-marker-print.html`;

    for (const text of uiStrings.helpBody) {
      const li = document.createElement('li');
      li.textContent = text;
      this.helpSteps.appendChild(li);
    }

    for (let i = 0; i < uiStrings.tutorial.length; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'tutorial__dot';
      this.tutorialDots.appendChild(dot);
    }

    this.confirmOk.addEventListener('click', () => this.resolveConfirm(true));
    this.confirmCancel.addEventListener('click', () => this.resolveConfirm(false));
    this.confirmX.addEventListener('click', () => this.resolveConfirm(false));
    this.confirmDialog.addEventListener('close', () => {
      // Ignore close events produced by resolveConfirm(); only a user/native
      // close (Esc/backdrop) without a pending expected close cancels the dialog.
      if (this.expectedCloseEvents > 0) {
        this.expectedCloseEvents -= 1;
        return;
      }
      const resolver = this.confirmResolver;
      this.confirmResolver = null;
      resolver?.({ confirmed: false, extra: this.confirmExtra.checked });
    });

    for (const dialog of this.allDialogs()) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }

    this.showScreen('start');
  }

  showScreen(name: ScreenName | null): void {
    for (const section of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      section.hidden = section.dataset.screen !== name;
    }
    if (name) this.currentScreen = name;
    document.body.classList.toggle('screen-open', name !== null);
  }

  getScreen(): ScreenName {
    return this.currentScreen;
  }

  showGame(visible: boolean): void {
    this.gameUi.hidden = !visible;
    document.body.classList.toggle('in-game', visible);
  }

  setStartState(state: StartState): void {
    this.continuePanel.hidden = !state.hasSave;
    this.freshPanel.hidden = state.hasSave;
    this.continueAr.hidden = false;
    this.saveSummary.textContent = state.summary;
  }

  setPermissionStatus(text: string, busy = false): void {
    this.permissionStatus.textContent = text;
    this.permissionStatus.classList.toggle('status--pulse', busy);
    this.permissionAllow.disabled = busy;
  }

  setBindingStatus(text: string, kind: 'pulse' | 'ok' | 'error' = 'pulse'): void {
    this.bindingStatus.textContent = text;
    this.bindingStatus.className = `status ${kind === 'pulse' ? 'status--pulse' : kind === 'ok' ? 'status--ok' : 'status--error'}`;
  }

  setRelocStatus(text: string, kind: 'pulse' | 'ok' | 'error' = 'pulse'): void {
    this.relocStatus.textContent = text;
    this.relocStatus.className = `status ${kind === 'pulse' ? 'status--pulse' : kind === 'ok' ? 'status--ok' : 'status--error'}`;
  }

  setScanHint(text: string): void {
    this.scanHint.textContent = text;
  }

  setScaleValue(value: number): void {
    this.scanScaleValue.textContent = `${value.toFixed(2)}×`;
  }

  setScanScaleEnabled(enabled: boolean): void {
    this.scanScale.disabled = !enabled;
  }

  setError(title: string, message: string): void {
    this.errorTitle.textContent = title;
    this.errorMessage.textContent = message;
  }

  setHud(values: HudValues): void {
    this.hudCredits.textContent = String(values.credits);
    this.hudEnergy.textContent = `${values.supply} / ${values.demand}`;
    this.hudProduction.textContent = `${values.partsPerMinute} / мин`;
    this.hudParts.textContent = String(values.totalParts);
    this.energyWarning.hidden = !values.brownout;
    this.pauseButton.textContent = values.paused ? '▶' : 'Ⅱ';
    this.pauseButton.setAttribute('aria-label', values.paused ? uiStrings.resume : uiStrings.pause);
  }

  setTrackingBadge(text: string | null, kind: 'warning' | 'error' | 'info' = 'warning'): void {
    if (!text) {
      this.trackingBadge.hidden = true;
      return;
    }
    this.trackingBadge.hidden = false;
    this.trackingBadge.textContent = text;
    this.trackingBadge.className = `tracking-badge tracking-badge--${kind}`;
  }

  setModeBadge(text: string | null): void {
    this.modeBadge.hidden = !text;
    this.modeBadge.textContent = text ?? '';
  }

  setTutorial(step: number, complete: boolean): void {
    this.tutorial.hidden = false;
    const dots = this.tutorialDots.querySelectorAll<HTMLElement>('.tutorial__dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('is-done', index < step || complete);
      dot.classList.toggle('is-current', index === step && !complete);
    });
    this.tutorialText.textContent = complete
      ? uiStrings.tutorialDone
      : uiStrings.tutorial[Math.min(step, uiStrings.tutorial.length - 1)] ?? '';
  }

  hideTutorial(): void {
    this.tutorial.hidden = true;
  }

  setArActions(visible: boolean, temporary: boolean): void {
    this.arActions.hidden = !visible;
    this.temporaryBadge.hidden = !temporary;
  }

  setPlacementHint(text: string | null): void {
    this.placementHint.hidden = !text;
    this.placementHint.textContent = text ?? '';
  }

  setDesktopHintVisible(visible: boolean): void {
    if (this.desktopHint) this.desktopHint.style.display = visible ? '' : 'none';
  }

  setMenuState(options: { paused: boolean; gridVisible: boolean; markerBound: boolean; inAr: boolean }): void {
    this.menuPause.textContent = options.paused ? uiStrings.resume : uiStrings.pause;
    this.menuGrid.textContent = options.gridVisible ? uiStrings.hideGrid : uiStrings.showGrid;
    this.menuBind.hidden = !options.markerBound && !options.inAr;
    this.menuBind.textContent = options.markerBound ? uiStrings.rebindMarker : uiStrings.bindMarker;
    this.menuMode3d.hidden = !options.inAr;
    this.menuModeAr.hidden = options.inAr;
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    this.pauseButton.setAttribute('aria-label', paused ? uiStrings.resume : uiStrings.pause);
    document.body.classList.toggle('is-paused', paused);
  }

  openDialog(dialog: HTMLDialogElement): void {
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
    dialog.addEventListener(
      'close',
      () => {
        if (!this.anyDialogOpen()) document.body.classList.remove('dialog-open');
      },
      { once: true },
    );
  }

  closeDialog(dialog: HTMLDialogElement): void {
    if (dialog.open) dialog.close();
  }

  confirm(options: ConfirmOptions): Promise<ConfirmResult> {
    if (this.confirmResolver) this.resolveConfirm(false);
    this.confirmTitle.textContent = options.title;
    this.confirmMessage.textContent = options.message;
    this.confirmOk.textContent = options.confirmLabel ?? uiStrings.confirm;
    this.confirmOk.classList.toggle('btn--danger', options.danger === true);
    const extraLabel = options.extraLabel;
    this.confirmExtraWrap.hidden = !extraLabel;
    this.confirmExtraLabel.textContent = extraLabel ?? '';
    this.confirmExtra.checked = options.extraDefault ?? false;
    this.openDialog(this.confirmDialog);
    return new Promise<ConfirmResult>((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  private resolveConfirm(confirmed: boolean): void {
    const resolver = this.confirmResolver;
    this.confirmResolver = null;
    if (this.confirmDialog.open) {
      this.expectedCloseEvents += 1;
      this.confirmDialog.close();
    }
    resolver?.({ confirmed, extra: this.confirmExtra.checked });
  }

  private allDialogs(): HTMLDialogElement[] {
    return [
      this.menuDialog,
      this.settingsDialog,
      this.helpDialog,
      this.diagnosticsDialog,
      this.aboutDialog,
      this.confirmDialog,
    ];
  }

  private anyDialogOpen(): boolean {
    return this.allDialogs().some((dialog) => dialog.open);
  }
}
