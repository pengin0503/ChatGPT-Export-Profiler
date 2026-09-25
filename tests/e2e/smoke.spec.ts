import { expect, test } from '@playwright/test';

test('renders the local-only application shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ChatGPT Export Profiler' })).toBeVisible();
  await expect(page.getByTestId('privacy-copy')).toContainText('local');
  await expect(page.getByTestId('privacy-copy')).toContainText('API key');
});
