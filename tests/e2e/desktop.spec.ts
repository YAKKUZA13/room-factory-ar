import { expect, test } from '@playwright/test';
import {
  buildWorkingChain,
  clickCell,
  confirmDialog,
  debugSession,
  debugState,
  freshPage,
  openMenu,
  rotatePlacement,
  saveManually,
  selectTool,
  startFresh3d,
  waitForBuildings,
  waitForCreditsAbove,
} from './helpers';

test.describe('desktop 3D factory', () => {
  test('builds a chain, earns credits, pauses and restores after reload', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await startFresh3d(page);
    await buildWorkingChain(page);

    await waitForCreditsAbove(page, 120);
    const running = await debugState(page);
    expect(running.totalPartsSold).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);

    await saveManually(page);
    const saved = await debugState(page);

    await page.reload();
    await expect(page.getByTestId('continue')).toBeVisible();
    await page.getByTestId('continue').click();
    await expect(page.locator('#game-ui')).toBeVisible();
    const restored = await debugState(page);
    expect(restored.buildings).toHaveLength(saved.buildings.length);
    expect(restored.credits).toBeGreaterThanOrEqual(saved.credits);
    expect(restored.factoryId).toBe(saved.factoryId);

    await page.getByTestId('btn-pause').click();
    const pausedTime = (await debugState(page)).simulationTimeSeconds;
    await page.waitForTimeout(800);
    expect((await debugState(page)).simulationTimeSeconds).toBeCloseTo(pausedTime, 6);
    await page.getByTestId('btn-pause').click();
    await page.waitForTimeout(800);
    expect((await debugState(page)).simulationTimeSeconds).toBeGreaterThan(pausedTime);
    expect(pageErrors).toEqual([]);
  });

  test('a conveyor pointing the wrong way blocks production until rotated', async ({ page }) => {
    await startFresh3d(page);
    await selectTool(page, 'generator');
    await clickCell(page, 1, 1);
    await selectTool(page, 'extractor');
    await rotatePlacement(page);
    await clickCell(page, 2, 2);
    await selectTool(page, 'conveyor');
    // Set placement rotation back to +Z so the conveyor does not accept from the extractor.
    await rotatePlacement(page);
    await rotatePlacement(page);
    await rotatePlacement(page);
    await clickCell(page, 3, 2);
    await selectTool(page, 'processor');
    await clickCell(page, 4, 2);
    await waitForBuildings(page, 4);

    await page.waitForTimeout(7000);
    expect((await debugState(page)).credits).toBe(120);

    await page.getByTestId('tool-cancel').click();
    await clickCell(page, 3, 2);
    await expect(page.locator('#inspector-root .inspector')).toBeVisible();
    await page.getByTestId('tool-rotate').click();
    const conveyor = (await debugState(page)).buildings.find((b) => b.type === 'conveyor');
    expect(conveyor?.rotation).toBe(1);
    await waitForCreditsAbove(page, 120);
  });

  test('exports, resets and imports the save', async ({ page }, testInfo) => {
    await startFresh3d(page);
    await buildWorkingChain(page);
    await waitForCreditsAbove(page, 120);
    await saveManually(page);

    await openMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('menu-export').click();
    const download = await downloadPromise;
    const filePath = testInfo.outputPath('factory.json');
    await download.saveAs(filePath);
    await expect(page.locator('#menu-dialog')).toBeHidden();

    await openMenu(page);
    await page.getByTestId('menu-reset').click();
    await confirmDialog(page);
    await expect.poll(async () => (await debugState(page)).buildings.length).toBe(0);

    await page.setInputFiles('#import-file', filePath);
    await confirmDialog(page);
    await expect.poll(async () => (await debugState(page)).buildings.length).toBe(4);
    const imported = await debugState(page);
    expect(imported.credits).toBeGreaterThanOrEqual(120);
    expect(await debugSession(page)).toBe('DESKTOP_3D');
  });

  test('recovers from a corrupt localStorage save without an uncaught exception', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('./?debug=1');
    await page.evaluate(() => localStorage.setItem('room-factory-ar/save/v1', '{broken json'));
    await page.reload();
    await expect(page.locator('[data-screen="recovery"]')).toBeVisible();
    await expect(page.locator('[data-screen="recovery"]')).toContainText('Сохранение повреждено');
    await page.locator('#btn-recovery-restart').click();
    await expect(page.locator('[data-screen="start"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('desktop AR shows an honest unsupported fallback', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A mobile viewport is expected to reach the camera permission flow.');
    await freshPage(page, 'debug=1');
    await page.getByTestId('start-ar').click();
    await expect(page.locator('[data-screen="error"]')).toBeVisible();
    await expect(page.locator('#error-title')).toContainText('AR недоступен');
    await page.locator('#btn-error-3d').click();
    await expect(page.locator('#game-ui')).toBeVisible();
    expect(await debugSession(page)).toBe('DESKTOP_3D');
  });

  test('opens diagnostics without camera data', async ({ page }) => {
    await startFresh3d(page);
    await openMenu(page);
    await page.locator('#menu-diagnostics').click();
    await expect(page.locator('#diagnostics-dialog')).toBeVisible();
    await expect(page.locator('#diagnostics-content')).toContainText('mode: desktop 3D');
    await expect(page.locator('#diagnostics-content')).toContainText('anchor: unbound');
    await expect(page.locator('#diagnostics-content')).not.toContainText('camera frame');
    await page.locator('#diagnostics-close').click();
  });

  test('keeps critical controls inside a 390x844 and 844x390 viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startFresh3d(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    for (const testId of ['tool-generator', 'tool-extractor', 'tool-conveyor', 'tool-processor']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(391);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const hud = await page.getByTestId('hud-credits').boundingBox();
    expect(hud).not.toBeNull();
    expect(hud!.y).toBeGreaterThanOrEqual(0);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const toolbar = await page.locator('#toolbar-root').boundingBox();
    expect(toolbar).not.toBeNull();
    expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(391);
  });
});
