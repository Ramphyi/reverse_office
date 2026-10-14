import { test, expect } from '@playwright/test';
test('floating tools search workbook cells, move, resize, retain state and preview images', async ({
  page,
}) => {
  const errors = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Sheets Make/ }).click();
  await page.getByRole('gridcell', { name: 'Cell A1', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'Edit A1', exact: true }).fill('Revenue');
  await page.getByRole('textbox', { name: 'Edit A1', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Open floating assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Workspace assistant' });
  const handle = page.getByLabel('Move assistant. Use arrow keys; Home resets position.');
  const first = await panel.boundingBox();
  await page.mouse.move(first.x + 150, first.y + 30);
  await page.mouse.down();
  await page.mouse.move(230, 155, { steps: 10 });
  await page.mouse.up();
  const moved = await panel.boundingBox();
  expect(moved.x).toBeLessThan(first.x - 100);
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  expect((await panel.boundingBox()).x).toBeCloseTo(moved.x + 10, 0);
  const resize = page.getByLabel('Resize assistant. Use arrow keys.');
  await resize.focus();
  await page.keyboard.press('Shift+ArrowRight');
  expect((await panel.boundingBox()).width).toBeCloseTo(first.width + 40, 0);
  await page.getByLabel('Assistant tool', { exact: true }).selectOption('sheet');
  await page.getByLabel('Message to assistant').fill('Revenue');
  await page.getByRole('button', { name: 'Run assistant tool' }).click();
  await expect(panel).toContainText('workspace_search');
  await expect(panel).toContainText('Sheet 1!A1');
  await page.getByLabel('Assistant tool', { exact: true }).selectOption('range');
  await page.getByLabel('Message to assistant').fill('A1:B3');
  await page.getByRole('button', { name: 'Run assistant tool' }).click();
  await expect(panel).toContainText('sheet_range');
  await expect(panel.locator('table tr')).toHaveCount(6);
  // Canvas generates a browser-decodable PNG, independent of codec tolerance for fixture files.
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    c.getContext('2d').fillRect(0, 0, 2, 2);
    return c.toDataURL().split(',')[1];
  });
  await page.getByLabel('Attach images', { exact: true }).setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(panel.getByAltText('sample.png')).toBeVisible();
  await page.getByRole('button', { name: 'Minimize assistant' }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Open floating assistant' }).click();
  await expect(panel).toContainText('sheet_range');
  await page.screenshot({
    path: 'artifacts/studio-floating-assistant.png',
    animations: 'disabled',
  });
  const stored = await panel.boundingBox();
  await page.reload();
  await page.getByRole('button', { name: 'Open floating assistant' }).click();
  expect((await panel.boundingBox()).x).toBeCloseTo(stored.x, 0);
  await page.setViewportSize({ width: 375, height: 740 });
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return box.x + box.width;
    })
    .toBeLessThanOrEqual(375);
  const mobile = await panel.boundingBox();
  expect(mobile.x).toBeGreaterThanOrEqual(0);
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(375);
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(740);
  expect(errors).toEqual([]);
});
test('local model connection invokes a tool and renders its evidence without bundling a runtime', async ({
  page,
}) => {
  let requests = 0;
  await page.route('http://localhost:11434/v1/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Allow-Methods': 'POST',
        },
      });
      return;
    }
    requests++;
    const body = route.request().postDataJSON();
    const completed = body.messages.some((m) => m.role === 'tool');
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        choices: [
          {
            message: completed
              ? { content: 'Found the saved revenue entry.' }
              : {
                  tool_calls: [
                    {
                      id: 'find',
                      type: 'function',
                      function: { name: 'workspace_search', arguments: '{"query":"Revenue"}' },
                    },
                  ],
                },
          },
        ],
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Writer From/ }).click();
  await page
    .getByRole('textbox', { name: 'Document body' })
    .fill('Revenue increased this quarter.');
  await page.getByRole('button', { name: 'Open floating assistant' }).click();
  await page.getByRole('button', { name: 'Configure local AI' }).click();
  await page.getByLabel('Local model name').fill('test-tool-model');
  await page.getByRole('button', { name: 'Use local model' }).click();
  await page.getByLabel('Message to assistant').fill('Find revenue');
  await page.getByRole('button', { name: 'Run assistant tool' }).click();
  const panel = page.getByRole('complementary', { name: 'Workspace assistant' });
  await expect(panel).toContainText('Found the saved revenue entry.');
  await expect(panel).toContainText('workspace_search');
  expect(requests).toBe(2);
  await page.screenshot({ path: 'artifacts/studio-agent-tools.png', animations: 'disabled' });
});
test('Studio shortcut drawer hides, restores, reorders and resizes without touching documents', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle Studio navigation' }).click();
  const drawer = page.getByRole('complementary', { name: 'Studio navigation' }),
    nav = page.getByRole('navigation', { name: 'Studio shortcuts' });
  await page.getByRole('button', { name: 'Customize Studio shortcuts' }).click();
  await page.getByLabel('Show Studio help').uncheck();
  await page.getByRole('button', { name: 'Move New spreadsheet up' }).click();
  await expect(nav.getByRole('button').nth(1)).toHaveAttribute('aria-label', 'New spreadsheet');
  await expect(nav.getByRole('button', { name: 'Studio help' })).toHaveCount(0);
  await page.getByRole('separator', { name: 'Resize Studio navigation' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(drawer).toHaveCSS('width', '252px');
  await page.reload();
  await page.getByRole('button', { name: 'Toggle Studio navigation' }).click();
  await expect(drawer).toHaveCSS('width', '252px');
  await expect(nav.getByRole('button').nth(1)).toHaveAttribute('aria-label', 'New spreadsheet');
  await page.getByRole('button', { name: 'Customize Studio shortcuts' }).click();
  await page.getByRole('button', { name: 'Restore Studio shortcuts' }).click();
  await expect(nav.getByRole('button', { name: 'Studio help' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/studio-shortcuts.png', animations: 'disabled' });
  await nav.getByRole('button', { name: 'New spreadsheet' }).click();
  await expect(page.getByRole('gridcell', { name: 'Cell A1', exact: true })).toBeVisible();
  await expect(drawer).toBeHidden();
});
