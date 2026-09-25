import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PricingEditor } from '../../src/features/settings/PricingEditor';
import { BUILT_IN_PRICING_V1 } from '../../src/data/pricing.v1';
import { openProfilerDb, PROFILER_DB_NAME } from '../../src/storage/db';

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

afterEach(resetDb);

describe('PricingEditor', () => {
  it('persists local pricing overrides separately without mutating built-in pricing', async () => {
    const originalLength = BUILT_IN_PRICING_V1.length;
    const originalFirst = { ...BUILT_IN_PRICING_V1[0] };
    const user = userEvent.setup();
    render(<PricingEditor />);

    await user.type(screen.getByLabelText('Model ID'), 'future-model-x');
    await user.type(screen.getByLabelText('Effective from'), '2026-10-01');
    await user.type(screen.getByLabelText('Input per million'), '3');
    await user.type(screen.getByLabelText('Cached input per million'), '0.3');
    await user.type(screen.getByLabelText('Output per million'), '15');
    await user.click(screen.getByRole('button', { name: 'Save local override' }));

    expect(await screen.findByText(/saved local override/i)).toBeVisible();
    expect(BUILT_IN_PRICING_V1).toHaveLength(originalLength);
    expect(BUILT_IN_PRICING_V1[0]).toEqual(originalFirst);

    const db = await openProfilerDb();
    const records = await db.getAll('pricingHistory');
    db.close();
    expect(records).toHaveLength(1);
    expect(records[0]?.value).toMatchObject({
      model: 'future-model-x',
      effectiveFrom: '2026-10-01',
      inputPerMillion: 3,
      cachedInputPerMillion: 0.3,
      outputPerMillion: 15,
      source: 'local user override'
    });
  });

  it('rejects negative local prices', async () => {
    const user = userEvent.setup();
    render(<PricingEditor />);
    await user.type(screen.getByLabelText('Model ID'), 'future-model-x');
    await user.type(screen.getByLabelText('Effective from'), '2026-10-01');
    await user.type(screen.getByLabelText('Input per million'), '-1');
    await user.type(screen.getByLabelText('Cached input per million'), '0.1');
    await user.type(screen.getByLabelText('Output per million'), '1');
    await user.click(screen.getByRole('button', { name: 'Save local override' }));

    expect(await screen.findByText(/prices must be non-negative/i)).toBeVisible();
  });
});
