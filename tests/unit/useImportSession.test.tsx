import { act, renderHook } from '@testing-library/react';
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
  metricsList: vi.fn()
}));

vi.mock('../../src/import/zipInspector', () => ({
  inspectExportZip: mocks.inspectExportZip
}));

vi.mock('../../src/analysis/fingerprint', () => ({
  fingerprintImport: mocks.fingerprintImport
}));

vi.mock('../../src/features/settings/preferences', () => ({
  loadEffectivePerformanceProfile: async () => 'standard',
  loadModelAliases: async () => ({}),
  loadZipSafetyPolicy: async () => ({
    maxEntries: 50_000,
    maxConversationBytes: 8 * 1024 ** 3,
    maxCompressionRatio: 500
  })
}));

vi.mock('../../src/storage/repositories', () => ({
  analysisRepository: { list: mocks.analysisList },
  checkpointRepository: { load: mocks.checkpointLoad },
  metricsRepository: { listConversationMetrics: mocks.metricsList }
}));

vi.mock('../../src/features/import/importController', () => ({
  ImportController: class {
    subscribe() {
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
