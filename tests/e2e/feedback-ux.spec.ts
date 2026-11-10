import { expect, test } from '@playwright/test';
import { clickCell, debugState, selectTool, startFresh3d, saveManually } from './helpers';

test('placement shortcuts install once; camera gestures do not install', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse shortcuts are desktop controls');
  await startFresh3d(page);
  await selectTool(page, 'extractor');
  const p = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4)))!;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 35, p.y + 20, { steps: 5 });
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('tool-confirm')).toBeHidden();
  expect((await debugState(page)).buildings).toHaveLength(0);
  await page.getByTestId('reset-view').click();
  const q = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4)))!;
  await page.mouse.dblclick(q.x, q.y);
  expect((await debugState(page)).buildings).toHaveLength(1);
  await expect(page.getByTestId('tool-confirm')).toBeHidden();
  const r = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(6, 4)))!;
  await page.mouse.click(r.x, r.y);
  await page.keyboard.press('Enter');
  expect((await debugState(page)).buildings).toHaveLength(2);
});

test('middle and right drag move the map with the mouse; home restores it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse camera controls');
  await startFresh3d(page);
  for (const button of ['middle', 'right'] as const) {
    const before = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4)))!;
    await page.mouse.move(760, 280);
    await page.mouse.down({ button });
    await page.mouse.move(860, 280, { steps: 12 });
    await page.mouse.up({ button });
    await expect.poll(async () => {
      const after = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4)))!;
      return after.x - before.x;
    }).toBeGreaterThan(70);
    const after = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4)))!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    await page.getByTestId('reset-view').click();
    await expect.poll(async () => (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4)))!.x).toBeCloseTo(before.x, 0);
  }
  expect((await debugState(page)).buildings).toHaveLength(0);
});

test('move, cancel, collision, rotate and save preserve a building', async ({ page }) => {
  await startFresh3d(page);
  await selectTool(page, 'extractor');
  await clickCell(page, 4, 4);
  await selectTool(page, 'conveyor');
  await clickCell(page, 6, 4);
  await clickCell(page, 4, 4);
  const original = (await debugState(page)).buildings[0]!;
  const credits = (await debugState(page)).credits;
  await page.getByTestId('inspector-move').click();
  await page.getByTestId('tool-rotate').click();
  await page.getByTestId('tool-cancel').click();
  expect((await debugState(page)).buildings[0]!.rotation).toBe(original.rotation);
  await page.getByTestId('inspector-move').click();
  await clickCell(page, 6, 4);
  await expect(page.getByTestId('tool-confirm')).toBeHidden();
  expect((await debugState(page)).buildings[0]!.x).toBe(4);
  await page.getByTestId('tool-rotate').click();
  await expect(page.getByTestId('tool-rotate')).toContainText('90°');
  const target = (await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(5, 4)))!;
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId('tool-confirm')).toBeVisible();
  await page.getByTestId('tool-confirm').click();
  const moved = (await debugState(page)).buildings[0]!;
  expect(moved.id).toBe(original.id);
  expect(moved.x).toBe(5);
  expect(moved.rotation).toBe(1);
  expect(moved.purchaseSource).toBe(original.purchaseSource);
  expect((await debugState(page)).credits).toBe(credits);
  await saveManually(page);
  await page.reload();
  await page.getByTestId('continue').click();
  expect((await debugState(page)).buildings[0]).toMatchObject({ id: original.id, x: 5, z: 4, rotation: 1 });
});

test('drag a building directly with the mouse and leave the camera fixed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch keeps one-finger camera rotation');
  await startFresh3d(page);
  await selectTool(page, 'extractor'); await clickCell(page, 4, 4);
  const points = await page.evaluate(() => [window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4), window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(6, 4)]);
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  await page.mouse.move(points[1]!.x, points[1]!.y, { steps: 12 });
  await page.mouse.up();
  expect((await debugState(page)).buildings).toHaveLength(1);
  expect((await debugState(page)).buildings[0]).toMatchObject({ id: 'b1', x: 6, z: 4 });
  const after = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4, 4));
  expect(after!.x).toBeCloseTo(points[0]!.x, 0);
  expect(after!.y).toBeCloseTo(points[0]!.y, 0);
});

test('tutorial follows the actual line; help and demo are accessible in the scene', async ({ page }) => {
  await startFresh3d(page);
  await selectTool(page, 'extractor'); await clickCell(page, 2, 2);
  await expect(page.locator('#tutorial-text')).toContainText('Поставьте генератор');
  await selectTool(page, 'generator'); await clickCell(page, 8, 1);
  await expect(page.locator('#tutorial-text')).toContainText('Соедините добытчик со станцией');
  await selectTool(page, 'processor'); await clickCell(page, 2, 4);
  await selectTool(page, 'conveyor'); await page.getByTestId('tool-rotate').click(); await clickCell(page, 2, 3);
  await expect(page.locator('#tutorial-text')).toContainText('Соедините добытчик со станцией');
  await clickCell(page, 2, 3);
  await page.getByTestId('inspector-rotate-left').click();
  await expect(page.locator('#tutorial-text')).toContainText('Линия соединена');
  await page.getByTestId('help-game').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await expect(page.getByTestId('help-demo')).toBeVisible();
  const before = (await debugState(page)).buildings.map(b => b.rotation);
  await page.keyboard.press('r');
  expect((await debugState(page)).buildings.map(b => b.rotation)).toEqual(before);
  await page.locator('#help-close').click();
});
