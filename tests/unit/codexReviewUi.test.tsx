import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nContext, t as translate } from '../../src/i18n';
import { OverviewPage } from '../../src/features/overview/OverviewPage';
import { ModelsPage } from '../../src/features/models/ModelsPage';
import { CostPage } from '../../src/features/cost/CostPage';
import { DataQualityPage } from '../../src/features/data-quality/DataQualityPage';
import { ImportPage } from '../../src/features/import/ImportPage';
import { ConversationsPage } from '../../src/features/conversations/ConversationsPage';
import type { ImportSessionModel } from '../../src/features/import/useImportSession';
import { openProfilerDb, PROFILER_DB_NAME } from '../../src/storage/db';

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

function renderJapanese(ui: React.ReactNode) {
  return render(
    <I18nContext.Provider value={{ locale: 'ja', setLocale: vi.fn(), t: (key) => translate(key, 'ja') }}>
      {ui}
    </I18nContext.Provider>
  );
}

function failedSession(messageKey: 'import.fingerprintMismatch'): ImportSessionModel {
  return {
    state: { status: 'failed', code: 'FINGERPRINT_MISMATCH', messageKey },
    selectFile: vi.fn(async () => undefined),
    cancel: vi.fn(),
    openExisting: vi.fn(async () => undefined),
    reanalyze: vi.fn(async () => undefined),
    retryImport: vi.fn(async () => undefined)
  };
}

describe('Codex review UI regressions', () => {
  it('uses the selected date range when choosing the Overview top model', async () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const analysisId = 'analysis-top-model';
    const db = await openProfilerDb();
    const tx = db.transaction(['conversationMetrics', 'modelMetrics'], 'readwrite');
    await tx.objectStore('conversationMetrics').put({
      analysisId,
      conversationId: 'recent',
      title: 'Recent',
      firstTimestamp: Date.parse('2026-09-25T12:00:00Z') / 1000,
      lastTimestamp: Date.parse('2026-09-25T12:01:00Z') / 1000,
      messages: 1,
      visibleTokens: 500,
      inputTokens: 250,
      outputTokens: 250,
      otherTokens: 0,
      modelIds: ['gpt-6-luna'],
      hasWeb: false,
      hasFiles: false,
      hasTools: false
    });
    await tx.objectStore('modelMetrics').put({
      analysisId,
      localKey: '1:gpt-6-sol',
      value: {
        modelId: 'gpt-6-sol', messages: 10, conversations: 1, visibleTokens: 10_000,
        inputTokens: 5_000, outputTokens: 5_000, otherTokens: 0, rawAliases: ['gpt-6-sol'],
        usageByDay: { '2026-08-01': { inputTokens: 5_000, outputTokens: 5_000 } }
      }
    });
    await tx.objectStore('modelMetrics').put({
      analysisId,
      localKey: '2:gpt-6-luna',
      value: {
        modelId: 'gpt-6-luna', messages: 2, conversations: 1, visibleTokens: 500,
        inputTokens: 250, outputTokens: 250, otherTokens: 0, rawAliases: ['gpt-6-luna'],
        usageByDay: { '2026-09-25': { inputTokens: 250, outputTokens: 250 } }
      }
    });
    await tx.done;
    db.close();

    const user = userEvent.setup();
    render(<OverviewPage analysisId={analysisId} />);
    expect(await screen.findByText('gpt-6-sol')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Date range'), '7d');
    expect(await screen.findByText('gpt-6-luna')).toBeVisible();
  });

  it('routes reviewed analytics headings through the Japanese locale dictionary', async () => {
    renderJapanese(<OverviewPage analysisId="empty-overview" />);
    expect(await screen.findByRole('heading', { name: '概要' })).toBeVisible();
    cleanup();

    renderJapanese(<ModelsPage analysisId="empty-models" />);
    expect(await screen.findByRole('heading', { name: 'モデル' })).toBeVisible();
    cleanup();

    renderJapanese(<ConversationsPage analysisId="empty-conversations" />);
    expect(await screen.findByRole('heading', { name: '会話' })).toBeVisible();
  });

  it('applies local pricing history overrides on the Models page', async () => {
    const analysisId = 'analysis-model-price';
    const db = await openProfilerDb();
    const tx = db.transaction(['modelMetrics', 'pricingHistory'], 'readwrite');
    await tx.objectStore('modelMetrics').put({
      analysisId,
      localKey: '1:gpt-6-sol',
      value: {
        modelId: 'gpt-6-sol', messages: 1, conversations: 1, visibleTokens: 1_000_000,
        inputTokens: 1_000_000, outputTokens: 0, otherTokens: 0, rawAliases: ['gpt-6-sol'],
        firstTimestamp: Date.parse('2026-09-24T12:00:00Z') / 1000,
        lastTimestamp: Date.parse('2026-09-24T12:00:00Z') / 1000,
        usageByDay: { '2026-09-24': { inputTokens: 1_000_000, outputTokens: 0 } }
      }
    });
    await tx.objectStore('pricingHistory').put({
      key: 'override:gpt-6-sol:2026-09-24',
      value: {
        model: 'gpt-6-sol', effectiveFrom: '2026-09-24', effectiveTo: null,
        inputPerMillion: 99, cachedInputPerMillion: 9.9, outputPerMillion: 0,
        currency: 'USD', datasetVersion: 1, source: 'local user override'
      }
    });
    await tx.done;
    db.close();

    render(<ModelsPage analysisId={analysisId} />);
    expect(await screen.findByText('$99.0000')).toBeVisible();
  });

  it('restores a persisted cost scenario when the Cost page is reopened', async () => {
    const analysisId = 'analysis-scenario';
    const db = await openProfilerDb();
    await db.put('costProfiles', {
      key: `scenario:${analysisId}`,
      value: {
        lower: 1,
        upper: 2,
        request: {
          replacementModelId: 'gpt-6-sol',
          assumptions: { cacheRatio: 0.25, hiddenInputOverheadRatio: 0.2, reasoningOutputOverheadRatio: 0.3 }
        },
        provenance: 'estimated'
      }
    });
    db.close();

    render(<CostPage analysisId={analysisId} />);
    expect(await screen.findByText('Estimated scenario cost')).toBeVisible();
    expect(screen.getByText('$1.00–$2.00')).toBeVisible();
  });

  it('does not classify a locally configured canonical alias target as an unknown model', async () => {
    const analysisId = 'analysis-alias-quality';
    const db = await openProfilerDb();
    const tx = db.transaction(['modelMetrics', 'dataQuality', 'settings'], 'readwrite');
    await tx.objectStore('modelMetrics').put({
      analysisId,
      localKey: '1:custom-model',
      value: {
        modelId: 'custom-model', messages: 1, conversations: 1, visibleTokens: 10,
        inputTokens: 5, outputTokens: 5, otherTokens: 0, rawAliases: ['raw-custom']
      }
    });
    await tx.objectStore('dataQuality').put({
      analysisId,
      value: {
        fatal: 0, recoverable: 0, warning: 0, unknownSchema: 0, issues: [], unknownSchemaKeys: [],
        coverage: {
          modelIdentification: { attempted: 1, identified: 1, ratio: 1 },
          tokenization: { attempted: 1, identified: 1, ratio: 1 }
        }
      }
    });
    await tx.objectStore('settings').put({
      key: 'model-alias:raw-custom',
      value: { raw: 'raw-custom', canonical: 'custom-model', source: 'local user override' }
    });
    await tx.done;
    db.close();

    render(<DataQualityPage analysisId={analysisId} />);
    const heading = await screen.findByRole('heading', { name: 'Unknown models' });
    const panel = heading.closest('section');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText('None detected.')).toBeVisible();
    expect(within(panel as HTMLElement).queryByText('custom-model')).not.toBeInTheDocument();
  });

  it('renders a translated, user-facing import failure detail instead of an internal key', () => {
    render(<ImportPage session={failedSession('import.fingerprintMismatch')} />);
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveTextContent('import.fingerprintMismatch');
    expect(alert).toHaveTextContent(/does not match the paused import/i);
  });

  it('paginates actual IndexedDB conversation results without loading every row into the UI', async () => {
    const analysisId = 'analysis-paged';
    const db = await openProfilerDb();
    const tx = db.transaction('conversationMetrics', 'readwrite');
    for (let index = 0; index < 501; index += 1) {
      await tx.store.put({
        analysisId,
        conversationId: `conversation-${String(index).padStart(5, '0')}`,
        title: `Conversation ${index}`,
        messages: 1,
        visibleTokens: index,
        inputTokens: index,
        outputTokens: 0,
        otherTokens: 0,
        modelIds: ['gpt-6-sol'],
        hasWeb: false,
        hasFiles: false,
        hasTools: false
      });
    }
    await tx.done;
    db.close();

    const user = userEvent.setup();
    render(<ConversationsPage analysisId={analysisId} />);
    expect(await screen.findByText('Showing 500 of 501 conversations')).toBeVisible();
    expect(screen.getByText('1 / 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '»' }));
    expect(await screen.findByText('Showing 1 of 501 conversations')).toBeVisible();
    expect(screen.getByText('2 / 2')).toBeVisible();
  });
});
