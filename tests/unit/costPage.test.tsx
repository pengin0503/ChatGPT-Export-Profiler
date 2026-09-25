import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostPage } from '../../src/features/cost/CostPage';
import { openProfilerDb, PROFILER_DB_NAME, type AnalysisOwnedRecord } from '../../src/storage/db';

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

async function seedModels(): Promise<void> {
  const records: AnalysisOwnedRecord[] = [
    {
      analysisId: 'analysis-cost',
      localKey: '1:gpt-6-sol',
      value: {
        modelId: 'gpt-6-sol',
        messages: 2,
        conversations: 1,
        visibleTokens: 1_500_000,
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        otherTokens: 0,
        rawAliases: ['gpt-6-sol'],
        firstTimestamp: Date.parse('2026-09-24T00:00:00Z') / 1000,
        lastTimestamp: Date.parse('2026-09-24T00:10:00Z') / 1000
      }
    },
    {
      analysisId: 'analysis-cost',
      localKey: '2:gpt-6-luna',
      value: {
        modelId: 'gpt-6-luna',
        messages: 1,
        conversations: 1,
        visibleTokens: 300,
        inputTokens: 200,
        outputTokens: 100,
        otherTokens: 0,
        rawAliases: ['gpt-6-luna'],
        firstTimestamp: Date.parse('2026-09-01T00:00:00Z') / 1000,
        lastTimestamp: Date.parse('2026-09-01T00:01:00Z') / 1000
      }
    }
  ];
  const db = await openProfilerDb();
  const tx = db.transaction('modelMetrics', 'readwrite');
  for (const record of records) await tx.store.put(record);
  await tx.done;
  db.close();
}

afterEach(resetDb);

describe('CostPage', () => {
  it('separates calculated visible-token cost, estimated scenarios, and historical coverage gaps', async () => {
    await seedModels();
    const user = userEvent.setup();
    render(<CostPage analysisId="analysis-cost" />);

    expect(await screen.findByText('Visible-token API-equivalent cost')).toBeVisible();
    expect(screen.getByText('calculated')).toBeVisible();
    expect(screen.getByText(/coverage gap/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Calculate scenario' }));
    expect(await screen.findByText('estimated')).toBeVisible();
    expect(screen.getByText(/assumptions/i)).toBeVisible();
  });

  it('rejects invalid scenario ratios before calculation', async () => {
    await seedModels();
    const user = userEvent.setup();
    render(<CostPage analysisId="analysis-cost" />);

    const cacheRatio = await screen.findByLabelText('Cache ratio');
    await user.clear(cacheRatio);
    await user.type(cacheRatio, '1.2');
    await user.click(screen.getByRole('button', { name: 'Calculate scenario' }));

    expect(await screen.findByText(/cache ratio must be between 0 and 1/i)).toBeVisible();
  });
});
