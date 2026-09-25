import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

const syntheticConversation = {
  id: 'synthetic-conversation-1',
  title: 'Synthetic conversation',
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
        content: { content_type: 'text', parts: ['Synthetic user message'] },
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
        content: { content_type: 'text', parts: ['Synthetic assistant response'] },
        metadata: { model_slug: 'gpt-5.6' }
      }
    }
  }
};

test('imports a synthetic export locally and opens Overview', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify([syntheticConversation]) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'synthetic-export.zip',
    mimeType: 'application/zip',
    buffer
  });

  try {
    await expect
      .poll(() => page.locator('body').innerText(), { timeout: 30_000 })
      .toContain('Overview');
  } catch (error) {
    console.log('PAGE_ERRORS', JSON.stringify(pageErrors));
    console.log('FINAL_BODY', JSON.stringify(await page.locator('body').innerText()));
    throw error;
  }

  await expect(page.getByText(/1 conversation/i)).toBeVisible();
  await expect(page.getByText(/2 messages/i)).toBeVisible();
});
