import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/features/import/useImportSession', () => ({
  useImportSession: () => ({
    state: {
      status: 'running',
      analysisId: 'analysis-running',
      stage: 'aggregation',
      processedConversations: 10,
      startedAt: 0,
      warnings: []
    },
    selectFile: vi.fn(async () => undefined),
    cancel: vi.fn(),
    openExisting: vi.fn(async () => undefined),
    reanalyze: vi.fn(async () => undefined),
    retryImport: vi.fn(async () => undefined)
  })
}));

vi.mock('../../src/features/import/ImportPage', () => ({
  ImportPage: () => <div>Import mock</div>
}));

vi.mock('../../src/features/settings/SettingsPage', () => ({
  SettingsPage: ({ protectedAnalysisId }: { protectedAnalysisId?: string }) => (
    <div data-testid="protected-analysis-id">{protectedAnalysisId ?? 'none'}</div>
  )
}));

import { App } from '../../src/app/App';

describe('active import storage protection', () => {
  it('protects the running analysis when Settings is opened mid-import', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByTestId('protected-analysis-id')).toHaveTextContent('analysis-running');
  });
});
