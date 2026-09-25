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

  await page.waitForTimeout(2_000);
  const workers = page.workers().map((worker) => worker.url());
  const databaseState = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chatgpt-export-profiler');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const readAll = <T,>(storeName: string) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });

    const [analyses, checkpoints, conversationMetrics] = await Promise.all([
      readAll<{ status?: string }>('analyses'),
      readAll<unknown>('checkpoints'),
      readAll<unknown>('conversationMetrics')
    ]);
    db.close();
    return {
      analysisStatuses: analyses.map((analysis) => analysis.status ?? 'unknown'),
      checkpointCount: checkpoints.length,
      conversationMetricCount: conversationMetrics.length
    };
  });

  console.log('WORKERS', JSON.stringify(workers));
  console.log('DB_STATE', JSON.stringify(databaseState));
  console.log('PAGE_ERRORS', JSON.stringify(pageErrors));
  console.log('BODY_AFTER_2S', JSON.stringify(await page.locator('body').innerText()));

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1 conversation/i)).toBeVisible();
  await expect(page.getByText(/2 messages/i)).toBeVisible();
});
