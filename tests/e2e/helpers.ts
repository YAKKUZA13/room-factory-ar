import { expect, type Page } from '@playwright/test';
import type { FactoryState } from '../../src/core/types';

export interface DebugApi {
  getState(): FactoryState;
  getAnchor(): unknown;
  getWorldPose(): { position: [number, number, number]; quaternion: [number, number, number, number] } | null;
  getDisplayPose(): { position: [number, number, number]; quaternion: [number, number, number, number] } | null;
  getMode(): 'desktop' | 'ar' | 'mock';
  getSession(): string;
  getMarkerStatus(): string;
  getMarkerPose(): { position: [number, number, number]; quaternion: [number, number, number, number] } | null;
  getCellScreenPoint(x: number, z: number): { x: number; y: number } | null;
  dispatch(command: unknown): { ok: boolean; error?: unknown };
  save(): unknown;
  getSave(): unknown;
  getDiagnostics(): Record<string, unknown>;
  setMarkerVisible(visible: boolean): void;
  setTracking(status: 'normal' | 'limited' | 'lost' | 'initializing' | 'unavailable'): void;
  getErrors(): ReadonlyArray<unknown>;
}

export async function freshPage(page: Page, query = 'debug=1'): Promise<void> {
  await page.goto(`./?${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('start-3d')).toBeVisible();
}

export async function startFresh3d(page: Page): Promise<void> {
  await freshPage(page, 'debug=1');
  await page.getByTestId('start-3d').click();
  await expect(page.locator('#game-ui')).toBeVisible();
  await expect(page.getByTestId('hud-credits')).toHaveText('120');
}

export async function debugState(page: Page): Promise<FactoryState> {
  return page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getState());
}

export async function debugSession(page: Page): Promise<string> {
  return page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getSession());
}

export async function selectTool(page: Page, type: 'generator' | 'extractor' | 'conveyor' | 'processor'): Promise<void> {
  await page.getByTestId(`tool-${type}`).click();
  await expect(page.getByTestId(`tool-${type}`)).toHaveAttribute('aria-pressed', 'true');
}

export async function rotatePlacement(page: Page): Promise<void> {
  await page.getByTestId('tool-rotate').click();
}

export async function clickCell(page: Page, x: number, z: number): Promise<void> {
  const point = await page.evaluate(
    ([cellX, cellZ]: [number, number]) =>
      window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(cellX, cellZ),
    [x, z] as [number, number],
  );
  if (!point) throw new Error(`Cell ${x},${z} is not visible on screen`);
  await page.mouse.click(point.x, point.y);
}

export async function waitForBuildings(page: Page, count: number): Promise<void> {
  await expect
    .poll(async () => (await debugState(page)).buildings.length, { timeout: 5000 })
    .toBe(count);
}

export async function waitForCreditsAbove(page: Page, credits: number, timeout = 20_000): Promise<void> {
  await expect
    .poll(async () => (await debugState(page)).credits, { timeout })
    .toBeGreaterThan(credits);
}

export async function buildWorkingChain(page: Page): Promise<void> {
  await selectTool(page, 'generator');
  await clickCell(page, 1, 1);
  await selectTool(page, 'extractor');
  await rotatePlacement(page);
  await clickCell(page, 2, 2);
  await selectTool(page, 'conveyor');
  await clickCell(page, 3, 2);
  await selectTool(page, 'processor');
  await clickCell(page, 4, 2);
  await waitForBuildings(page, 4);
}

export async function openMenu(page: Page): Promise<void> {
  await page.getByTestId('btn-menu').click();
  await expect(page.locator('#menu-dialog')).toBeVisible();
}

export async function saveManually(page: Page): Promise<void> {
  await openMenu(page);
  await page.getByTestId('menu-save').click();
  await expect(page.locator('#menu-dialog')).toBeHidden();
}

export async function confirmDialog(page: Page, extra = false): Promise<void> {
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  if (extra) await page.locator('#confirm-extra').check();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden();
}
