import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGateway } from '../../scripts/studio-ai-gateway.mjs';

test('OpenAI settings pair with the real gateway, select a model and keep keys out of browser storage', async ({
  page,
  baseURL,
}) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-ai-browser-'));
  const calls = [];
  const gateway = createGateway({
    directory: dir,
    origins: [new URL(baseURL).origin],
    settingsOptions: {
      env: {},
      request: async (url, options) => {
        expect(options.headers.Authorization).toBe('Bearer sk-browser-fixture-only');
        if (url.endsWith('/models'))
          return Response.json({ data: [{ id: 'fixture-chat' }, { id: 'fixture-vision' }] });
        const body = JSON.parse(options.body);
        calls.push(body);
        const done = body.messages.some((m) => m.role === 'tool');
        return Response.json({
          choices: [
            {
              message: done
                ? { content: 'The selected model searched your workspace.' }
                : {
                    tool_calls: [
                      {
                        id: 'search-1',
                        type: 'function',
                        function: { name: 'workspace_search', arguments: '{"query":"Revenue"}' },
                      },
                    ],
                  },
            },
          ],
        });
      },
    },
  });
  gateway.server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    gateway.server.once('listening', resolve);
    gateway.server.once('error', reject);
  });
  try {
    // Isolate the real test gateway from any operator gateway already using 3210.
    const gatewayOrigin = `http://127.0.0.1:${gateway.server.address().port}`;
    await page.route('http://127.0.0.1:3210/**', async (route) => {
      const response = await route.fetch({
        url: route.request().url().replace('http://127.0.0.1:3210', gatewayOrigin),
      });
      await route.fulfill({ response });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Writer From/ }).click();
    await page.getByRole('textbox', { name: 'Document body' }).fill('Revenue is 420.');
    await page.getByRole('button', { name: 'Open floating assistant' }).click();
    await page.getByRole('button', { name: 'Configure local AI' }).click();
    await page.getByLabel('AI provider').selectOption('openai');
    await page
      .getByLabel('Gateway pairing code')
      .fill(readFileSync(gateway.tokenFile, 'utf8').trim());
    await page.getByRole('button', { name: 'Connect gateway', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Connected');
    await page.getByLabel('OpenAI API key').fill('sk-browser-fixture-only');
    await page.getByRole('button', { name: 'Load models', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('2 models loaded');
    await expect(page.locator('#studio-ai-models option')).toHaveCount(2);
    await page.getByLabel('AI model', { exact: true }).fill('fixture-chat');
    await page.screenshot({ path: 'artifacts/studio-ai-settings.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Save AI settings', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const storage = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    expect(storage).not.toContain('sk-browser-fixture-only');
    await page.getByLabel('Message to assistant').fill('Find revenue');
    await page.getByRole('button', { name: 'Run assistant tool' }).click();
    await expect(page.getByRole('complementary', { name: 'Workspace assistant' })).toContainText(
      'The selected model searched',
    );
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.model === 'fixture-chat' && c.max_completion_tokens === 3000)).toBe(
      true,
    );
    await page.reload();
    await page.getByRole('button', { name: 'Open floating assistant' }).click();
    await page.getByRole('button', { name: 'Configure local AI' }).click();
    await expect(page.getByLabel('OpenAI API key')).toHaveValue('');
    await expect(page.getByLabel('AI model', { exact: true })).toHaveValue('fixture-chat');
    await page.getByRole('button', { name: 'Connect gateway', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('API key saved on server');
    await page.getByRole('button', { name: 'Remove saved API key', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('API key removed');
    expect(gateway.settings.publicConfig().hasKey).toBe(false);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
