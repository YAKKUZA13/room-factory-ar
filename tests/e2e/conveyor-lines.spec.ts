import { expect, test } from '@playwright/test';
import { clickCell, debugState, saveManually, selectTool, startFresh3d } from './helpers';

test('builds a continuous line with both bends and restores production after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await startFresh3d(page);
  await page.evaluate(() => {
    const api = window.__ROOM_FACTORY_DEBUG__!;
    const commands = [
      { buildingType: 'generator', x: 1, z: 1, rotation: 0 },
      { buildingType: 'extractor', x: 2, z: 3, rotation: 1 },
      { buildingType: 'conveyor', x: 3, z: 3, rotation: 1 },
      { buildingType: 'conveyor', x: 4, z: 3, rotation: 1 },
      { buildingType: 'conveyor', x: 5, z: 3, rotation: 0 },
      { buildingType: 'conveyor', x: 5, z: 4, rotation: 0 },
      { buildingType: 'conveyor', x: 6, z: 5, rotation: 1 },
      { buildingType: 'processor', x: 7, z: 5, rotation: 1 },
    ] as const;
    for (const command of commands) {
      const result = api.dispatch({ type: 'place', ...command });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
    }
  });
  await selectTool(page, 'conveyor');
  await page.getByTestId('tool-rotate').click();
  await clickCell(page, 5, 5);
  expect((await debugState(page)).buildings).toHaveLength(9);
  await expect(page.locator('#tutorial-text')).toContainText('Линия соединена');
  await expect.poll(async () => (await debugState(page)).totalPartsSold, { timeout: 20000 }).toBeGreaterThan(0);
  await saveManually(page);
  await page.reload(); await page.getByTestId('continue').click();
  const restored = await debugState(page);
  expect(restored.buildings).toHaveLength(9);
  expect(restored.buildings.find(b => b.x === 5 && b.z === 5)).toMatchObject({ type: 'conveyor', rotation: 1 });
  await expect.poll(async () => (await debugState(page)).totalPartsSold, { timeout: 15000 }).toBeGreaterThan(restored.totalPartsSold);
  expect(errors).toEqual([]);
});
