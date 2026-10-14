import { test, expect } from '@playwright/test';

test('workspace guide keeps per-account notes and opens the actual module and Nova assistant', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  try {
    expect(
      (
        await context.request.post('/api/login', {
          data: { email: 'alex@example.test', password: 'Browser-test-password-42!' },
        })
      ).ok(),
    ).toBeTruthy();
    const page = await context.newPage();
    await page.goto('/?app=guide&topic=writer');
    await expect(page.getByRole('heading', { name: 'Guide', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.locator('.guide-steps input').first().check();
    await page.reload();
    await expect(page.locator('.guide-steps input').first()).toBeChecked();
    await page.screenshot({ path: 'artifacts/workspace-guide.png', fullPage: false });
    await page.getByRole('button', { name: 'Try it in the app', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Writer', exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('button', { name: 'Guide', exact: true })
      .click();
    await page
      .getByRole('navigation', { name: 'Tutorial chapters' })
      .getByRole('button', { name: /^Nova AI/ })
      .click();
    await page.getByRole('button', { name: 'Try it in the app', exact: true }).click();
    await expect(page.getByLabel('Message to assistant')).toBeVisible();
    await page.getByRole('button', { name: 'Close assistant' }).click();
    await page.goto('/guide?topic=writer');
    await expect(page.locator('.guide-steps input').first()).not.toBeChecked();
    await page.goto('/?app=guide&topic=writer');
    await expect(page.locator('.guide-steps input').first()).toBeChecked();
    expect(
      (
        await context.request.post('/api/login', {
          data: { email: 'jamie@example.test', password: 'Browser-personal-password-42!' },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto('/?app=guide&topic=writer');
    await expect(page.locator('.guide-steps input').first()).not.toBeChecked();
    await page.goto('/?app=guide&topic=administration');
    await expect(page.locator('.guide-chapter-actions')).toContainText(
      'Opening this module requires: admin',
    );
    await expect(page.getByRole('button', { name: 'Try it in the app', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await context.close();
  }
});
