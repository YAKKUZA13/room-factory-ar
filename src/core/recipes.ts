import { RAW_RESOURCES, type Building, type ItemType, type RawResource, type RecipeId } from './types';

export const ITEM_LABELS: Record<ItemType, string> = {
  ore: 'Руда', copper: 'Медь', resin: 'Полимерное сырьё', sand: 'Кварцевый песок', lithium: 'Литиевое сырьё',
  plate: 'Пластина', wire: 'Провод', alloy: 'Сплав', module: 'Модуль',
  pellets: 'Гранулы', plastic: 'Пластик', 'copper-foil': 'Медная фольга', 'insulated-wire': 'Провод в изоляции',
  silicon: 'Кремниевая заготовка', chip: 'Микросхема',
  board: 'Печатная плата', 'programmable-board': 'Программируемая плата', controller: 'Контроллер',
  frame: 'Рама', motors: 'Комплект моторов', rotors: 'Комплект винтов', cell: 'Ячейка питания',
  battery: 'Батарея', airframe: 'Силовая рама', avionics: 'Блок электроники', drone: 'Дрон',
};
export const ITEM_COLORS: Record<ItemType, string> = {
  ore: '#596674', copper: '#b67a58', resin: '#dbaf70', sand: '#dfcfa4', lithium: '#9aaccb',
  plate: '#bbc6d0', wire: '#c18145', alloy: '#7e9b9a', module: '#465b78',
  pellets: '#dcc390', plastic: '#e2b94e', 'copper-foil': '#c27b4f', 'insulated-wire': '#517ba4',
  silicon: '#8fa4be', chip: '#4f5578',
  board: '#388c7a', 'programmable-board': '#347a5e', controller: '#225762',
  frame: '#d08f44', motors: '#78889f', rotors: '#456781', cell: '#a9b3ce',
  battery: '#547ab0', airframe: '#c99042', avionics: '#306e84', drone: '#197e72',
};

export const RECIPE_GROUPS = {
  materials: 'Сырьё и материалы',
  electronics: 'Электроника',
  mechanics: 'Механика',
  power: 'Питание',
  assembly: 'Сборка дрона',
} as const;
export interface Recipe {
  label: string;
  inputs: readonly ItemType[];
  output?: ItemType;
  credits?: number;
  seconds: number;
  group?: keyof typeof RECIPE_GROUPS;
}
export const RECIPES: Record<RecipeId, Recipe> = {
  parts: { label: 'Деталь · руда → 12 кр.', inputs: ['ore'], credits: 12, seconds: 2.5 },
  plate: { label: 'Пластина · руда → пластина', inputs: ['ore'], output: 'plate', seconds: 2.5 },
  wire: { label: 'Провод · медь → провод', inputs: ['copper'], output: 'wire', seconds: 2.5 },
  alloy: { label: 'Сплав · пластина + провод', inputs: ['plate', 'wire'], output: 'alloy', seconds: 4 },
  module: { label: 'Модуль · сплав + пластина', inputs: ['alloy', 'plate'], output: 'module', seconds: 5 },
  export: { label: 'Продажа · модуль → 120 кр.', inputs: ['module'], credits: 120, seconds: 1 },
  pellets: { label: ITEM_LABELS.pellets, inputs: ['resin'], output: 'pellets', seconds: 2, group: 'materials' },
  plastic: { label: ITEM_LABELS.plastic, inputs: ['pellets', 'sand'], output: 'plastic', seconds: 3, group: 'materials' },
  'copper-foil': { label: ITEM_LABELS['copper-foil'], inputs: ['copper'], output: 'copper-foil', seconds: 2, group: 'materials' },
  'insulated-wire': {
    label: ITEM_LABELS['insulated-wire'], inputs: ['wire', 'pellets'],
    output: 'insulated-wire', seconds: 3, group: 'electronics',
  },
  silicon: { label: ITEM_LABELS.silicon, inputs: ['sand'], output: 'silicon', seconds: 3, group: 'electronics' },
  chip: { label: ITEM_LABELS.chip, inputs: ['silicon', 'wire'], output: 'chip', seconds: 4, group: 'electronics' },
  board: { label: ITEM_LABELS.board, inputs: ['plastic', 'copper-foil'], output: 'board', seconds: 4, group: 'electronics' },
  'programmable-board': {
    label: ITEM_LABELS['programmable-board'], inputs: ['board', 'chip', 'insulated-wire'],
    output: 'programmable-board', seconds: 5, group: 'electronics',
  },
  controller: { label: ITEM_LABELS.controller, inputs: ['programmable-board'], output: 'controller', seconds: 3, group: 'electronics' },
  frame: { label: ITEM_LABELS.frame, inputs: ['plastic', 'plate'], output: 'frame', seconds: 4, group: 'mechanics' },
  motors: { label: ITEM_LABELS.motors, inputs: ['alloy', 'wire'], output: 'motors', seconds: 5, group: 'mechanics' },
  rotors: { label: ITEM_LABELS.rotors, inputs: ['plastic'], output: 'rotors', seconds: 3, group: 'mechanics' },
  cell: { label: ITEM_LABELS.cell, inputs: ['lithium', 'copper'], output: 'cell', seconds: 4, group: 'power' },
  battery: { label: ITEM_LABELS.battery, inputs: ['cell', 'cell', 'wire'], output: 'battery', seconds: 4, group: 'power' },
  airframe: { label: ITEM_LABELS.airframe, inputs: ['frame', 'motors', 'rotors'], output: 'airframe', seconds: 5, group: 'assembly' },
  avionics: { label: ITEM_LABELS.avionics, inputs: ['controller', 'battery'], output: 'avionics', seconds: 4, group: 'assembly' },
  drone: { label: ITEM_LABELS.drone, inputs: ['airframe', 'avionics'], output: 'drone', seconds: 6, group: 'assembly' },
  'ship-drone': { label: 'Отгрузка дрона', inputs: ['drone'], credits: 640, seconds: 1, group: 'assembly' },
};

export function isRawResource(value: unknown): value is RawResource {
  return RAW_RESOURCES.some(resource => resource === value);
}
export function isItem(value: unknown): value is ItemType {
  return typeof value === 'string' && Object.hasOwn(ITEM_LABELS, value);
}
export function isRecipe(value: unknown): value is RecipeId {
  return typeof value === 'string' && Object.hasOwn(RECIPES, value);
}
export function recipeOf(building: Building): Recipe {
  return RECIPES[building.recipe ?? 'parts'];
}
export function recipeForItem(item: ItemType): Recipe | undefined {
  if (isRecipe(item) && RECIPES[item].output === item) return RECIPES[item];
  return undefined;
}

export function recipeInputs(recipe: Recipe): Array<[ItemType, number]> {
  const quantities = new Map<ItemType, number>();
  for (const item of recipe.inputs) quantities.set(item, (quantities.get(item) ?? 0) + 1);
  return [...quantities];
}
export function hasIngredients(building: Building): boolean {
  const remaining = [...building.buffer];
  return recipeOf(building).inputs.every(item => {
    const index = remaining.indexOf(item);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}
export function acceptsItem(building: Building, item: ItemType): boolean {
  if (building.type === 'processor') {
    const needed = recipeOf(building).inputs.filter(input => input === item).length;
    return needed > building.buffer.filter(input => input === item).length;
  }
  return (building.type === 'conveyor' || building.type === 'lift') && building.buffer.length < 1;
}
