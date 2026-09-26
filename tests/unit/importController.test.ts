// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ImportController, type WorkerPort } from '../../src/features/import/importController';
import type { PipelineMessage } from '../../src/import/pipelineProtocol';

class RecordingWorker implements WorkerPort {
  readonly messages: PipelineMessage[] = [];
  readonly terminate = vi.fn();
  private readonly listeners = new Set<(event: MessageEvent<PipelineMessage>) => void>();

  postMessage(message: PipelineMessage): void {
    this.messages.push(message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void {
    this.listeners.delete(listener);
  }

  emit(message: PipelineMessage): void {
    for (const listener of this.listeners) listener({ data: message } as MessageEvent<PipelineMessage>);
  }
}

function successfulInspection() {
  return {
    ok: true as const,
    entryCount: 1,
    conversationEntry: { filename: 'conversations.json', compressedSize: 10, uncompressedSize: 20 },
    blockingIssues: []
  };
}

describe('ImportController', () => {
  it('sends the selected ZIP safety policy to the import worker', async () => {
    const policy = { maxEntries: 100_000, maxConversationBytes: 16 * 1024 ** 3, maxCompressionRatio: 500 };
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const controller = new ImportController({
      inspectZip: async () => successfulInspection(),
      fingerprintImport: async () => ({ hash: 'synthetic-fingerprint' } as never),
      createImportWorker: () => importWorker,
      createAnalysisWorker: () => analysisWorker,
      createAnalysis: async () => {},
      updateAnalysisStatus: async () => {}
    });

    await controller.start(new Blob(['synthetic ZIP bytes']), { profile: 'standard', zipSafetyPolicy: policy });

    expect(importWorker.messages).toContainEqual(expect.objectContaining({
      type: 'START_IMPORT',
      zipSafetyPolicy: policy
    }));
    controller.cancel();
  });

  it('does not create an analysis or launch workers after cancellation during startup', async () => {
    let resolveInspection!: (value: ReturnType<typeof successfulInspection>) => void;
    const inspection = new Promise<ReturnType<typeof successfulInspection>>((resolve) => {
      resolveInspection = resolve;
    });
    const createAnalysis = vi.fn(async () => {});
    const createImportWorker = vi.fn(() => new RecordingWorker());
    const createAnalysisWorker = vi.fn(() => new RecordingWorker());
    const controller = new ImportController({
      inspectZip: async () => inspection,
      fingerprintImport: async () => ({ hash: 'synthetic-fingerprint' } as never),
      createImportWorker,
      createAnalysisWorker,
      createAnalysis,
      updateAnalysisStatus: async () => {}
    });

    const start = controller.start(new Blob(['synthetic ZIP bytes']), { profile: 'standard' });
    controller.cancel();
    resolveInspection(successfulInspection());

    await expect(start).rejects.toMatchObject({ name: 'AbortError' });
    expect(createAnalysis).not.toHaveBeenCalled();
    expect(createImportWorker).not.toHaveBeenCalled();
    expect(createAnalysisWorker).not.toHaveBeenCalled();
  });

  it('persists failed analysis status before shutting workers down', async () => {
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const updateAnalysisStatus = vi.fn(async () => {});
    const controller = new ImportController({
      inspectZip: async () => successfulInspection(),
      fingerprintImport: async () => ({ hash: 'synthetic-fingerprint' } as never),
      createImportWorker: () => importWorker,
      createAnalysisWorker: () => analysisWorker,
      createAnalysis: async () => {},
      updateAnalysisStatus
    });

    const { analysisId } = await controller.start(new Blob(['synthetic ZIP bytes']), {
      profile: 'standard',
      analysisId: 'analysis-failure-test'
    });
    expect(analysisId).toBe('analysis-failure-test');

    importWorker.emit({
      type: 'FAIL',
      code: 'IMPORT_STREAM_FAILED',
      stage: 'parsing',
      messageKey: 'import.streamFailed'
    });

    await vi.waitFor(() => expect(updateAnalysisStatus).toHaveBeenCalledWith('analysis-failure-test', 'failed'));
    expect(importWorker.terminate).toHaveBeenCalled();
    expect(analysisWorker.terminate).toHaveBeenCalled();
  });
});
