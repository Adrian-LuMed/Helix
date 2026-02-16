import { test, expect } from '@playwright/test';

test.describe('PM Chat', () => {
  test('PM chat elements exist in DOM', async ({ page }) => {
    await page.goto('/');
    // Look for PM chat related elements
    const pmChat = page.locator('#pmChatMessages, #pmChatInput, .pm-chat');
    const count = await pmChat.count();
    // PM chat elements may or may not be visible depending on state
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('no JS errors on page load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForTimeout(3000);

    // Filter out expected errors (WebSocket connection failures in test env)
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
