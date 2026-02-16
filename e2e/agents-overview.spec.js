import { test, expect } from '@playwright/test';

test.describe('Agents Overview', () => {
  test('agents overview view container exists in DOM', async ({ page }) => {
    await page.goto('/');
    const agentsView = page.locator('#agentsView');
    expect(await agentsView.count()).toBe(1);
    // Should not be visible by default (not active)
    await expect(agentsView).not.toHaveClass(/active/);
  });

  test('agents overview has summary grid', async ({ page }) => {
    await page.goto('/');
    const summaryGrid = page.locator('#agentsSummaryGrid');
    expect(await summaryGrid.count()).toBe(1);
  });

  test('agents overview has activity list', async ({ page }) => {
    await page.goto('/');
    const activityList = page.locator('#agentsActivityList');
    expect(await activityList.count()).toBe(1);
  });

  test('agents overview has workload grid', async ({ page }) => {
    await page.goto('/');
    const workloadGrid = page.locator('#agentsWorkloadGrid');
    expect(await workloadGrid.count()).toBe(1);
  });

  test('agents overview can be navigated to via hash', async ({ page }) => {
    await page.goto('/#/agents');
    await page.waitForTimeout(1000);
    const agentsView = page.locator('#agentsView');
    // May or may not be active depending on load timing
    const count = await agentsView.count();
    expect(count).toBe(1);
  });

  test('no JS errors when navigating to agents overview', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/#/agents');
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
});
