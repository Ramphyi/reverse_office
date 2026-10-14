import { test, expect } from '@playwright/test';

test('public project page and bilingual guide explain modules without accessing private workspace data', async ({
  page,
}) => {
  const apiRequests = [],
    errors = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Toată munca ta.');
  await expect(page.getByRole('link', { name: 'Intră în workspace' })).toHaveAttribute(
    'href',
    '/?app=home',
  );
  await page.screenshot({ path: 'artifacts/landing-desktop.png' });
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('All your work.');
  await page.getByRole('link', { name: 'Sheets', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Sheets', exact: true })).toBeVisible();
  await expect(page.locator('.guide-chapter')).toContainText('=SUM(B2:B5)');
  await page.locator('.guide-steps input').first().check();
  await page.reload();
  await expect(page.locator('.guide-steps input').first()).toBeChecked();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: 'RO', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ghidul Reverse Office');
  await expect(page.locator('.guide-chapter')).toContainText('Organizează date');
  await page.getByLabel('Caută în ghid').fill('concediu');
  await expect(page.getByRole('navigation', { name: 'Capitole tutorial' })).toContainText(
    'Timesheets & Time off',
  );
  await page.getByLabel('Caută în ghid').fill('no-such-chapter-932');
  await expect(page.getByRole('heading', { name: 'Niciun capitol găsit' })).toBeVisible();
  await page.getByRole('button', { name: 'Arată toate capitolele' }).click();
  await page.getByRole('button', { name: 'Resetează', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Color theme').selectOption('dark');
  await page.screenshot({ path: 'artifacts/guide-mobile-dark.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/welcome');
  await expect(page.locator('.site-map-apps a').first()).toHaveCSS(
    'background-color',
    'rgb(18, 30, 25)',
  );
  await page.screenshot({ path: 'artifacts/landing-mobile-dark.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
