import { test, expect } from '@playwright/test';

test.describe('Condo Context', () => {
  test('condo context view container exists in DOM', async ({ page }) => {
    await page.goto('/');
    const condoView = page.locator('#condoContextView');
    expect(await condoView.count()).toBe(1);
    // Should not be visible by default (not active)
    await expect(condoView).not.toHaveClass(/active/);
  });

  test('condo context has info and workspace panels', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('#condoInfoPanel').count()).toBe(1);
    expect(await page.locator('#condoWorkspacePanel').count()).toBe(1);
  });

  test('condo context has goals graph', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('#condoGoalsGraph').count()).toBe(1);
  });

  test('condo context has timeline', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('#condoTimeline').count()).toBe(1);
  });

  test('condo context has action buttons', async ({ page }) => {
    await page.goto('/');
    const condoView = page.locator('#condoContextView');
    const actions = condoView.locator('.condo-context-actions .btn');
    const count = await actions.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('no JS errors when navigating to condo context', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    // Navigate to a non-existent condo ID (should not crash)
    await page.goto('/#/condo/test-condo-id');
    await page.waitForTimeout(2000);
    const unexpectedErrors = errors.filter(e =>
      !e.includes('WebSocket') &&
      !e.includes('ws://') &&
      !e.includes('wss://') &&
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError')
    );
    expect(unexpectedErrors).toEqual([]);
  });

  test('condo status board exists on dashboard', async ({ page }) => {
    await page.goto('/');
    const condoBoard = page.locator('#condoStatusBoard');
    expect(await condoBoard.count()).toBe(1);
    // Should be within the condoStatusSection
    const section = page.locator('#condoStatusSection');
    expect(await section.count()).toBe(1);
  });
});
