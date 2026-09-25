import { expect, test } from '@playwright/test';
import { makeZip } from '../helpers/makeZip';

test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

function conversation(index: number) {
  const id = `ipad-${index.toString().padStart(3, '0')}`;
  const base = 1_790_000_000 + index * 60;
  const model = index % 2 === 0 ? 'gpt-6-sol' : 'gpt-5.6-sol';
  return {
    id,
    title: `iPad synthetic ${index}`,
    create_time: base,
    update_time: base + 30,
    mapping: {
      user: {
        id: `${id}-user`,
        parent: null,
        children: [`${id}-assistant`],
        message: {
          id: `${id}-m1`,
          author: { role: 'user' },
          create_time: base,
          content: { content_type: 'text', parts: [`Synthetic iPad user message ${index}`] },
          metadata: { model_slug: model }
        }
      },
      [`${id}-assistant`]: {
        id: `${id}-assistant`,
        parent: `${id}-user`,
        children: [],
        message: {
          id: `${id}-m2`,
          author: { role: 'assistant' },
          create_time: base + 30,
          content: { content_type: 'text', parts: [`Synthetic iPad assistant response ${index}`] },
          metadata: { model_slug: model }
        }
      }
    }
  };
}

async function expectNoHorizontalPageOverflow(page: import('@playwright/test').Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('keeps import and virtualized analytics usable on iPad portrait and landscape', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.brand-mark')).toBeHidden();
  await expect.poll(() => page.locator('.app-shell').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  await expect(page.getByLabel('Choose ChatGPT export ZIP')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  const payload = Array.from({ length: 160 }, (_, index) => conversation(index));
  const zip = await makeZip([{ name: 'conversations.json', text: JSON.stringify(payload) }]);
  const buffer = Buffer.from(await zip.arrayBuffer());
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'ipad-layout-synthetic.zip',
    mimeType: 'application/zip',
    buffer
  });

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByRole('heading', { name: 'Conversations', exact: true })).toBeVisible();
  await expect(page.getByLabel('Conversation model filter')).toBeVisible();
  await expect(page.getByLabel('Minimum tokens')).toBeVisible();
  await expect(page.getByLabel('Conversation sort')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  const virtualScroll = page.locator('.virtual-scroll');
  await expect(virtualScroll).toBeVisible();
  await virtualScroll.evaluate((node) => { node.scrollTop = 1400; node.dispatchEvent(new Event('scroll')); });
  await expect(page.getByText(/iPad synthetic \d+/).first()).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.brand-mark')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible();
});
