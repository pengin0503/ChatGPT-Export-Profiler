import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectExportZip: vi.fn(),
  fingerprintImport: vi.fn(),
  start: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  getLatestCheckpoint: vi.fn(),
  analysisList: vi.fn(),
  checkpointLoad: vi.fn(),
  metricsList: vi.fn(),
  profile: vi.fn(), summary: vi.fn(), listener: vi.fn()
}));

vi.mock('../../src/import/zipInspector', () => ({
  inspectExportZip: mocks.inspectExportZip
}));

vi.mock('../../src/analysis/fingerprint', () => ({
  fingerprintImport: mocks.fingerprintImport
}));

vi.mock('../../src/features/settings/preferences', () => ({
  loadEffectivePerformanceProfile: mocks.profile,
  loadModelAliases: async () => ({}),
  loadZipSafetyPolicy: async () => ({
    maxEntries: 50_000,
    maxConversationBytes: 8 * 1024 ** 3,
    maxCompressionRatio: 500
  })
}));

vi.mock('../../src/storage/analyticsQueries', () => ({ getOverviewMetrics: mocks.summary }));

vi.mock('../../src/storage/repositories', () => ({
  analysisRepository: { list: mocks.analysisList },
  checkpointRepository: { load: mocks.checkpointLoad },
  metricsRepository: { listConversationMetrics: mocks.metricsList }
}));

vi.mock('../../src/features/import/importController', () => ({
  ImportController: class {
    subscribe(listener: unknown) {
      mocks.listener(listener);
      return () => undefined;
    }

    start(...args: unknown[]) {
      return mocks.start(...args);
    }

    resume(...args: unknown[]) {
      return mocks.resume(...args);
    }

    cancel() {
      mocks.cancel();
    }

    getLatestCheckpoint() {
      return mocks.getLatestCheckpoint();
    }
  }
}));

import { useImportSession } from '../../src/features/import/useImportSession';

describe('useImportSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analysisList.mockResolvedValue([]);
    mocks.checkpointLoad.mockResolvedValue(undefined);
    mocks.metricsList.mockResolvedValue([]);
    mocks.fingerprintImport.mockResolvedValue({ hash: 'synthetic-fingerprint' });
    mocks.start.mockResolvedValue({ analysisId: 'synthetic-analysis', fingerprint: { hash: 'synthetic-fingerprint' } });
    mocks.resume.mockResolvedValue({ analysisId: 'synthetic-analysis', fingerprint: { hash: 'synthetic-fingerprint' } });
    mocks.profile.mockResolvedValue('standard');
    mocks.inspectExportZip.mockResolvedValue({ ok: true, entryCount: 1, conversationEntry: { filename: 'conversations.json', compressedSize: 10, uncompressedSize: 20 }, blockingIssues: [] });
  });

  it('does not start workers when cancelled while preferences are loading', async () => {
    let resolve!: (value: string) => void;
    mocks.profile.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const { result } = renderHook(() => useImportSession());
    let selected!: Promise<void>;
    await act(async () => { selected = result.current.selectFile(new File(['synthetic'], 'export.zip')); });
    expect(result.current.state.status).toBe('running');
    act(() => result.current.cancel());
    await act(async () => { resolve('standard'); await selected; });
    expect(result.current.state.status).toBe('cancelled');
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('keeps cancellation when an inspection finishes late', async () => {
    let resolve!: (value: unknown) => void;
    mocks.inspectExportZip.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useImportSession());
    let selected!: Promise<void>;
    await act(async () => { selected = result.current.selectFile(new File(['synthetic'], 'export.zip')); });
    act(() => result.current.cancel());
    await act(async () => { resolve({ ok: false }); await selected; });
    expect(result.current.state.status).toBe('cancelled');
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('does not start after unmount while preferences are loading', async () => {
    let resolve!: (value: string) => void;
    mocks.profile.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const { result, unmount } = renderHook(() => useImportSession());
    let selected!: Promise<void>;
    await act(async () => { selected = result.current.selectFile(new File(['synthetic'], 'export.zip')); });
    unmount();
    await act(async () => { resolve('standard'); await selected; });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('keeps cancellation when preferences reject late', async () => {
    let reject!: (error: Error) => void;
    mocks.profile.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const { result } = renderHook(() => useImportSession());
    let selected!: Promise<void>;
    await act(async () => { selected = result.current.selectFile(new File(['synthetic'], 'export.zip')); });
    act(() => result.current.cancel());
    await act(async () => { reject(new Error('Synthetic failure')); await selected; });
    expect(result.current.state.status).toBe('cancelled');
  });

  it('does not resume after cancellation during preference loading', async () => {
    const checkpoint = { analysisId: 'resume', fingerprint: 'fp', stage: 'aggregation', committedBatches: 1, processedConversations: 5, updatedAt: 1 };
    mocks.analysisList.mockResolvedValue([{ id: 'resume' }]);
    mocks.checkpointLoad.mockResolvedValue(checkpoint);
    let resolve!: (value: string) => void;
    mocks.profile.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const { result } = renderHook(() => useImportSession());
    await waitFor(() => expect(result.current.state.status).toBe('recoverable'));
    let selected!: Promise<void>;
    await act(async () => { selected = result.current.selectFile(new File(['synthetic'], 'export.zip')); });
    act(() => result.current.cancel());
    await act(async () => { resolve('standard'); await selected; });
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'cancelled', checkpoint });
  });

  it('ignores a superseded inspection when a new selection is running', async () => {
    let resolve!: (value: unknown) => void;
    mocks.inspectExportZip.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useImportSession());
    let first!: Promise<void>;
    await act(async () => { first = result.current.selectFile(new File(['first'], 'first.zip')); });
    await act(async () => { await result.current.selectFile(new File(['second'], 'second.zip')); });
    await act(async () => { resolve({ ok: false }); await first; });
    expect(result.current.state.status).toBe('running');
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.inspectExportZip.mock.calls[0][2].aborted).toBe(true);
  });

  it('does not show a delayed completed summary after cancellation', async () => {
    let resolve!: (value: unknown) => void;
    mocks.summary.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useImportSession());
    await act(async () => { await result.current.selectFile(new File(['synthetic'], 'export.zip')); });
    const analysisId = result.current.state.status === 'running' ? result.current.state.analysisId : '';
    const listener = mocks.listener.mock.calls[0][0];
    act(() => { listener({ type: 'COMPLETE', source: 'analysis', analysisId }); });
    act(() => result.current.cancel());
    await act(async () => { resolve({ totals: { conversations: 1, messages: 1, visibleTokens: 1 } }); });
    expect(result.current.state.status).toBe('cancelled');
  });

  it('accepts a valid sharded inspection during file selection', async () => {
    mocks.inspectExportZip.mockResolvedValue({
      ok: true,
      entryCount: 3,
      conversationEntries: [
        { filename: 'conversations-001.json', compressedSize: 10, uncompressedSize: 20 },
        { filename: 'conversations-002.json', compressedSize: 11, uncompressedSize: 21 }
      ],
      blockingIssues: []
    });

    const { result } = renderHook(() => useImportSession());
    const file = new File(['synthetic ZIP bytes'], 'synthetic-export.zip', { type: 'application/zip' });

    await act(async () => {
      await result.current.selectFile(file);
    });

    expect(mocks.fingerprintImport).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe('running');
  });
});
