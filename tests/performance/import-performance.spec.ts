import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const fixturePath = resolve('tests/fixtures/generated-1k.zip');
const STEADY_STATE_LONG_TASK_LIMIT_MS = 300;

test('records synthetic import time and keeps steady-state analytics responsive', async ({ page }, testInfo) => {
  const fixture = await readFile(fixturePath);
  await page.goto('/');

  await page.addInitScript(() => {
    const durations: number[] = [];
    Object.defineProperty(window, '__cepLongTasks', {
      configurable: true,
      value: durations
    });
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) durations.push(entry.duration);
        });
        observer.observe({ type: 'longtask', buffered: true });
      } catch {
        // Long Tasks may be unavailable in some browser builds. The test records that case below.
      }
    }
  });

  await page.reload();
  const importStartedAt = Date.now();
  await page.getByLabel('Choose ChatGPT export ZIP').setInputFiles({
    name: 'generated-1k.zip',
    mimeType: 'application/zip',
    buffer: fixture
  });
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 90_000 });
  const importElapsedMs = Date.now() - importStartedAt;

  await page.evaluate(() => {
    const durations = (window as Window & { __cepLongTasks?: number[] }).__cepLongTasks;
    if (durations) durations.length = 0;
  });

  await page.getByRole('button', { name: 'Conversations' }).click();
  const scroll = page.locator('.virtual-scroll');
  await expect(scroll).toBeVisible();
  for (const scrollTop of [0, 2_000, 8_000, 16_000, 28_000, 4_000]) {
    await scroll.evaluate((node, top) => {
      node.scrollTop = top;
      node.dispatchEvent(new Event('scroll'));
    }, scrollTop);
    await page.waitForTimeout(50);
  }

  await page.getByRole('button', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(scroll).toBeVisible();

  const steadyState = await page.evaluate(() => {
    const durations = (window as Window & { __cepLongTasks?: number[] }).__cepLongTasks;
    return {
      supported: Array.isArray(durations),
      samples: durations ? [...durations] : [],
      maxDurationMs: durations && durations.length > 0 ? Math.max(...durations) : 0
    };
  });

  await testInfo.attach('performance-summary.json', {
    body: Buffer.from(JSON.stringify({
      conversations: 1000,
      importElapsedMs,
      steadyStateLongTasks: steadyState
    }, null, 2)),
    contentType: 'application/json'
  });

  expect(importElapsedMs).toBeGreaterThan(0);
  if (steadyState.supported && steadyState.samples.length > 0) {
    expect(steadyState.maxDurationMs).toBeLessThanOrEqual(STEADY_STATE_LONG_TASK_LIMIT_MS);
  }
});
