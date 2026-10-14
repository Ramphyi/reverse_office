import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
test.use({ actionTimeout: 10000 });
test('persistent sign-in, rich team pages, compensation, independent document/PDF workflows and full Connect windows', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  try {
    const login = await context.request.post('/api/login', {
      data: { email: 'alex@example.test', password: 'Browser-test-password-42!', remember: true },
    });
    expect(login.ok()).toBeTruthy();
    const cookie = (await context.cookies()).find((c) => c.name === 'ro_session');
    expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(29 * 86400);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?app=hub');
    await page.getByLabel('Color theme').selectOption('dark');
    await page.getByRole('button', { name: 'New page', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill('Launch knowledge');
    await dialog
      .getByRole('textbox', { name: 'Page content' })
      .fill('Formatted delivery knowledge');
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      canvas.getContext('2d').fillRect(0, 0, 32, 32);
      return canvas.toDataURL().split(',')[1];
    });
    await dialog.getByLabel('Page image').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    });
    await expect(dialog.locator('.team-editor img')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Publish page', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator('.knowledge-card').filter({ hasText: 'Launch knowledge' }).locator('img'),
    ).toHaveCount(1);
    await page.reload();
    await expect(page.getByText('Formatted delivery knowledge')).toBeVisible();
    await page.getByLabel('Customize appearance').click();
    await page.getByLabel('Accent color').fill('#7563b8');
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('ro-accent'))).toBe('#7563b8');
    await page.goto('/?app=admin');
    await page.getByRole('button', { name: 'Compensation & costs', exact: true }).click();
    await page.getByRole('button', { name: 'Add salary / project rate' }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Employee', { exact: true })
      .selectOption({ label: 'Jamie Lee' });
    await page.getByRole('dialog').getByLabel('Salary / hourly cost', { exact: true }).fill('4200');
    await page.getByRole('dialog').getByLabel('Effective from').fill('2026-01-01');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('4200 EUR / monthly')).toBeVisible();
    await page.goto('/?app=organisation-map');
    await expect(page.locator('.org-tree')).toContainText('Jamie Lee');
    await page.screenshot({ path: 'artifacts/organisation-map.png', fullPage: false });
    const me = await (await context.request.get('/api/me')).json(),
      headers = { 'x-csrf-token': me.csrf };
    const original = await (
      await context.request.post('/api/office/create', {
        headers,
        data: { templateId: 'writer-blank', title: 'Preserved original' },
      })
    ).json();
    expect(original.id).toBeTruthy();
    const before = await (
      await context.request.get('/api/documents/' + original.id + '/export/docx')
    ).body();
    await page.goto('/?app=doc');
    await page.getByRole('button', { name: /^Preserved original/ }).click();
    await expect(page.getByText('Create editable Studio copy', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create editable Studio copy', exact: true }).click();
    const studio = page.frameLocator('iframe[title="Reverse Studio document editor"]');
    await expect(studio.getByRole('textbox', { name: 'Document body' })).toBeVisible();
    expect(
      await (await context.request.get('/api/documents/' + original.id + '/export/docx')).body(),
    ).toEqual(before);
    await studio.getByRole('button', { name: 'Back to documents' }).click();
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]);
    const file = await (
      await context.request.post('/api/files', {
        headers,
        multipart: {
          file: {
            name: 'Usable review.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from(await pdf.save()),
          },
        },
      })
    ).json();
    expect(file.id).toBeTruthy();
    await page.goto('/?app=pdf');
    await page.getByRole('button', { name: /^Usable review.pdf/ }).click();
    await page.getByRole('button', { name: 'Edit PDF · annotations & pages', exact: true }).click();
    await page.getByLabel('Action', { exact: true }).selectOption('rotate');
    await page.getByRole('button', { name: 'Save edited PDF copy' }).click();
    await expect(page.locator('.independent-pdf h2')).toContainText('edited.pdf');
    await page.screenshot({ path: 'artifacts/independent-pdf.png' });
    await page.goto('/?app=timesheets');
    expect(
      await page
        .getByRole('navigation', { name: 'Workspace navigation' })
        .getByRole('button', { name: 'Time off', exact: true })
        .count(),
    ).toBe(0);
    await page.getByRole('button', { name: 'Time off', exact: true }).click();
    await expect(page.getByLabel('Leave year')).toBeVisible();
    await page.goto('/?app=chat&window=1');
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.rich-chat')).toBeVisible();
    expect((await page.locator('.rich-chat').boundingBox()).width).toBeGreaterThan(1100);
    await page.screenshot({ path: 'artifacts/connect-window.png' });
    await page.getByRole('button', { name: 'Nova attendance alerts' }).click();
    await expect(page.getByRole('heading', { name: 'Nova · Attendance' })).toBeVisible();
    const state = await context.storageState();
    const restored = await browser.newContext({
      baseURL: 'http://127.0.0.1:3101',
      storageState: state,
    });
    try {
      expect((await restored.request.get('/api/me')).ok()).toBeTruthy();
    } finally {
      await restored.close();
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
