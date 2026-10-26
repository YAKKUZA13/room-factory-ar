import { BUILDING_SPECS, BUILDING_TYPES, DIRECTION_LABELS } from '../core/constants';
import type { BuildingType, Direction, FactoryState } from '../core/types';
import { uiStrings } from './strings';

export type EditTool =
  | { mode: 'inspect' }
  | { mode: 'place'; buildingType: BuildingType; rotation: Direction }
  | { mode: 'delete' };

export interface ToolbarCallbacks {
  onSelect(type: BuildingType): void;
  onDeleteMode(): void;
  onCancel(): void;
  onRotate(): void;
}

interface ToolButton {
  type: BuildingType;
  node: HTMLButtonElement;
  meta: HTMLElement;
}

export class Toolbar {
  private readonly root: HTMLElement;
  private readonly callbacks: ToolbarCallbacks;
  private readonly buttons = new Map<BuildingType, ToolButton>();
  private readonly deleteButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly rotateButton: HTMLButtonElement;
  private readonly rotateLabel: HTMLElement;
  private enabled = true;

  constructor(root: HTMLElement, callbacks: ToolbarCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    root.innerHTML = '';

    const palette = document.createElement('div');
    palette.className = 'toolbar';
    palette.setAttribute('role', 'toolbar');
    palette.setAttribute('aria-label', uiStrings.modulesAria);

    for (const type of BUILDING_TYPES) {
      const spec = BUILDING_SPECS[type];
      const button = document.createElement('button');
      button.className = `tool tool--${type}`;
      button.type = 'button';
      button.dataset.testid = `tool-${type}`;
      button.setAttribute('aria-pressed', 'false');

      const icon = document.createElement('span');
      icon.className = `tool__icon tool__icon--${type}`;
      icon.textContent = spec.label.slice(0, 1);
      icon.style.setProperty('--tool-color', spec.color);

      const body = document.createElement('span');
      body.className = 'tool__body';
      const name = document.createElement('span');
      name.className = 'tool__name';
      name.textContent = spec.label;
      const meta = document.createElement('span');
      meta.className = 'tool__meta';
      body.append(name, meta);

      button.append(icon, body);
      button.title = spec.description;
      button.addEventListener('click', () => {
        if (!this.enabled) return;
        this.callbacks.onSelect(type);
      });
      palette.appendChild(button);
      this.buttons.set(type, { type, node: button, meta });
    }

    const utilities = document.createElement('div');
    utilities.className = 'toolbar-utils';

    this.rotateButton = document.createElement('button');
    this.rotateButton.type = 'button';
    this.rotateButton.className = 'util-btn';
    this.rotateButton.dataset.testid = 'tool-rotate';
    this.rotateLabel = document.createElement('span');
    this.rotateLabel.className = 'util-btn__value';
    this.rotateLabel.textContent = '0°';
    this.rotateButton.append('Поворот ', this.rotateLabel);
    this.rotateButton.addEventListener('click', () => {
      if (this.enabled) this.callbacks.onRotate();
    });

    this.cancelButton = document.createElement('button');
    this.cancelButton.type = 'button';
    this.cancelButton.className = 'util-btn util-btn--ghost';
    this.cancelButton.dataset.testid = 'tool-cancel';
    this.cancelButton.textContent = uiStrings.cancelTool;
    this.cancelButton.addEventListener('click', () => {
      if (this.enabled) this.callbacks.onCancel();
    });

    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'util-btn util-btn--danger';
    this.deleteButton.dataset.testid = 'tool-delete';
    this.deleteButton.textContent = uiStrings.delete;
    this.deleteButton.addEventListener('click', () => {
      if (this.enabled) this.callbacks.onDeleteMode();
    });

    utilities.append(this.rotateButton, this.deleteButton, this.cancelButton);
    root.append(palette, utilities);
  }

  update(state: FactoryState, tool: EditTool, rotation: Direction): void {
    for (const [type, button] of this.buttons) {
      const spec = BUILDING_SPECS[type];
      const starter = state.starterInventory[type];
      const starterText = starter > 0 ? `бесплатно · ${starter}` : `${spec.cost} кр.`;
      button.meta.textContent = starterText;
      const active = tool.mode === 'place' && tool.buildingType === type;
      button.node.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.node.classList.toggle('is-active', active);
      button.node.classList.toggle(
        'is-unaffordable',
        starter === 0 && state.credits < spec.cost,
      );
      button.node.style.setProperty('--tool-color', spec.color);
    }

    this.deleteButton.classList.toggle('is-active', tool.mode === 'delete');
    this.cancelButton.hidden = tool.mode === 'inspect';
    this.rotateButton.disabled = tool.mode === 'delete';
    this.rotateLabel.textContent = `${rotation * 90}° ${DIRECTION_LABELS[rotation].split(' ')[0] ?? ''}`;
    this.root.classList.toggle('is-disabled', !this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.classList.toggle('is-disabled', !enabled);
    for (const button of this.buttons.values()) {
      button.node.disabled = !enabled;
    }
    this.deleteButton.disabled = !enabled;
    this.cancelButton.disabled = !enabled;
    this.rotateButton.disabled = !enabled;
  }
}
