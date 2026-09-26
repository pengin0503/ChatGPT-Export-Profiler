// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ImportController, type WorkerPort } from '../../src/features/import/importController';
import type { PipelineMessage } from '../../src/import/pipelineProtocol';
import type { ImportCheckpoint } from '../../src/storage/repositories';
import {
  ANALYSIS_SCHEMA_VERSION,
  ANALYZER_VERSION,
  APP_VERSION,
  PRICING_DATASET_VERSION,
  TOKENIZER_VERSION
} from '../../src/version';

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
    conversationEntries: [{ filename: 'conversations.json', compressedSize: 10, uncompressedSize: 20 }],
    blockingIssues: []
  };
}

function successfulShardedInspection() {
  return {
    ok: true as const,
    entryCount: 3,
    conversationEntries: [
      { filename: 'conversations-001.json', compressedSize: 10, uncompressedSize: 20 },
      { filename: 'conversations-002.json', compressedSize: 11, uncompressedSize: 21 }
    ],
    blockingIssues: []
  };
}

function dependencies(importWorker = new RecordingWorker(), analysisWorker = new RecordingWorker()) {
  return {
    inspectZip: async () => successfulInspection(),
    fingerprintImport: async () => ({ hash: 'synthetic-fingerprint' } as never),
    createImportWorker: () => importWorker,
    createAnalysisWorker: () => analysisWorker,
    createAnalysis: async () => {},
    updateAnalysisStatus: async () => {}
  };
}

describe('ImportController', () => {
  it('starts an import for a valid sharded conversation inspection without a legacy single entry', async () => {
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const controller = new ImportController({
      ...dependencies(importWorker, analysisWorker),
      inspectZip: async () => successfulShardedInspection()
    });

    await expect(
      controller.start(new Blob(['synthetic ZIP bytes']), { profile: 'standard', analysisId: 'analysis-sharded-test' })
    ).resolves.toMatchObject({ analysisId: 'analysis-sharded-test' });
    expect(importWorker.messages).toContainEqual(expect.objectContaining({ type: 'START_IMPORT' }));
    controller.cancel();
  });

  it('persists centralized analysis provenance versions', async () => {
    const createAnalysis = vi.fn(async () => {});
    const controller = new ImportController({ ...dependencies(), createAnalysis });

    await controller.start(new Blob(['synthetic ZIP bytes']), {
      profile: 'standard',
      analysisId: 'analysis-version-test'
    });

    expect(createAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      id: 'analysis-version-test',
      appVersion: APP_VERSION,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      tokenizerVersion: TOKENIZER_VERSION,
      pricingDatasetVersion: PRICING_DATASET_VERSION
    }));
    controller.cancel();
  });

  it('sends the selected ZIP safety policy to the import worker', async () => {
    const policy = { maxEntries: 100_000, maxConversationBytes: 16 * 1024 ** 3, maxCompressionRatio: 500 };
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const controller = new ImportController({ ...dependencies(importWorker, analysisWorker) });

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
      ...dependencies(importWorker, analysisWorker),
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

  it('uses model aliases pinned in the checkpoint instead of current settings when resuming', async () => {
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const controller = new ImportController({ ...dependencies(importWorker, analysisWorker) });
    const checkpoint: ImportCheckpoint = {
      analysisId: 'analysis-resume',
      fingerprint: 'synthetic-fingerprint',
      stage: 'aggregation',
      committedBatches: 2,
      processedConversations: 100,
      updatedAt: 123,
      modelAliases: { 'raw-model': 'canonical-old' }
    };

    await controller.resume(new Blob(['synthetic ZIP bytes']), checkpoint, {
      profile: 'standard',
      modelAliases: { 'raw-model': 'canonical-new' }
    });

    expect(importWorker.messages).toContainEqual(expect.objectContaining({
      type: 'START_IMPORT',
      modelAliases: { 'raw-model': 'canonical-old' }
    }));
    controller.cancel();
  });

  it('resumes a legacy checkpoint when the v3 fingerprint exposes a matching legacy hash', async () => {
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const controller = new ImportController({
      ...dependencies(importWorker, analysisWorker),
      fingerprintImport: async () => ({
        hash: 'synthetic-v3-fingerprint',
        legacyHash: 'synthetic-legacy-fingerprint'
      } as never)
    });
    const checkpoint: ImportCheckpoint = {
      analysisId: 'analysis-legacy-resume',
      fingerprint: 'synthetic-legacy-fingerprint',
      stage: 'aggregation',
      committedBatches: 1,
      processedConversations: 50,
      updatedAt: 456
    };

    await expect(controller.resume(new Blob(['synthetic ZIP bytes']), checkpoint, { profile: 'standard' }))
      .resolves.toMatchObject({ analysisId: 'analysis-legacy-resume' });
    expect(importWorker.messages).toContainEqual(expect.objectContaining({
      type: 'START_IMPORT',
      fingerprint: 'synthetic-legacy-fingerprint'
    }));
    controller.cancel();
  });
});
