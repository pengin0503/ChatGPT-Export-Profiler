import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportPage } from '../../src/features/import/ImportPage';
import type { ImportSessionModel, ImportSessionState } from '../../src/features/import/useImportSession';
import { I18nContext, t } from '../../src/i18n';

function session(state: ImportSessionState): ImportSessionModel {
  return {
    state,
    selectFile: vi.fn(async () => undefined),
    cancel: vi.fn(),
    openExisting: vi.fn(async () => undefined),
    reanalyze: vi.fn(async () => undefined),
    retryImport: vi.fn(async () => undefined)
  };
}

describe('ImportPage', () => {
  it.each([
    [{ status: 'running', analysisId: 'synthetic', stage: 'aggregation', processedConversations: 120, startedAt: Date.now(), warnings: [] }, 'ローカル解析中'],
    [{ status: 'cancelled' }, 'インポートをキャンセルしました'],
    [{ status: 'recoverable', checkpoint: { analysisId: 'synthetic', fingerprint: 'fp', stage: 'aggregation', committedBatches: 1, processedConversations: 120, updatedAt: 1 } }, 'ローカル解析を再開'],
    [{ status: 'failed', code: 'ZIP_SAFETY_BLOCKED', messageKey: 'import.zipSafetyBlocked' }, 'ZIPはローカル安全検査を通過しませんでした。'],
    [{ status: 'complete', analysisId: 'synthetic', summary: { conversations: 2, messages: 3, visibleTokens: 4 } }, '読み込み完了'],
    [{ status: 'storage-pressure', file: new File(['synthetic'], 'export.zip'), checkpoint: { analysisId: 'synthetic', fingerprint: 'fp', stage: 'aggregation', committedBatches: 1, processedConversations: 120, updatedAt: 1 } }, 'ブラウザのストレージがいっぱいです']
  ] as const)('translates the %s state into Japanese', (state, heading) => {
    render(<I18nContext.Provider value={{ locale: 'ja', setLocale: vi.fn(), t: (key) => t(key, 'ja') }}>
      <ImportPage session={session(state as ImportSessionState)} />
    </I18nContext.Provider>);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    if (state.status === 'running') {
      expect(screen.getByText('集計')).toBeVisible();
      expect(screen.getByText('120件の会話を処理済み')).toBeVisible();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeVisible();
    }
    if (state.status === 'complete') expect(screen.getByText('会話2件 · メッセージ3件 · 可視トークン4')).toBeVisible();
    if (state.status === 'storage-pressure') expect(screen.getByRole('button', { name: 'インポートを再試行' })).toBeVisible();
  });
  it('allows cancellation while inspecting the ZIP', async () => {
    const model = session({ status: 'inspecting' });
    render(<ImportPage session={model} />);
    expect(screen.getByLabelText('Choose ChatGPT export ZIP')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(model.cancel).toHaveBeenCalledOnce();
  });
  it('shows an accessible ZIP picker and local-only privacy copy while idle', () => {
    render(<ImportPage session={session({ status: 'idle' })} />);
    expect(screen.getByLabelText('Choose ChatGPT export ZIP')).toBeInTheDocument();
    expect(screen.getByText(/No API key/i)).toBeVisible();
    expect(screen.getByText(/stays local/i)).toBeVisible();
  });

  it('shows a blocking safety failure', () => {
    render(
      <ImportPage
        session={session({ status: 'failed', code: 'ZIP_SAFETY_BLOCKED', messageKey: 'import.zipSafetyBlocked' })}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/safety inspection/i);
  });

  it('shows processing stage, counts, warnings, elapsed time, and cancellation', async () => {
    const model = session({
      status: 'running',
      analysisId: 'analysis-1',
      stage: 'aggregation',
      processedConversations: 120,
      startedAt: Date.now() - 12_000,
      warnings: ['synthetic-warning']
    });
    render(<ImportPage session={model} />);
    expect(screen.getByText('aggregation')).toBeVisible();
    expect(screen.getByText(/120 conversations processed/i)).toBeVisible();
    expect(screen.getByText('synthetic-warning')).toBeVisible();
    expect(screen.getByText(/elapsed/i)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(model.cancel).toHaveBeenCalledOnce();
  });

  it('offers open-existing and reanalyze choices for a duplicate', async () => {
    const model = session({
      status: 'duplicate',
      file: new File(['x'], 'export.zip'),
      existingAnalysisId: 'analysis-existing',
      fingerprint: 'fingerprint-1'
    });
    render(<ImportPage session={model} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open existing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reanalyze' }));
    expect(model.openExisting).toHaveBeenCalledOnce();
    expect(model.reanalyze).toHaveBeenCalledOnce();
  });

  it('requires file re-selection for a recoverable checkpoint', () => {
    render(
      <ImportPage
        session={session({
          status: 'recoverable',
          checkpoint: {
            analysisId: 'analysis-1',
            fingerprint: 'fp',
            stage: 'aggregation',
            committedBatches: 2,
            processedConversations: 100,
            updatedAt: Date.now()
          }
        })}
      />
    );
    expect(screen.getByText(/re-select the original ZIP/i)).toBeVisible();
    expect(screen.getByLabelText('Choose ChatGPT export ZIP')).toBeInTheDocument();
  });

  it('keeps the selected ZIP retryable when storage quota is exhausted', async () => {
    const onManageStorage = vi.fn();
    const model = session({
      status: 'storage-pressure',
      file: new File(['synthetic'], 'export.zip'),
      checkpoint: {
        analysisId: 'analysis-1',
        fingerprint: 'fp',
        stage: 'aggregation',
        committedBatches: 4,
        processedConversations: 200,
        updatedAt: Date.now()
      }
    });

    render(<ImportPage session={model} onManageStorage={onManageStorage} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/browser storage is full/i);
    expect(screen.queryByLabelText('Choose ChatGPT export ZIP')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /manage storage/i }));
    await userEvent.click(screen.getByRole('button', { name: /retry import/i }));
    expect(onManageStorage).toHaveBeenCalledOnce();
    expect(model.retryImport).toHaveBeenCalledOnce();
  });
});
