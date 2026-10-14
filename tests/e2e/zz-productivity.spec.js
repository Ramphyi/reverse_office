import { test, expect } from '@playwright/test';
test.use({ actionTimeout: 10000 });
test('usable time logging, project teams, Kanban, named file sharing and mail drafts/attachments', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' }),
    recipient = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  try {
    await context.request.post('/api/login', {
      data: { email: 'alex@example.test', password: 'Browser-test-password-42!' },
    });
    expect(
      (
        await recipient.request.post('/api/login', {
          data: { email: 'jamie@example.test', password: 'Browser-personal-password-42!' },
        })
      ).status(),
    ).toBe(200);
    const page = await context.newPage(),
      other = await recipient.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const nav = (name) =>
      page
        .getByRole('navigation', { name: 'Workspace navigation' })
        .getByRole('button', { name, exact: true })
        .click();
    await page.getByLabel('Color theme').selectOption('dark');
    await nav('Timesheets');
    await page.getByRole('button', { name: 'Log time', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Hours worked', { exact: true })).toHaveValue('8');
    await dialog.getByLabel('Activity', { exact: true }).selectOption('Work from home');
    await dialog.getByLabel('Work date', { exact: true }).fill('2026-11-23');
    await dialog.getByRole('button', { name: 'Increase Hours worked', exact: true }).click();
    await expect(dialog.getByLabel('Hours worked', { exact: true })).toHaveValue('8.5');
    await dialog.getByRole('button', { name: 'Decrease Hours worked', exact: true }).click();
    await dialog.getByLabel('What did you work on?').fill('Remote delivery');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Log time', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Activity', { exact: true }).selectOption('Special occasion');
    await dialog.getByLabel('Work date', { exact: true }).fill('2026-11-24');
    await expect(dialog.getByText(/not billed as worked time/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Request time off', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByLabel('Work calendar month').fill('2026-11');
    await page.getByRole('button', { name: 'Work day 2026-11-30', exact: true }).click();
    await page.getByRole('button', { name: 'Fill working week', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Hours 2026-11-30', { exact: true })).toHaveValue('8');
    await page.screenshot({
      path: 'artifacts/weekly-log-improved.png',
      fullPage: false,
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await nav('Projects');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Project name').fill('Productivity release');
    await dialog.getByLabel('Client name').fill('Example Client');
    await dialog.getByRole('checkbox', { name: /Jamie Lee/ }).check();
    await dialog.getByRole('checkbox', { name: /Chat Teammate/ }).check();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const project = (await (await context.request.get('/api/state')).json()).projects.find(
      (p) => p.title === 'Productivity release',
    );
    expect(project.members).toHaveLength(3);
    await page.getByLabel('Board project').selectOption(project.id);
    await page.getByRole('button', { name: 'Add task to In progress', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Status', { exact: true })).toHaveValue('In progress');
    await dialog.getByLabel('Task name').fill('Deliver client workspace');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = page.locator('.task-card').filter({ hasText: 'Deliver client workspace' });
    await card.dragTo(page.getByLabel('In review tasks', { exact: true }));
    await expect(page.getByLabel('Move Deliver client workspace', { exact: true })).toHaveValue(
      'In review',
    );
    const me = await (await context.request.get('/api/me')).json();
    const file = await (
      await context.request.post('/api/files', {
        headers: { 'x-csrf-token': me.csrf },
        multipart: {
          file: {
            name: 'Client brief.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Shared client brief'),
          },
        },
      })
    ).json();
    await nav('My Drive');
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('button', { name: 'My Drive', exact: true })
      .click();
    await page.getByRole('button', { name: 'Share Client brief.txt', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Who can access').selectOption('people');
    await dialog.getByRole('checkbox', { name: /Jamie Lee/ }).check();
    await dialog.getByRole('button', { name: 'Save permissions', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await recipient.request.get('/api/files/' + file.id + '/download')).status()).toBe(200);
    await nav('Mail');
    await page.getByRole('button', { name: 'Compose', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('To', { exact: true }).fill('jamie@example.test');
    await dialog.getByLabel('Subject', { exact: true }).fill('Delivery brief');
    await dialog.getByLabel('Message', { exact: true }).fill('**Ready for review**');
    await dialog.getByLabel('Mail attachments', { exact: true }).setInputFiles({
      name: 'delivery.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Delivery attachment'),
    });
    await expect(
      dialog.getByRole('button', { name: 'Remove delivery.txt', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/mail-compose-improved.png',
      fullPage: false,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox()).width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'artifacts/mail-compose-mobile.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page
      .locator('.mail-messages')
      .getByRole('button')
      .filter({ hasText: 'Delivery brief' })
      .click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await other.goto('/');
    await other
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('button', { name: 'Mail', exact: true })
      .click();
    await other
      .locator('.mail-messages')
      .getByRole('button')
      .filter({ hasText: 'Delivery brief' })
      .click();
    await expect(
      other.locator('.mail-reader strong').filter({ hasText: 'Ready for review' }),
    ).toBeVisible();
    await expect(other.getByRole('link', { name: /delivery.txt/ })).toBeVisible();
    await other.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(other.getByRole('dialog').getByLabel('To', { exact: true })).toHaveValue(
      'alex@example.test',
    );
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([context.close(), recipient.close()]);
  }
});
