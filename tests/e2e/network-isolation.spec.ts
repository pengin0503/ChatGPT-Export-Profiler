import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

const syntheticConversation = {
  id: 'network-isolation-conversation',
  title: 'Network isolation synthetic conversation',
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

test('analysis import never contacts an external origin', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required.');
  const appOrigin = new URL(baseURL).origin;
  const unexpectedRequests: string[] = [];

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: () => {
        throw new Error('navigator.sendBeacon must not be used by the profiler.');
      }
    });

    class ForbiddenWebSocket {
      constructor() {
        throw new Error('WebSocket must not be used by the profiler.');
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: ForbiddenWebSocket
    });
  });

  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== appOrigin) {
      unexpectedRequests.push(request.url());
    }
  });

  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify([syntheticConversation]) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());

  await page.goto('/');
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'network-isolation-synthetic.zip',
    mimeType: 'application/zip',
    buffer
  });

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(unexpectedRequests).toEqual([]);
});
