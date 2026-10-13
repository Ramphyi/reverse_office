import { test, expect } from '@playwright/test';
test('Romania company, customer, invoice issue, UBL, payment, print and mobile', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByLabel('Work email').fill('alex@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-42!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'Billing · RO', exact: true }).click();
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByRole('button', { name: 'Edit company details' }).click();
  async function fillParty(name, cui) {
    await page.getByLabel('Legal name', { exact: true }).fill(name);
    await page.getByLabel('CUI', { exact: true }).fill(cui);
    await page.getByLabel('Street address').fill('Strada Independenței 10');
    await page.getByLabel('City', { exact: true }).fill('Cluj-Napoca');
    await page.getByLabel('County code').fill('RO-CJ');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await fillParty('Atelier Digital SRL', '12345678');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer' }).click();
  await fillParty('Client Demo SRL', '23456789');
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.getByRole('button', { name: 'New invoice', exact: true }).click();
  await page.getByLabel('Partner', { exact: true }).selectOption({ label: 'Client Demo SRL' });
  await page.getByLabel('Line 1 description').fill('Consultanță și dezvoltare');
  await page.getByLabel('Line 1 quantity').fill('8');
  await page.getByLabel('Line 1 price').fill('250');
  await page.getByLabel('Line 1 VAT').fill('21');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Draft invoice', exact: true }).click();
  await page.getByRole('button', { name: 'Issue invoice', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /RO-\d{4}-00001/, level: 2 }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'UBL XML' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/RO-\d{4}-00001.xml/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.ro-invoice-print')).toBeVisible();
  await expect(page.locator('.ro-banner')).toBeHidden();
  await page.pdf({ path: 'artifacts/invoice.pdf', format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('500');
  await page.getByLabel('Bank reference').fill('PAYMENT-UI-1');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'RON 1,920.00', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/billing.png', fullPage: true });
  await page.getByRole('button', { name: 'SPV', exact: true }).click();
  await expect(page.getByRole('button', { name: /Connect ANAF/ })).toBeDisabled();
  await expect(page.getByText('Account not connected', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'artifacts/billing-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
