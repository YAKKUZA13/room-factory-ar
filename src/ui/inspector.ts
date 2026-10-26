import { BUILDING_SPECS, DIRECTION_LABELS } from '../core/constants';
import type { Building } from '../core/types';
import { uiStrings } from './strings';

export interface InspectorCallbacks {
  onClose(): void;
  onDelete(id: string): void;
  onToggle(id: string, enabled: boolean): void;
}

export class Inspector {
  private readonly root: HTMLElement;
  private readonly callbacks: InspectorCallbacks;
  private readonly typeEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly directionEl: HTMLElement;
  private readonly bufferEl: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private currentId: string | null = null;

  constructor(root: HTMLElement, callbacks: InspectorCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    root.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'inspector';

    const head = document.createElement('div');
    head.className = 'inspector__head';
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = uiStrings.selected;
    this.typeEl = document.createElement('h3');
    titleWrap.append(eyebrow, this.typeEl);
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'icon-btn';
    this.closeButton.setAttribute('aria-label', uiStrings.close);
    this.closeButton.textContent = '✕';
    this.closeButton.addEventListener('click', () => this.callbacks.onClose());
    head.append(titleWrap, this.closeButton);

    const statusRow = document.createElement('div');
    statusRow.className = 'inspector__row';
    const statusLabel = document.createElement('span');
    statusLabel.textContent = uiStrings.statusLabel;
    this.statusEl = document.createElement('strong');
    statusRow.append(statusLabel, this.statusEl);

    const directionRow = document.createElement('div');
    directionRow.className = 'inspector__row';
    const directionLabel = document.createElement('span');
    directionLabel.textContent = uiStrings.direction;
    this.directionEl = document.createElement('strong');
    directionRow.append(directionLabel, this.directionEl);

    const bufferRow = document.createElement('div');
    bufferRow.className = 'inspector__row';
    const bufferLabel = document.createElement('span');
    bufferLabel.textContent = uiStrings.buffer;
    this.bufferEl = document.createElement('strong');
    bufferRow.append(bufferLabel, this.bufferEl);

    const progress = document.createElement('div');
    progress.className = 'progress';
    this.progressFill = document.createElement('span');
    this.progressFill.className = 'progress__fill';
    progress.appendChild(this.progressFill);

    const actions = document.createElement('div');
    actions.className = 'inspector__actions';
    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'btn btn--small';
    this.toggleButton.dataset.testid = 'inspector-toggle';
    this.toggleButton.addEventListener('click', () => {
      if (!this.currentId) return;
      this.callbacks.onToggle(this.currentId, this.toggleButton.dataset.nextEnabled === 'true');
    });
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'btn btn--small btn--danger';
    this.deleteButton.dataset.testid = 'inspector-delete';
    this.deleteButton.textContent = uiStrings.delete;
    this.deleteButton.addEventListener('click', () => {
      if (this.currentId) this.callbacks.onDelete(this.currentId);
    });
    actions.append(this.toggleButton, this.deleteButton);

    card.append(head, statusRow, directionRow, bufferRow, progress, actions);
    root.appendChild(card);
    this.hide();
  }

  show(building: Building | null, brownout: boolean): void {
    if (!building) {
      this.hide();
      return;
    }
    this.currentId = building.id;
    this.root.hidden = false;
    const spec = BUILDING_SPECS[building.type];
    this.typeEl.textContent = spec.label;

    const working =
      building.enabled &&
      !brownout &&
      (building.type === 'generator' ||
        (building.type === 'conveyor' ? true : building.buffer.length > 0));
    this.statusEl.textContent = !building.enabled
      ? uiStrings.buildingStatus.disabled
      : brownout
        ? uiStrings.buildingStatus.brownout
        : working
          ? uiStrings.buildingStatus.working
          : uiStrings.buildingStatus.idle;
    this.statusEl.className = `status-pill status-pill--${!building.enabled ? 'off' : brownout ? 'warn' : working ? 'ok' : 'idle'}`;

    if (building.type === 'conveyor') {
      this.directionEl.textContent = `${DIRECTION_LABELS[building.rotation]} · вход сзади`;
    } else if (building.type === 'processor') {
      this.directionEl.textContent = 'принимает с любой стороны';
    } else if (building.type === 'extractor') {
      this.directionEl.textContent = `${DIRECTION_LABELS[building.rotation]} · выход`;
    } else {
      this.directionEl.textContent = 'общая энергосеть';
    }

    const capacity = spec.bufferCapacity;
    this.bufferEl.textContent =
      capacity === 0 ? '—' : `${building.buffer.length} / ${capacity} ore`;
    const progress = spec.cycleSeconds > 0 ? building.progress / spec.cycleSeconds : 0;
    this.progressFill.style.width = `${Math.min(100, Math.max(0, progress * 100)).toFixed(1)}%`;

    this.toggleButton.textContent = building.enabled ? uiStrings.toggleOff : uiStrings.toggleOn;
    this.toggleButton.dataset.nextEnabled = building.enabled ? 'false' : 'true';
    this.toggleButton.disabled = false;
  }

  hide(): void {
    this.currentId = null;
    this.root.hidden = true;
  }

  getSelectedId(): string | null {
    return this.currentId;
  }
}
