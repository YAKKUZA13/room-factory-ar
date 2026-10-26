import { BUILDING_SPECS, BUILDING_TYPES, MAX_LEVELS } from '../core/constants';
import { RECIPES } from '../core/recipes';
import type { BuildingType, Direction, FactoryState, RawResource, RecipeId } from '../core/types';
import { moduleIcon } from './icons';

export type EditTool = { mode: 'inspect' } | { mode: 'place'; buildingType: BuildingType; rotation: Direction } | { mode: 'delete' };
export interface ToolbarCallbacks {
  onSelect(type: BuildingType): void;
  onDeleteMode(): void;
  onCancel(): void;
  onRotate(clockwise: boolean): void;
  onConfirm(): void;
  onLevel(level: number): void;
  onOverview(): void;
}
export class Toolbar {
  private enabled = true;
  private level = 0;
  private readonly buttons = new Map<BuildingType, HTMLButtonElement>();
  private readonly options: HTMLElement;
  private readonly resource: HTMLSelectElement;
  private readonly recipe: HTMLSelectElement;
  private readonly liftDirection: HTMLSelectElement;
  private readonly confirm: HTMLButtonElement;
  private readonly rotation: HTMLElement;
  private readonly floors: HTMLElement;
  constructor(private readonly root: HTMLElement, callbacks: ToolbarCallbacks) {
    root.innerHTML = `<div class="module-heading"><span>Модули</span><span>Выберите → разместите</span></div><div class="toolbar" role="toolbar" aria-label="Модули завода"></div>
      <div class="tool-options" hidden>
        <label data-option="extractor">Добывать<select data-testid="placement-resource"><option value="ore">Руда</option><option value="copper">Медь</option></select></label>
        <label data-option="processor">Рецепт<select data-testid="placement-recipe">${Object.entries(RECIPES).map(([id, r]) => `<option value="${id}">${r.label}</option>`).join('')}</select></label>
        <label data-option="lift">Направление<select data-testid="placement-lift-direction"><option value="up">На этаж выше ↑</option><option value="down">На этаж ниже ↓</option></select></label>
      </div>
      <div class="toolbar-utils"><button class="util-btn" data-testid="tool-rotate-left" aria-label="Повернуть влево на 90 градусов">↶</button><button class="util-btn rotation-readout" data-testid="tool-rotate" aria-label="Повернуть вправо на 90 градусов"><span>Поворот</span><strong>0°</strong> ↷</button><button class="util-btn util-btn--danger" data-testid="tool-delete">Удалить</button><button class="util-btn" data-testid="tool-cancel">Отмена</button><button class="util-btn util-btn--confirm" data-testid="tool-confirm" hidden>Установить</button></div>`;
    const labels: Record<BuildingType, string> = {generator:'Энергия',extractor:'Добыча',conveyor:'Лента',processor:'Станция',lift:'Лифт'};
    for (const type of BUILDING_TYPES) {
      const button = document.createElement('button');
      button.className = 'tool'; button.dataset.testid = `tool-${type}`;
      button.setAttribute('aria-label', BUILDING_SPECS[type].label); button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `${moduleIcon(type)}<span class="tool__name">${labels[type]}</span><span class="tool__meta"></span>`;
      button.title = BUILDING_SPECS[type].description;
      button.addEventListener('click', () => { if (this.enabled) callbacks.onSelect(type); });
      root.querySelector('.toolbar')!.append(button); this.buttons.set(type, button);
    }
    const bind = (id: string, action: () => void) => {
      const button = root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
      button.addEventListener('click', () => { if (this.enabled) action(); }); return button;
    };
    bind('tool-rotate-left', () => callbacks.onRotate(false)); bind('tool-rotate', () => callbacks.onRotate(true));
    bind('tool-delete', callbacks.onDeleteMode); bind('tool-cancel', callbacks.onCancel);
    this.confirm = bind('tool-confirm', callbacks.onConfirm);
    this.rotation = root.querySelector('.rotation-readout strong')!;
    this.options = root.querySelector('.tool-options')!;
    this.resource = root.querySelector('[data-testid="placement-resource"]')!;
    this.recipe = root.querySelector('[data-testid="placement-recipe"]')!;
    this.liftDirection = root.querySelector('[data-testid="placement-lift-direction"]')!;
    this.floors = document.createElement('nav'); this.floors.className = 'floor-control';
    this.floors.setAttribute('aria-label', 'Этаж завода');
    this.floors.innerHTML = `<span class="floor-caption">Этаж</span><button data-testid="floor-up" aria-label="Этаж выше">↑</button><output data-testid="floor-current">01</output><button data-testid="floor-down" aria-label="Этаж ниже">↓</button><button data-testid="floor-overview" aria-label="Показать все этажи" aria-pressed="false">▱</button>`;
    root.parentElement!.append(this.floors);
    this.floors.querySelector<HTMLButtonElement>('[data-testid="floor-up"]')!.onclick = () => { if (this.enabled) callbacks.onLevel(Math.min(MAX_LEVELS - 1, this.level + 1)); };
    this.floors.querySelector<HTMLButtonElement>('[data-testid="floor-down"]')!.onclick = () => { if (this.enabled) callbacks.onLevel(Math.max(0, this.level - 1)); };
    this.floors.querySelector<HTMLButtonElement>('[data-testid="floor-overview"]')!.onclick = () => { if (this.enabled) callbacks.onOverview(); };
  }
  getConfiguration(type: BuildingType): {resource?: RawResource; recipe?: RecipeId; liftDirection?: 'up' | 'down'} {
    if (type === 'extractor') return {resource: this.resource.value as RawResource};
    if (type === 'processor') return {recipe: this.recipe.value as RecipeId};
    if (type === 'lift') return {liftDirection: this.liftDirection.value as 'up' | 'down'};
    return {};
  }
  setLevel(level: number, overview: boolean): void {
    this.level = level;
    this.floors.querySelector('output')!.textContent = String(level + 1).padStart(2, '0');
    this.floors.querySelector('[data-testid="floor-overview"]')!.setAttribute('aria-pressed', String(overview));
    this.floors.querySelector<HTMLButtonElement>('[data-testid="floor-up"]')!.disabled = !this.enabled || level === MAX_LEVELS - 1;
    this.floors.querySelector<HTMLButtonElement>('[data-testid="floor-down"]')!.disabled = !this.enabled || level === 0;
  }
  setPending(pending: boolean): void { this.confirm.hidden = !pending; }
  update(state: FactoryState, tool: EditTool, rotation: Direction): void {
    for (const [type, button] of this.buttons) {
      const starter = state.starterInventory[type] ?? 0;
      button.querySelector('.tool__meta')!.textContent = starter ? `×${starter} в наборе` : `${BUILDING_SPECS[type].cost} кр.`;
      button.setAttribute('aria-pressed', String(tool.mode === 'place' && tool.buildingType === type));
      button.classList.toggle('is-unaffordable', !starter && state.credits < BUILDING_SPECS[type].cost);
    }
    this.rotation.textContent = `${rotation * 90}°`;
    this.options.hidden = tool.mode !== 'place' || !['extractor', 'processor', 'lift'].includes(tool.buildingType);
    for (const label of this.options.querySelectorAll<HTMLElement>('label')) label.hidden = tool.mode !== 'place' || label.dataset.option !== tool.buildingType;
    this.root.querySelector('[data-testid="tool-cancel"]')!.toggleAttribute('hidden', tool.mode === 'inspect');
    this.root.querySelector('[data-testid="tool-delete"]')!.setAttribute('aria-pressed', String(tool.mode === 'delete'));
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.classList.toggle('is-disabled', !enabled);
    for (const node of this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select')) node.disabled = !enabled;
    this.floors.querySelector<HTMLButtonElement>('[data-testid="floor-overview"]')!.disabled = !enabled;
    this.setLevel(this.level, this.floors.querySelector('[data-testid="floor-overview"]')!.getAttribute('aria-pressed') === 'true');
  }
}
