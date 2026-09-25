import { expect, test, type Download, type Page } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

const conversations = [
  {
    id: 'acceptance-alpha',
    title: 'Acceptance alpha',
    create_time: 1_797_100_000,
    update_time: 1_797_100_090,
    mapping: {
      user: {
        id: 'acceptance-alpha-user',
        parent: null,
        children: ['acceptance-alpha-assistant'],
        message: {
          id: 'acceptance-alpha-user-message',
          author: { role: 'user' },
          create_time: 1_797_100_000,
          content: { content_type: 'text', parts: ['Synthetic acceptance alpha prompt'] },
          metadata: { model_slug: 'gpt-6-sol', future_acceptance_flag: true }
        }
      },
      assistant: {
        id: 'acceptance-alpha-assistant',
        parent: 'acceptance-alpha-user',
        children: [],
        message: {
          id: 'acceptance-alpha-assistant-message',
          author: { role: 'assistant' },
          create_time: 1_797_100_090,
          content: { content_type: 'text', parts: ['Synthetic acceptance alpha response'] },
          metadata: { model_slug: 'gpt-6-sol', tool_name: 'web_search' }
        }
      }
    }
  },
  {
    id: 'acceptance-beta',
    title: 'Acceptance beta',
    create_time: 1_797_186_400,
    update_time: 1_797_186_460,
    mapping: {
      user: {
        id: 'acceptance-beta-user',
        parent: null,
        children: ['acceptance-beta-assistant'],
        message: {
          id: 'acceptance-beta-user-message',
          author: { role: 'user' },
          create_time: 1_797_186_400,
          content: { content_type: 'text', parts: ['Synthetic acceptance beta prompt'] },
          metadata: { model_slug: 'gpt-5.6-luna' }
        }
      },
      assistant: {
        id: 'acceptance-beta-assistant',
        parent: 'acceptance-beta-user',
        children: [],
        message: {
          id: 'acceptance-beta-assistant-message',
          author: { role: 'assistant' },
          create_time: 1_797_186_460,
          content: { content_type: 'text', parts: ['Synthetic acceptance beta response'] },
          metadata: { model_slug: 'gpt-5.6-luna', tool_name: 'python' }
        }
      }
    }
  }
];

async function expectDownload(page: Page, buttonName: string): Promise<Download> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename().length).toBeGreaterThan(0);
  return download;
}

test('walks the complete v1 local-only product and reloads persisted analysis', async ({ page }) => {
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify(conversations) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());
  const externalRequests: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('http://127.0.0.1:4173/') || url.startsWith('blob:') || url.startsWith('data:')) return;
    externalRequests.push(url);
  });

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'v1-acceptance-synthetic.zip',
    mimeType: 'application/zip',
    buffer
  });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 conversations/i)).toBeVisible();

  await expectDownload(page, 'Export JSON');
  await expectDownload(page, 'Export CSV');
  await expectDownload(page, 'Export Markdown');

  await page.getByRole('button', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
  await page.getByLabel('Timeline bucket').selectOption('hour');
  await expect(page.getByRole('list', { name: 'hour timeline' })).toBeVisible();

  await page.getByRole('button', { name: 'Models' }).click();
  await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
  await expect(page.getByText('gpt-6-sol', { exact: true })).toBeVisible();
  await expect(page.getByText('gpt-5.6-luna', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByRole('heading', { name: 'Conversations', exact: true })).toBeVisible();
  await page.getByLabel('Conversation model filter').fill('gpt-6-sol');
  await expect(page.getByText('Acceptance alpha', { exact: true })).toBeVisible();
  await page.getByLabel('Conversation model filter').fill('');
  await page.getByRole('checkbox', { name: 'Web' }).check();
  await expect(page.getByText('Acceptance alpha', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cost' }).click();
  await expect(page.getByRole('heading', { name: 'Cost', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calculate scenario' }).click();
  await expect(page.getByText('estimated', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tools' }).click();
  await expect(page.getByRole('heading', { name: 'Tools / Web', exact: true })).toBeVisible();
  await expect(page.getByText('web-search', { exact: true })).toBeVisible();
  await expect(page.getByText('python', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Data quality' }).click();
  await expect(page.getByRole('heading', { name: 'Data quality', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'future_acceptance_flag' })).toBeVisible();

  await page.getByRole('button', { name: 'Comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison', exact: true })).toBeVisible();
  await page.getByLabel('Work/Codex reported tokens').fill('321');
  await page.getByRole('button', { name: 'Save reported summary' }).click();
  await expect(page.getByText('reported', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByLabel('Model ID').fill('gpt-6-sol');
  await page.getByLabel('Effective from').fill('2026-09-01');
  await page.getByLabel('Input per million').fill('1.25');
  await page.getByLabel('Cached input per million').fill('0.25');
  await page.getByLabel('Output per million').fill('5.00');
  await page.getByRole('button', { name: 'Save local override' }).click();
  await expect(page.getByRole('status')).toHaveText(/saved local override/i);
  await expect(page.getByRole('list', { name: 'Local pricing history' })).toContainText('gpt-6-sol · 2026-09-01');

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('list', { name: 'Local pricing history' })).toContainText('gpt-6-sol · 2026-09-01');

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'v1-acceptance-synthetic.zip',
    mimeType: 'application/zip',
    buffer
  });
  await expect(page.getByText(/already exists locally/i)).toBeVisible();
  await page.getByRole('button', { name: 'Open existing' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByText(/2 conversations/i)).toBeVisible();

  expect(externalRequests).toEqual([]);
});
