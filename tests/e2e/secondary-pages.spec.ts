import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

const syntheticConversation = {
  id: 'secondary-synthetic-1',
  title: 'Secondary synthetic',
  create_time: 1_796_000_000,
  update_time: 1_796_000_060,
  mapping: {
    user: {
      id: 'secondary-user',
      parent: null,
      children: ['secondary-assistant'],
      message: {
        id: 'secondary-user-message',
        author: { role: 'user' },
        create_time: 1_796_000_000,
        content: { content_type: 'text', parts: ['Synthetic secondary user'] },
        metadata: { model_slug: 'gpt-6-sol', future_schema_flag: true }
      }
    },
    assistant: {
      id: 'secondary-assistant',
      parent: 'secondary-user',
      children: [],
      message: {
        id: 'secondary-assistant-message',
        author: { role: 'assistant' },
        create_time: 1_796_000_060,
        content: { content_type: 'text', parts: ['Synthetic secondary assistant'] },
        metadata: { model_slug: 'gpt-6-sol', tool_name: 'web_search', recipient: 'mystery_tool' }
      }
    }
  }
};

const aliasConversation = {
  id: 'alias-synthetic-1',
  title: 'Alias synthetic',
  create_time: 1_796_000_100,
  update_time: 1_796_000_120,
  mapping: {
    user: {
      id: 'alias-user',
      parent: null,
      children: [],
      message: {
        id: 'alias-user-message',
        author: { role: 'user' },
        create_time: 1_796_000_100,
        content: { content_type: 'text', parts: ['Synthetic alias user'] },
        metadata: { model_slug: 'future-alias-model' }
      }
    }
  }
};

test('opens cost, tools, quality, comparison, and settings after local import', async ({ page }) => {
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify([syntheticConversation]) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'secondary-pages.zip',
    mimeType: 'application/zip',
    buffer
  });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Cost' }).click();
  await expect(page.getByRole('heading', { name: 'Cost', exact: true })).toBeVisible();
  await expect(page.getByText('Visible-token API-equivalent cost', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calculate scenario' }).click();
  await expect(page.getByText('estimated', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tools' }).click();
  await expect(page.getByRole('heading', { name: 'Tools / Web', exact: true })).toBeVisible();
  await expect(page.getByText('web-search', { exact: true })).toBeVisible();
  await expect(page.getByText('mystery_tool', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Data quality' }).click();
  await expect(page.getByRole('heading', { name: 'Data quality', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'future_schema_flag' })).toBeVisible();

  await page.getByRole('button', { name: 'Comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison', exact: true })).toBeVisible();
  await page.getByLabel('Work/Codex reported tokens').fill('123');
  await page.getByRole('button', { name: 'Save reported summary' }).click();
  await expect(page.getByText('reported', { exact: true })).toBeVisible();
  await expect(page.getByText(/measurement semantics differ/i)).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Performance profile', { exact: true })).toBeVisible();
  await expect(page.getByText('Local pricing overrides', { exact: true })).toBeVisible();
  await expect(page.getByText('Storage', { exact: true })).toBeVisible();
});

test('applies a saved local model alias to the next import', async ({ page }) => {
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify([aliasConversation]) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Raw model alias').fill('future-alias-model');
  await page.getByLabel('Canonical model ID').fill('gpt-6-sol');
  await page.getByRole('button', { name: 'Save model alias' }).click();
  await expect(page.getByText(/saved local model alias/i)).toBeVisible();

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'alias-export.zip',
    mimeType: 'application/zip',
    buffer
  });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Models' }).click();

  const row = page.getByRole('row').filter({ hasText: 'future-alias-model' });
  await expect(row).toContainText('gpt-6-sol');
});
