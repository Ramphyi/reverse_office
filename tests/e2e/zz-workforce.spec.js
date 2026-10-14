import { test, expect } from '@playwright/test';
test('organisation onboarding, member security, shared leave/calendar, weekly hours and mobile dark UI', async ({
  browser,
}) => {
  const a = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' }),
    m = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  try {
    const login = await a.request.post('/api/login', {
      data: { email: 'alex@example.test', password: 'Browser-test-password-42!' },
    });
    expect(login.status()).toBe(200);
    const page = await a.newPage(),
      member = await m.newPage(),
      errors = [];
    for (const p of [page, member]) p.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.locator('nav').getByRole('button', { name: 'Administration', exact: true }).click();
    await page.getByRole('button', { name: 'Organisation', exact: true }).click();
    await page.getByLabel('Organisation name').fill('Northstar Studio');
    await page.getByRole('button', { name: 'Save organisation' }).click();
    await expect(page.locator('.workspace-switch')).toContainText('Northstar Studio');
    await page.getByRole('button', { name: 'People', exact: true }).click();
    await page.getByRole('button', { name: 'Add person' }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Taylor Calendar');
    await page.getByLabel('Department', { exact: true }).fill('Product');
    await page.getByLabel('Job title', { exact: true }).fill('Designer');
    await page.getByLabel('Work email').fill('taylor@calendar.test');
    await page.getByLabel('Initial password').fill('Temporary-calendar-42!');
    await page.getByLabel('Allowance year').fill('2027');
    const project = (await (await a.request.get('/api/state')).json()).projects[0];
    await page.getByRole('dialog').getByLabel(project.title, { exact: true }).check();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Search people').fill('taylor');
    await expect(
      page.getByRole('cell', { name: 'taylor@calendar.test', exact: false }),
    ).toBeVisible();
    await page.screenshot({ path: 'artifacts/workforce-people.png', fullPage: true });
    await member.goto('/');
    await member.getByLabel('Work email').fill('taylor@calendar.test');
    await member.getByLabel('Password', { exact: true }).fill('Temporary-calendar-42!');
    await member.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(member.getByRole('heading', { name: 'Set your personal password' })).toBeVisible();
    expect((await m.request.get('/api/state')).status()).toBe(403);
    await member.getByLabel('Current password', { exact: true }).fill('Temporary-calendar-42!');
    await member.getByLabel('New password', { exact: true }).fill('Personal-calendar-42!');
    await member.getByLabel('Confirm new password').fill('Personal-calendar-42!');
    await member.getByRole('button', { name: 'Update password', exact: true }).click();
    await member.locator('nav').getByRole('button', { name: 'My account', exact: true }).click();
    await member.getByLabel('Display name').fill('Taylor Calendar Updated');
    await member.getByRole('button', { name: 'Save profile' }).click();
    await expect(member.locator('.sidebar-user')).toContainText('Taylor Calendar Updated');
    await member.locator('nav').getByRole('button', { name: 'Timesheets', exact: true }).click();
    await member.getByRole('button', { name: 'Time off', exact: true }).click();
    await member.getByLabel('Work calendar month').fill('2027-03');
    await member.getByRole('button', { name: 'Work day 2027-03-16', exact: true }).click();
    await member.getByRole('button', { name: 'Request time off on this day' }).click();
    await member.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(member.getByRole('dialog')).toHaveCount(0);
    await expect(
      member.getByRole('button', { name: 'Work day 2027-03-16', exact: true }),
    ).toContainText('Pending');
    await page.locator('nav').getByRole('button', { name: 'Timesheets', exact: true }).click();
    await page.getByRole('button', { name: 'Time off', exact: true }).click();
    await page.reload();
    await page.locator('nav').getByRole('button', { name: 'Timesheets', exact: true }).click();
    await page.getByRole('button', { name: 'Time off', exact: true }).click();
    await page.getByLabel('Leave year', { exact: true }).selectOption('2027');
    await page
      .getByRole('row')
      .filter({ hasText: 'Taylor Calendar Updated' })
      .getByRole('button', { name: 'Approve leave' })
      .click();
    await member.reload();
    await member.locator('nav').getByRole('button', { name: 'Timesheets', exact: true }).click();
    await expect(member.getByLabel('Work calendar month')).toHaveValue('2027-03');
    await member.getByRole('button', { name: 'Work day 2027-03-16', exact: true }).click();
    await expect(member.getByRole('button', { name: 'Log time on this day' })).toBeDisabled();
    await expect(
      member.getByRole('button', { name: 'Work day 2027-03-16', exact: true }),
    ).toContainText('Annual · Off');
    await member.getByRole('button', { name: 'Work day 2027-03-22', exact: true }).click();
    await member.getByRole('button', { name: 'Fill working week' }).click();
    await member.getByLabel('Work description').fill('Product design delivery');
    await member.getByRole('button', { name: 'Fill remaining capacity' }).click();
    await member.getByRole('button', { name: 'Save week', exact: true }).click();
    await expect(member.getByRole('dialog')).toHaveCount(0);
    await expect(
      member.getByRole('button', { name: 'Work day 2027-03-22', exact: true }),
    ).toContainText('8h logged');
    await expect(member.getByLabel('Timesheet month')).toHaveValue('2027-03');
    await expect(member.getByText('40.0 h', { exact: true }).first()).toBeVisible();
    const state = await (await m.request.get('/api/state')).json();
    expect(
      state.timesheets.filter((t) => t.description === 'Product design delivery'),
    ).toHaveLength(5);
    await member.getByLabel('Color theme').selectOption('dark');
    await member.screenshot({ path: 'artifacts/workforce-calendar-dark.png', fullPage: true });
    await member.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => member.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await member.screenshot({ path: 'artifacts/workforce-calendar-mobile.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await m.close();
  }
});
