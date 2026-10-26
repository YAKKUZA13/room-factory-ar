import { expect, test } from '@playwright/test';
import { debugSession, freshPage } from './helpers';

interface PoseLike {
  position: number[];
  quaternion: number[];
}

function expectAnchorClose(
  actual: unknown,
  expected: unknown,
): void {
  const a = actual as { kind: string; markerName?: string; markerToFactory?: PoseLike };
  const b = expected as { kind: string; markerName?: string; markerToFactory?: PoseLike };
  expect(a.kind).toBe(b.kind);
  if (a.kind !== 'marker' || b.kind !== 'marker') return;
  expect(a.markerName).toBe(b.markerName);
  for (let i = 0; i < 3; i += 1) {
    expect(a.markerToFactory?.position[i] ?? 0).toBeCloseTo(
      b.markerToFactory?.position[i] ?? 0,
      6,
    );
  }
  for (let i = 0; i < 4; i += 1) {
    expect(a.markerToFactory?.quaternion[i] ?? 0).toBeCloseTo(
      b.markerToFactory?.quaternion[i] ?? 0,
      6,
    );
  }
}

test.describe('MOCK AR anchor flow', () => {
  test('binds to a marker and relocalizes after reload with a different SLAM origin', async ({ page }) => {
    await freshPage(page, 'mockAR=1&debug=1');
    await page.getByTestId('start-ar').click();
    await expect(page.locator('[data-screen="scanning"]')).toBeVisible();
    await expect(page.locator('#mode-badge')).toContainText('MOCK AR');
    await page.getByTestId('scan-place').click();
    await expect(page.locator('#game-ui')).toBeVisible();
    expect(await debugSession(page)).toBe('FREE_UNBOUND');

    await page.getByTestId('bind-now').click();
    await expect(page.locator('[data-screen="binding"]')).toBeVisible();
    await expect.poll(async () => debugSession(page), { timeout: 10_000 }).toBe('BOUND_TRACKING');
    const anchorBefore = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getAnchor());
    expect((anchorBefore as { kind: string }).kind).toBe('marker');
    const worldBefore = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getWorldPose());
    expect(worldBefore).not.toBeNull();

    // New session: SLAM origin is shifted. The factory is not placed until the
    // same marker is seen again.
    await page.goto('./?mockAR=1&debug=1&mockOrigin=1.2,0,0.8');
    await page.getByTestId('continue-ar').click();
    await expect.poll(async () => page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getMode()), {
      timeout: 5000,
    }).toBe('mock');
    await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.setMarkerVisible(false));
    await expect(page.locator('[data-screen="relocalization"]')).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getWorldPose())).toBeNull();
    expect(await debugSession(page)).toMatch(/RELOCALIZING|NEEDS_RELOCALIZATION/);

    await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.setMarkerVisible(true));
    await expect.poll(async () => debugSession(page), { timeout: 10_000 }).toBe('BOUND_TRACKING');
    const anchorAfter = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getAnchor());
    expectAnchorClose(anchorAfter, anchorBefore);
    const worldAfter = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getWorldPose());
    expect(worldAfter).not.toBeNull();
    const before = worldBefore as { position: [number, number, number] };
    const after = worldAfter as { position: [number, number, number] };
    expect(after.position[0] - before.position[0]).toBeCloseTo(1.2, 1);
    expect(after.position[2] - before.position[2]).toBeCloseTo(0.8, 1);
    expect(await page.locator('#game-ui').isVisible()).toBe(true);
  });

  test('temporary placement keeps the marker anchor and can be rebound', async ({ page }) => {
    await freshPage(page, 'mockAR=1&debug=1');
    await page.getByTestId('start-ar').click();
    await expect(page.locator('[data-screen="scanning"]')).toBeVisible();
    await page.getByTestId('scan-place').click();
    await page.getByTestId('bind-now').click();
    await expect.poll(async () => debugSession(page), { timeout: 10_000 }).toBe('BOUND_TRACKING');
    const boundAnchor = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getAnchor());

    await page.reload();
    await page.getByTestId('continue-ar').click();
    await expect.poll(async () => page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getMode()), {
      timeout: 5000,
    }).toBe('mock');
    await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.setMarkerVisible(false));
    await expect(page.locator('[data-screen="relocalization"]')).toBeVisible();
    await page.waitForTimeout(700);
    // While waiting for the marker the factory must not be shown at a guess.
    expect(await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getWorldPose())).toBeNull();
    await page.locator('#btn-reloc-temporary').click();
    await expect(page.locator('[data-screen="scanning"]')).toBeVisible();
    await page.getByTestId('scan-place').click();
    await expect(page.locator('#game-ui')).toBeVisible();
    expect(await page.locator('#temporary-badge')).toBeVisible();
    const temporaryAnchor = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getAnchor());
    expectAnchorClose(temporaryAnchor, boundAnchor);

    await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.setMarkerVisible(true));
    await page.getByTestId('bind-now').click();
    await expect(page.locator('[data-screen="binding"]')).toBeVisible();
    await expect.poll(async () => debugSession(page), { timeout: 10_000 }).toBe('BOUND_TRACKING');
    await expect(page.locator('#temporary-badge')).toBeHidden();
  });

  test('tracking limited locks editing and recovers without losing the anchor', async ({ page }) => {
    await freshPage(page, 'mockAR=1&debug=1');
    await page.getByTestId('start-ar').click();
    await page.getByTestId('scan-place').click();
    await page.getByTestId('bind-now').click();
    await expect.poll(async () => debugSession(page), { timeout: 10_000 }).toBe('BOUND_TRACKING');
    const anchor = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getAnchor());

    await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.setTracking('limited'));
    await expect.poll(async () => debugSession(page)).toBe('TRACKING_LIMITED');
    const toolbar = page.locator('#toolbar-root');
    await expect(toolbar).toHaveClass(/is-disabled/);
    const limitedAnchor = await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.getAnchor());
    expectAnchorClose(limitedAnchor, anchor);

    await page.evaluate(() => window.__ROOM_FACTORY_DEBUG__!.setTracking('normal'));
    await expect.poll(async () => debugSession(page)).toBe('BOUND_TRACKING');
  });
});
