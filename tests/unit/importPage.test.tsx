import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportPage } from '../../src/features/import/ImportPage';
import type { ImportSessionModel, ImportSessionState } from '../../src/features/import/useImportSession';

function session(state: ImportSessionState): ImportSessionModel {
  return {
    state,
    selectFile: vi.fn(async () => undefined),
    cancel: vi.fn(),
    openExisting: vi.fn(async () => undefined),
    reanalyze: vi.fn(async () => undefined)
  };
}

describe('ImportPage', () => {
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
});
