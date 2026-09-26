import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

function conversation(id: string, title: string, model: string, offset: number) {
  const base = 1_790_000_000 + offset;
  return {
    id,
    title,
    create_time: base,
    update_time: base + 30,
    mapping: {
      user: {
        id: `${id}-user`, parent: null, children: [`${id}-assistant`],
        message: { id: `${id}-m1`, author: { role: 'user' }, create_time: base, content: { content_type: 'text', parts: [`Synthetic user ${id}`] }, metadata: { model_slug: model } }
      },
      [`${id}-assistant`]: {
        id: `${id}-assistant`, parent: `${id}-user`, children: [],
        message: { id: `${id}-m2`, author: { role: 'assistant' }, create_time: base + 30, content: { content_type: 'text', parts: [`Synthetic assistant ${id}`] }, metadata: { model_slug: model } }
      }
    }
  };
}

test('navigates bounded analytics pages after local import', async ({ page }) => {
  const payload = [
    conversation('c-a', 'Synthetic Alpha', 'gpt-6-sol', 0),
    conversation('c-b', 'Synthetic Beta', 'gpt-5.6-sol', 86_400)
  ];
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify(payload) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({ name: 'analytics.zip', mimeType: 'application/zip', buffer });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2 conversations', { exact: true })).toBeVisible();
  await expect(page.getByText('4 messages', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Models' }).click();
  await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'gpt-6-sol', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'gpt-5.6-sol', exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'day timeline' })).toBeVisible();

  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByRole('heading', { name: 'Conversations', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Alpha')).toBeVisible();
  await page.getByText('Synthetic Alpha').click();
  await expect(page.getByText(/Full conversation text is not persisted/i)).toBeVisible();
});

test('persists tokenization coverage and applies one duplicate-conversation policy to all analytics', async ({ page }) => {
  const payload = [
    conversation('c-duplicate', 'First duplicate', 'gpt-6-sol', 0),
    conversation('c-duplicate', 'Second duplicate', 'gpt-6-sol', 60)
  ];
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify(payload) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({ name: 'duplicate.zip', mimeType: 'application/zip', buffer });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('1 conversation', { exact: true })).toBeVisible();
  await expect(page.getByText('2 messages', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Models' }).click();
  const modelRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'gpt-6-sol', exact: true }) });
  await expect(modelRow.getByRole('cell').nth(3)).toHaveText('2');
  await expect(modelRow.getByRole('cell').nth(4)).toHaveText('1');

  await page.getByRole('button', { name: 'Data Quality' }).click();
  await expect(page.getByText('Tokenization: 100.0% (2/2)', { exact: true })).toBeVisible();
});
