import { ITEM_LABELS, RECIPE_GROUPS, RECIPES, recipeInputs, type Recipe } from '../core/recipes';
import { RAW_RESOURCES } from '../core/types';

export const RESOURCE_OPTIONS = RAW_RESOURCES.map((id) => `<option value="${id}">${ITEM_LABELS[id]}</option>`).join('');

const recipes = Object.entries(RECIPES);
const recipeOption = ([id, recipe]: [string, Recipe]) => `<option value="${id}">${recipe.label}</option>`;
export const RECIPE_OPTIONS = [
  ...recipes.filter(([, recipe]) => !recipe.group).map(recipeOption),
  ...Object.entries(RECIPE_GROUPS).map(([group, label]) =>
    `<optgroup label="${label}">${recipes.filter(([, recipe]) => recipe.group === group).map(recipeOption).join('')}</optgroup>`,
  ),
].join('');

export function formatRecipeInputs(recipe: Recipe): string {
  return recipeInputs(recipe).map(([item, quantity]) => `${ITEM_LABELS[item]}${quantity > 1 ? ` × ${quantity}` : ''}`).join(' + ');
}
