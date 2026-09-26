import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateRangeFilter } from '../../src/components/DateRangeFilter';
import { OverviewPage } from '../../src/features/overview/OverviewPage';
import { ConversationsPage } from '../../src/features/conversations/ConversationsPage';
import { TimelinePage } from '../../src/features/timeline/TimelinePage';
import { I18nContext, t as translate } from '../../src/i18n';
import { PROFILER_DB_NAME } from '../../src/storage/db';

function renderEnglish(ui: React.ReactNode) {
  return render(
    <I18nContext.Provider value={{ locale: 'en', setLocale: vi.fn(), t: (key) => translate(key, 'en') }}>
      {ui}
    </I18nContext.Provider>
  );
}

async function resetDb(): Promise<void> {
  cleanup();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});

describe('remaining v1 analytics controls', () => {
  it('supports an explicit custom date range', () => {
    const onChange = vi.fn();
    renderEnglish(<DateRangeFilter value="custom" onChange={onChange} now={1_800_000_000} />);
    expect(screen.getByRole('option', { name: 'Custom range' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-30' } });
    expect(onChange).toHaveBeenLastCalledWith('custom', {
      from: Date.parse('2026-09-01T00:00:00.000Z') / 1000,
      to: Date.parse('2026-10-01T00:00:00.000Z') / 1000
    });
  });

  it('shows the required estimated-processing and visible-cost overview metrics', async () => {
    renderEnglish(<OverviewPage analysisId="synthetic-overview-v1" />);
    expect(screen.getByText('Estimated processing tokens')).toBeVisible();
    expect(screen.getByText('Visible-token API-equivalent cost')).toBeVisible();
  });

  it('exposes date/max-token filters and API-equivalent cost in conversations', async () => {
    renderEnglish(<ConversationsPage analysisId="synthetic-conversations-v1" />);
    expect(screen.getByText('Maximum tokens')).toBeVisible();
    expect(screen.getByLabelText('From date')).toBeVisible();
    expect(screen.getByLabelText('To date')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Cost ↓' })).toBeVisible();
    expect(await screen.findByRole('columnheader', { name: 'API-equivalent cost' })).toBeVisible();
  });

  it('exposes API-equivalent cost, web searches, and tool events on the timeline', () => {
    renderEnglish(<TimelinePage analysisId="synthetic-timeline-v1" />);
    expect(screen.getByRole('option', { name: 'API-equivalent cost' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Web searches' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Tool events' })).toBeVisible();
  });
});
