import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

const hostileTitle = '=HYPERLINK("javascript:alert(1)") <script>window.__xss=1</script>';
const hostileBody = '<script>window.__xss=2</script> [unsafe](javascript:window.__xss=3) <img src=x onerror="window.__xss=4">';

const hostileConversation = {
  id: 'hostile-synthetic-1',
  title: hostileTitle,
  create_time: 1_797_000_000,
  update_time: 1_797_000_030,
  mapping: {
    user: {
      id: 'hostile-user',
      parent: null,
      children: ['hostile-assistant'],
      message: {
        id: 'hostile-user-message',
        author: { role: 'user' },
        create_time: 1_797_000_000,
        content: { content_type: 'text', parts: [hostileBody] },
        metadata: { model_slug: 'gpt-6-sol' }
      }
    },
    assistant: {
      id: 'hostile-assistant',
      parent: 'hostile-user',
      children: [],
      message: {
        id: 'hostile-assistant-message',
        author: { role: 'assistant' },
        create_time: 1_797_000_030,
        content: { content_type: 'text', parts: ['Synthetic safe response'] },
        metadata: { model_slug: 'gpt-6-sol', tool_name: 'web_search' }
      }
    }
  }
};

test('treats hostile export content as inert data and neutralizes CSV formulas', async ({ page }) => {
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify([hostileConversation]) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'hostile-synthetic.zip',
    mimeType: 'application/zip',
    buffer
  });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });

  expect(await page.evaluate(() => (window as Window & { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByText(hostileTitle, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Overview' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, 'utf8');

  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toMatch(/(?:^|\r?\n)conversation,=/);
  expect(await page.evaluate(() => (window as Window & { __xss?: number }).__xss)).toBeUndefined();
});
