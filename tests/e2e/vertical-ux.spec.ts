import { expect, test } from '@playwright/test';
import { clickCell, debugState, freshPage, saveManually, selectTool, startFresh3d } from './helpers';

test('preview, both rotation directions, tap-to-select, floors and save restore', async ({page,isMobile}) => {
  await startFresh3d(page);
  await selectTool(page,'extractor');
  const point=await page.evaluate(()=>window.__ROOM_FACTORY_DEBUG__!.getCellScreenPoint(4,4));
  expect(point).not.toBeNull();
  if(isMobile)await page.touchscreen.tap(point!.x,point!.y);else await page.mouse.click(point!.x,point!.y);
  await expect(page.getByTestId('tool-confirm')).toBeVisible();
  expect((await debugState(page)).buildings).toHaveLength(0);
  await page.getByTestId('tool-rotate-left').click();
  await expect(page.getByTestId('tool-rotate')).toContainText('270°');
  await page.getByTestId('tool-confirm').click();
  expect((await debugState(page)).buildings[0]!.rotation).toBe(3);
  await selectTool(page,'conveyor');
  await clickCell(page,4,4);
  await expect(page.getByTestId('inspector-rotate-right')).toBeVisible();
  await page.getByTestId('inspector-rotate-right').click();
  expect((await debugState(page)).buildings[0]!.rotation).toBe(0);
  await page.getByTestId('inspector-rotate-left').click();
  expect((await debugState(page)).buildings[0]!.rotation).toBe(3);
  await page.getByTestId('floor-up').click();
  await expect(page.getByTestId('floor-current')).toHaveText('02');
  await selectTool(page,'conveyor');await clickCell(page,4,4);
  const state=await debugState(page);
  expect(state.buildings).toHaveLength(2);expect(state.buildings.map(b=>b.level)).toEqual([0,1]);
  await saveManually(page);await page.reload();
  await page.getByTestId('continue').click();
  expect((await debugState(page)).buildings.map(b=>b.level)).toEqual([0,1]);
});

test('two towers start empty and produce a sold module across three floors',async({page})=>{
  await freshPage(page);
  await page.getByTestId('start-demo').click();
  await expect(page.getByTestId('floor-overview')).toHaveAttribute('aria-pressed','true');
  const state=await debugState(page);
  expect(new Set(state.buildings.map(b=>b.level)).size).toBe(3);
  await expect.poll(async()=>(await debugState(page)).totalPartsSold,{timeout:45000}).toBeGreaterThan(0);
  expect((await debugState(page)).credits).toBeGreaterThan(120);
});
