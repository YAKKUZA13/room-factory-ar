import type { Building, ItemType, RecipeId } from './types';

export const ITEM_LABELS: Record<ItemType, string> = {
  ore: 'Руда', copper: 'Медь', plate: 'Пластина', wire: 'Провод', alloy: 'Сплав', module: 'Модуль',
};
export const ITEM_COLORS: Record<ItemType, string> = {
  ore: '#596674', copper: '#b67a58', plate: '#bbc6d0', wire: '#b49672', alloy: '#7e9b9a', module: '#465b78',
};
export interface Recipe {
  label: string;
  inputs: readonly ItemType[];
  output?: ItemType;
  credits?: number;
  seconds: number;
}
export const RECIPES: Record<RecipeId, Recipe> = {
  parts: { label: 'Деталь · руда → 12 кр.', inputs: ['ore'], credits: 12, seconds: 2.5 },
  plate: { label: 'Пластина · руда → пластина', inputs: ['ore'], output: 'plate', seconds: 2.5 },
  wire: { label: 'Провод · медь → провод', inputs: ['copper'], output: 'wire', seconds: 2.5 },
  alloy: { label: 'Сплав · пластина + провод', inputs: ['plate', 'wire'], output: 'alloy', seconds: 4 },
  module: { label: 'Модуль · сплав + пластина', inputs: ['alloy', 'plate'], output: 'module', seconds: 5 },
  export: { label: 'Продажа · модуль → 120 кр.', inputs: ['module'], credits: 120, seconds: 1 },
};
export function isItem(value: unknown): value is ItemType {
  return typeof value === 'string' && Object.hasOwn(ITEM_LABELS, value);
}
export function isRecipe(value: unknown): value is RecipeId {
  return typeof value === 'string' && Object.hasOwn(RECIPES, value);
}
export function recipeOf(building: Building): Recipe {
  return RECIPES[building.recipe ?? 'parts'];
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
