import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

const syntheticConversation = {
  id: 'offline-conversation',
  title: 'Offline synthetic conversation',
  create_time: 1_790_000_000,
  update_time: 1_790_000_030,
  mapping: {
    user: {
      id: 'node-user',
      parent: null,
      children: ['assistant'],
      message: {
        id: 'message-user',
        author: { role: 'user' },
        create_time: 1_790_000_000,
        content: { content_type: 'text', parts: ['Offline synthetic user message'] },
        metadata: { model_slug: 'gpt-5.6' }
      }
    },
    assistant: {
      id: 'node-assistant',
      parent: 'user',
      children: [],
      message: {
        id: 'message-assistant',
        author: { role: 'assistant' },
        create_time: 1_790_000_030,
        content: { content_type: 'text', parts: ['Offline synthetic assistant response'] },
        metadata: { model_slug: 'gpt-5.6' }
      }
    }
  }
};

test('reloads from the service worker and imports while offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline service-worker cache verification is Chromium-only in Playwright.');

  await page.goto('/');
  await expect.poll(async () => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await navigator.serviceWorker.ready;
    return true;
  }), { timeout: 15_000 }).toBe(true);

  await page.reload();
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify([syntheticConversation]) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'offline-synthetic.zip',
    mimeType: 'application/zip',
    buffer
  });

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('1 conversation', { exact: true })).toBeVisible();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();
});
