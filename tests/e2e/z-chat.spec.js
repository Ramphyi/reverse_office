import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('manager assignment, private rich chat, folder uploads, audio calls and camera upgrade work between accounts', async ({
  browser,
}) => {
  const admin = await browser.newContext({
    baseURL: 'http://127.0.0.1:3101',
    permissions: ['camera', 'microphone'],
  });
  const recipient = await browser.newContext({
    baseURL: 'http://127.0.0.1:3101',
    permissions: ['camera', 'microphone'],
  });
  const directory = mkdtempSync(path.join(tmpdir(), 'chat-folder-'));
  writeFileSync(path.join(directory, 'notes.txt'), 'Folder attachment contents');
  try {
    const auth = await (
      await admin.request.post('/api/login', {
        data: { email: 'alex@example.test', password: 'Browser-test-password-42!' },
      })
    ).json();
    const first = await admin.newPage();
    await first.goto('/');
    await first
      .getByRole('navigation')
      .getByRole('button', { name: 'Administration', exact: true })
      .click();
    await first.getByRole('button', { name: 'Add person', exact: true }).click();
    const form = first.getByRole('dialog');
    await form.getByLabel('Full name').fill('Chat Teammate');
    await form.getByLabel('Reports to').selectOption(auth.user.id);
    await form.getByLabel('Work email').fill('chatmate@example.test');
    await form
      .getByLabel('Initial password (minimum 12 characters)')
      .fill('Chat-browser-password-42!');
    await form.getByLabel('Require password change at first sign-in').uncheck();
    await form.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(form).toHaveCount(0);
    await first.getByLabel('Account status filter').selectOption('team');
    await expect(first.getByRole('row').filter({ hasText: 'chatmate@example.test' })).toContainText(
      auth.user.name,
    );
    const login = await (
      await recipient.request.post('/api/login', {
        data: { email: 'chatmate@example.test', password: 'Chat-browser-password-42!' },
      })
    ).json();
    expect(login.user.managerId).toBe(auth.user.id);
    const second = await recipient.newPage();
    await second.goto('/');
    for (const page of [first, second])
      await page
        .getByRole('navigation')
        .getByRole('button', { name: 'Connect', exact: true })
        .click();
    await second.getByRole('button', { name: 'Chat with my manager' }).click();
    await first.getByLabel('Start private chat').selectOption(login.user.id);
    await first
      .getByLabel('Channel message')
      .fill(
        '**Milestone**\n```js\nconst total = 42;\n```\n![tracker](https://invalid.example/image.png)\n<script>window.chatInjection=1</script>',
      );
    await first.getByRole('button', { name: 'Choose emoji' }).click();
    await first.getByRole('button', { name: 'Insert 👋', exact: true }).click();
    await first.getByLabel('Attach GIF', { exact: true }).setInputFiles({
      name: 'reaction.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
    });
    await expect(
      first.getByRole('button', { name: 'Remove attachment reaction.gif' }),
    ).toBeVisible();
    await first.getByLabel('Attach chat folder', { exact: true }).setInputFiles(directory);
    await expect(first.getByRole('button', { name: 'Remove attachment notes.txt' })).toBeVisible();
    await first.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      second.locator('.chat-markdown strong').filter({ hasText: 'Milestone' }),
    ).toBeVisible();
    await expect(second.locator('.chat-markdown pre')).toContainText('const total = 42');
    await expect(second.getByAltText('reaction.gif')).toBeVisible();
    await expect(second.locator('.chat-attachment').filter({ hasText: 'notes.txt' })).toBeVisible();
    await expect(second.locator('.chat-markdown img')).toHaveCount(0);
    expect(await second.evaluate(() => window.chatInjection)).toBeUndefined();
    await first.screenshot({ path: 'artifacts/rich-chat.png', animations: 'disabled' });
    await first.getByRole('button', { name: 'Start audio call' }).click();
    await expect(second.getByRole('dialog', { name: 'Incoming call' })).toBeVisible();
    await first.getByRole('button', { name: 'Enter meeting', exact: true }).click();
    await second.getByRole('button', { name: 'Accept call', exact: true }).click();
    await second.getByRole('button', { name: 'Enter meeting', exact: true }).click();
    for (const page of [first, second]) {
      await expect(page.getByText('2 participant(s) connected')).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: 'Turn camera on' })).toBeVisible();
    }
    await first.getByRole('button', { name: 'Turn camera on' }).click();
    await expect(first.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
    await expect
      .poll(
        () =>
          second
            .locator('.video-tile video')
            .evaluateAll((videos) => videos.some((v) => !v.muted && v.videoWidth > 0)),
        { timeout: 15000 },
      )
      .toBe(true);
    await first.getByRole('button', { name: 'Mute microphone' }).click();
    await expect(first.getByRole('button', { name: 'Unmute microphone' })).toBeVisible();
    await first.screenshot({ path: 'artifacts/chat-audio-to-video.png', animations: 'disabled' });
    await first.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Leave', exact: true })).toHaveCount(0);
    await first
      .getByRole('navigation')
      .getByRole('button', { name: 'My account', exact: true })
      .click();
    await first.getByRole('button', { name: 'Refresh devices', exact: true }).click();
    const mic = first.getByLabel('Preferred microphone');
    await expect.poll(() => mic.locator('option').count()).toBeGreaterThan(1);
    const micId = await mic.locator('option').nth(1).getAttribute('value');
    await mic.selectOption(micId);
    await first.getByRole('button', { name: 'Test microphone', exact: true }).click();
    await expect(first.getByLabel('Microphone level')).toBeVisible();
    await first.getByRole('button', { name: 'Stop microphone test', exact: true }).click();
    await first.getByRole('button', { name: 'Save device preferences', exact: true }).click();
    await expect(
      first.getByText('Audio and video preferences saved.', { exact: false }),
    ).toBeVisible();
    await first.reload();
    await first
      .getByRole('navigation')
      .getByRole('button', { name: 'My account', exact: true })
      .click();
    await expect(first.getByLabel('Preferred microphone')).toHaveValue(micId);
    await first.screenshot({ path: 'artifacts/media-preferences.png', animations: 'disabled' });
  } finally {
    await admin.close();
    await recipient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
