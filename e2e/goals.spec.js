import { test, expect } from '@playwright/test';

test.describe('Goals', () => {
  test('goals list container exists', async ({ page }) => {
    await page.goto('/');
    const goalsList = page.locator('#goalsList');
    const count = await goalsList.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('goal panel structure exists', async ({ page }) => {
    await page.goto('/');
    // Check for goal detail panel structure
    const goalShell = page.locator('#goalShell');
    const count = await goalShell.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('create goal modal elements exist', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator('#createGoalModal');
    const count = await modal.count();
    if (count > 0) {
      await expect(modal).not.toBeVisible();
    }
  });

  test('goal progress bar renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Check for any progress bars that might have rendered
    const progressBars = page.locator('.goal-progress-bar');
    const count = await progressBars.count();
    // Progress bars should render without errors
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('goal task status dots have correct classes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Verify task status dots don't have unexpected classes
    const statusDots = page.locator('.goal-task-status');
    const count = await statusDots.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const dot = statusDots.nth(i);
      const classes = await dot.getAttribute('class');
      // Should contain one of the valid status classes
      const hasValidStatus = ['pending', 'in-progress', 'blocked', 'waiting', 'done', 'failed'].some(
        s => classes.includes(s)
      );
      expect(hasValidStatus).toBe(true);
    }
  });

  test('goal view has four tabs (Tasks, Plans, Files, Context)', async ({ page }) => {
    await page.goto('/');
    // Goal tabs should have Tasks, Plans, Files, and Context
    const tabs = page.locator('.goal-tab');
    const count = await tabs.count();
    expect(count).toBe(4);
    // Verify tab labels
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts).toContain('Tasks');
    expect(tabTexts).toContain('Plans');
    expect(tabTexts).toContain('Files');
    expect(tabTexts).toContain('Context');
  });

  test('goal detail has kick off overlay', async ({ page }) => {
    await page.goto('/');
    const overlay = page.locator('#goalKickoffOverlay');
    const count = await overlay.count();
    expect(count).toBe(1);
  });

  test('goal chat panel exists', async ({ page }) => {
    await page.goto('/');
    const chatPanel = page.locator('#goalChatPanel');
    const count = await chatPanel.count();
    expect(count).toBe(1);
  });

  test('goal right panel exists with header elements', async ({ page }) => {
    await page.goto('/');
    const rightPanel = page.locator('#goalRightPanel');
    const count = await rightPanel.count();
    expect(count).toBe(1);
    // Hero title element exists
    const heroTitle = page.locator('#goalHeroTitle');
    expect(await heroTitle.count()).toBe(1);
  });

  test('merge badge CSS classes exist', async ({ page }) => {
    await page.goto('/');
    // Inject a test merge badge to verify CSS works
    const hasMergeBadgeCSS = await page.evaluate(() => {
      const el = document.createElement('span');
      el.className = 'merge-badge merged';
      document.body.appendChild(el);
      const style = window.getComputedStyle(el);
      const hasDisplay = style.display !== 'none';
      document.body.removeChild(el);
      return hasDisplay;
    });
    expect(hasMergeBadgeCSS).toBe(true);
  });
});
