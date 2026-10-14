import { test, expect } from '@playwright/test';
test.describe.configure({ mode: 'serial' });
test('workspace setup, every module, editing, export, administration and persistence', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Your name').fill('Alex Morgan');
  await page.getByLabel('Workspace setup key').fill('browser-test-setup-key');
  await page.getByLabel('Work email').fill('alex@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-42!');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ }),
  ).toBeVisible();
  await expect(
    page.getByText('Welcome to your connected workspace', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/dashboard.png', fullPage: true });
  for (const name of [
    'My Drive',
    'Writer',
    'Sheets',
    'Slides',
    'PDF & Sign',
    'Team space',
    'Projects',
    'Timesheets',
    'Time off',
    'Reports',
    'Administration',
    'Mail',
    'Calendar',
    'Connect',
  ]) {
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
  }
  await page.locator('nav').getByRole('button', { name: 'Writer', exact: true }).click();
  await page.getByRole('button', { name: 'Create new', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Browser test brief');
  await page.getByRole('button', { name: 'Create & open' }).click();
  await page.locator('.tiptap').fill('A document written during the browser test.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.getByRole('button', { name: /^Browser test brief/ }).click();
  await expect(page.locator('.tiptap')).toContainText(
    'A document written during the browser test.',
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Export document').selectOption('docx');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.docx');
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.locator('nav').getByRole('button', { name: 'Sheets', exact: true }).click();
  await page.getByRole('button', { name: /^Project budget/ }).click();
  await expect(page.getByLabel('Cell D6', { exact: true })).toHaveValue('16320');
  await page.getByLabel('Cell B2', { exact: true }).fill('30');
  await page.getByLabel('Cell A1', { exact: true }).click();
  await expect(page.getByLabel('Cell D2', { exact: true })).toHaveValue('2550');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.locator('nav').getByRole('button', { name: 'Slides', exact: true }).click();
  await page.getByRole('button', { name: /^A new way to work/ }).click();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('.presentation-mode')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.presentation-mode h1')).toContainText('Less friction');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.locator('nav').getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page.getByRole('button', { name: 'Log time', exact: true }).click();
  await page.getByLabel('What did you work on?').fill('Browser workflow validation');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Browser workflow validation').first()).toBeVisible();
  await page.locator('nav').getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByLabel('Channel message').fill('Hello from the browser test');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Hello from the browser test')).toBeVisible();
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await page.getByLabel('Message to assistant').fill('find budget');
  await page.getByRole('button', { name: 'Send to assistant' }).click();
  await expect(
    page.getByText('Workspace search (AI not configured)', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close assistant' }).click();
  await page.locator('nav').getByRole('button', { name: 'Administration', exact: true }).click();
  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Full name').fill('Jamie Lee');
  await page.getByLabel('Work email').fill('jamie@example.test');
  await page.getByLabel('Initial password').fill('Browser-member-password-42!');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Jamie Lee', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Audit log', exact: true }).click();
  await expect(page.getByText('Hash chain verified')).toBeVisible();
  await page.locator('nav').getByRole('button', { name: 'Overview', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('two users receive live messages and establish a WebRTC meeting', async ({ browser }) => {
  const admin = await browser.newContext({
      baseURL: 'http://127.0.0.1:3101',
      permissions: ['camera', 'microphone'],
    }),
    member = await browser.newContext({
      baseURL: 'http://127.0.0.1:3101',
      permissions: ['camera', 'microphone'],
    });
  try {
    const a = await (
      await admin.request.post('/api/login', {
        data: { email: 'alex@example.test', password: 'Browser-test-password-42!' },
      })
    ).json();
    const m = await (
      await member.request.post('/api/login', {
        data: { email: 'jamie@example.test', password: 'Browser-member-password-42!' },
      })
    ).json();
    const state = await (await admin.request.get('/api/state')).json(),
      channel = state.channels.find((c) => !c.projectId);
    const first = await admin.newPage(),
      second = await member.newPage();
    await Promise.all([first.goto('/'), second.goto('/')]);
    await expect(second.getByRole('heading', { name: 'Set your personal password' })).toBeVisible();
    await second
      .getByLabel('Current password', { exact: true })
      .fill('Browser-member-password-42!');
    await second.getByLabel('New password', { exact: true }).fill('Browser-personal-password-42!');
    await second.getByLabel('Confirm new password').fill('Browser-personal-password-42!');
    await second.getByRole('button', { name: 'Update password', exact: true }).click();
    for (const p of [first, second]) {
      await p.locator('nav').getByRole('button', { name: 'Connect', exact: true }).click();
      await p.getByRole('button', { name: channel.title, exact: true }).click();
    }
    await first.getByLabel('Channel message').fill('A live message between two accounts');
    await first.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(second.getByText('A live message between two accounts')).toBeVisible();
    const now = new Date(),
      later = new Date(now.getTime() + 3600000);
    const response = await admin.request.post('/api/entities/events', {
      headers: { 'x-csrf-token': a.csrf },
      data: {
        title: 'Two-person test meeting',
        start: now.toISOString(),
        end: later.toISOString(),
        attendees: [a.user.id, m.user.id],
        projectId: '',
      },
    });
    expect(response.status()).toBe(201);
    for (const p of [first, second]) {
      await p.reload();
      await p.locator('nav').getByRole('button', { name: 'Calendar', exact: true }).click();
      await p.getByRole('button', { name: 'Join meeting', exact: true }).click();
      await p.getByRole('button', { name: 'Enter meeting', exact: true }).click();
    }
    await expect(first.getByText('2 participant(s) connected')).toBeVisible({ timeout: 20000 });
    await expect(second.getByText('2 participant(s) connected')).toBeVisible({ timeout: 20000 });
    await first.getByRole('button', { name: 'Mute microphone' }).click();
    await expect(first.getByRole('button', { name: 'Unmute microphone' })).toBeVisible();
    await first.getByRole('button', { name: 'Turn camera off' }).click();
    await expect(first.getByRole('button', { name: 'Turn camera on' })).toBeVisible();
    // Supply a deterministic screen stream; WebRTC track replacement still runs through the real peer connection.
    await first.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d');
        context.fillStyle = '#245741';
        context.fillRect(0, 0, 640, 360);
        return canvas.captureStream(10);
      };
    });
    await first.getByRole('button', { name: 'Share screen', exact: true }).click();
    await expect(first.getByRole('button', { name: 'Stop sharing', exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'Stop sharing', exact: true }).click();
    await first.screenshot({ path: 'artifacts/meeting.png', fullPage: true });
    await first.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(second.getByText('1 participant(s) connected')).toBeVisible();
  } finally {
    await admin.close();
    await member.close();
  }
});
