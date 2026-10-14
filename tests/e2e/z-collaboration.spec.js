import { test, expect } from '@playwright/test';
test.use({ actionTimeout: 10000 });

test('channels, group membership, external onboarding, provider links and administrator review work in the UI', async ({
  browser,
}) => {
  const admin = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  const external = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  try {
    await admin.request.post('/api/login', {
      data: { email: 'alex@example.test', password: 'Browser-test-password-42!' },
    });
    const page = await admin.newPage();
    await page.goto('/');
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Connect', exact: true })
      .click();
    await page.getByRole('button', { name: 'New channel', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Conversation name').fill('Partner launch');
    await dialog.getByLabel('Category', { exact: true }).fill('Client work');
    await dialog.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Partner launch', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Invite external', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Guest email').fill('external@partner.example');
    await dialog.getByLabel('Guest company').fill('Partner Studio');
    await dialog.getByRole('button', { name: 'Create invitation link' }).click();
    await expect(dialog.getByLabel('Invitation link', { exact: true })).toHaveValue(/#invite=/);
    const invitation = await dialog.getByLabel('Invitation link', { exact: true }).inputValue();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const guest = await external.newPage();
    await guest.goto(invitation);
    await guest.getByLabel('Your name').fill('Partner Designer');
    await guest.getByLabel('Choose a password').fill('External-browser-password-42!');
    await guest.getByRole('checkbox').check();
    await guest.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Partner launch', exact: true })).toBeVisible();
    await expect(guest.locator('.guest-workspace > header')).toContainText('Partner Studio');
    await expect(guest.getByRole('button', { name: 'Invite external', exact: true })).toHaveCount(
      0,
    );
    await expect(guest.locator('.chat-policy')).toContainText('administrators can review');
    expect((await external.request.get('/api/organisation')).status()).toBe(403);
    await guest
      .getByRole('textbox', { name: 'Channel message', exact: true })
      .fill('Partner collaboration works');
    await guest.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Partner collaboration works', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Teams / Meet', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Meeting title').fill('Partner Google meeting');
    await dialog.getByLabel('Meeting link').fill('https://meet.google.com/abc-defg-hij');
    await dialog.getByRole('button', { name: 'Share meeting', exact: true }).click();
    await expect(guest.getByRole('link', { name: /Join Google Meet/ })).toHaveAttribute(
      'href',
      'https://meet.google.com/abc-defg-hij',
    );
    await expect(guest.getByRole('link', { name: /Join Google Meet/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: 'artifacts/chat-groups.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Review conversations', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByRole('combobox', { name: 'Conversation', exact: true })
      .selectOption({ label: 'Partner launch · group' });
    await dialog.getByLabel('Reason for review').fill('Verify partner onboarding conversation');
    await dialog.getByRole('button', { name: 'Open audited review' }).click();
    await expect(dialog.getByText('Partner collaboration works', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Participants', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: /Partner Designer/ }).uncheck();
    await dialog.getByRole('button', { name: 'Save participants' }).click();
    await expect(guest.getByText('Partner collaboration works', { exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'New channel', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Conversation name').fill('Engineering updates');
    await dialog.getByLabel('Conversation type').selectOption('workspace');
    await dialog.getByLabel('Category', { exact: true }).fill('Engineering');
    await dialog.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Engineering updates', exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole('button', { name: 'Engineering updates', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Show workspace conversations', exact: true }).click();
    await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'artifacts/chat-channels-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  } finally {
    await Promise.allSettled([admin.close(), external.close()]);
  }
});
