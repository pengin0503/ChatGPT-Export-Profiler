// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ImportController, type WorkerPort } from '../../src/features/import/importController';
import type { AnalysisRecord, ImportCheckpoint } from '../../src/storage/repositories';
import type { ImportFingerprint } from '../../src/analysis/fingerprint';
import type { ZipInspection } from '../../src/import/zipInspector';
import type { PipelineMessage } from '../../src/import/pipelineProtocol';
import {
  ANALYSIS_SCHEMA_VERSION,
  ANALYZER_VERSION,
  APP_VERSION,
  PRICING_DATASET_VERSION,
  TOKENIZER_VERSION
} from '../../src/version';

class FakeWorker implements WorkerPort {
  readonly posted: PipelineMessage[] = [];
  terminated = false;
  private readonly listeners = new Set<(event: MessageEvent<PipelineMessage>) => void>();

  postMessage(message: PipelineMessage): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void {
    this.listeners.delete(listener);
  }

  emit(message: PipelineMessage): void {
    const event = { data: message } as MessageEvent<PipelineMessage>;
    for (const listener of this.listeners) listener(event);
  }
}

const inspection: ZipInspection = {
  ok: true,
  entryCount: 1,
  conversationEntry: { filename: 'conversations.json', compressedSize: 10, uncompressedSize: 20 },
  blockingIssues: []
};

function fingerprint(hash: string): ImportFingerprint {
  return {
    hash,
    algorithm: 'SHA-256',
    fileSize: 10,
    entryCount: 1,
    conversationEntry: inspection.conversationEntry,
    sampledBytes: 10
  };
}

function checkpoint(overrides: Partial<ImportCheckpoint> = {}): ImportCheckpoint {
  return {
    analysisId: 'analysis-1',
    fingerprint: 'expected-fingerprint',
    stage: 'aggregation',
    committedBatches: 2,
    processedConversations: 100,
    updatedAt: 1_790_000_000_000,
    ...overrides
  };
}

function compatibleAnalysis(id = 'analysis-1'): AnalysisRecord {
  return {
    id,
    fingerprint: 'expected-fingerprint',
    createdAt: 1,
    status: 'running',
    appVersion: APP_VERSION,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    analyzerVersion: ANALYZER_VERSION,
    tokenizerVersion: TOKENIZER_VERSION,
    pricingDatasetVersion: PRICING_DATASET_VERSION
  };
}

const noStatusUpdate = async () => undefined;

describe('ImportController recovery', () => {
  it('refuses a checkpoint when the reselected file fingerprint differs', async () => {
    const controller = new ImportController({
      inspectZip: async () => inspection,
      fingerprintImport: async () => fingerprint('different-fingerprint'),
      createImportWorker: () => {
        throw new Error('workers must not start after a fingerprint mismatch');
      },
      createAnalysisWorker: () => {
        throw new Error('workers must not start after a fingerprint mismatch');
      },
      createAnalysis: async () => undefined,
      getAnalysis: async () => compatibleAnalysis(),
      updateAnalysisStatus: noStatusUpdate
    });

    await expect(controller.resume(new Blob(['synthetic']), checkpoint())).rejects.toMatchObject({
      code: 'FINGERPRINT_MISMATCH'
    });
  });

  it('keeps the last committed checkpoint available after cancellation', async () => {
    const importWorker = new FakeWorker();
    const analysisWorker = new FakeWorker();
    const controller = new ImportController({
      inspectZip: async () => inspection,
      fingerprintImport: async () => fingerprint('expected-fingerprint'),
      createImportWorker: () => importWorker,
      createAnalysisWorker: () => analysisWorker,
      createAnalysis: async () => undefined,
      getAnalysis: async () => compatibleAnalysis(),
      updateAnalysisStatus: noStatusUpdate
    });

    await controller.start(new Blob(['synthetic']), { profile: 'safe', analysisId: 'analysis-1' });
    const durable = checkpoint();
    analysisWorker.emit({ type: 'BATCH_ACK', batchId: 1, checkpoint: durable });

    controller.cancel();

    expect(controller.getLatestCheckpoint()).toEqual(durable);
    expect(importWorker.posted).toContainEqual({ type: 'CANCEL' });
    expect(analysisWorker.posted).toContainEqual({ type: 'CANCEL' });
    expect(importWorker.terminated).toBe(true);
    expect(analysisWorker.terminated).toBe(true);
  });

  it('adopts the durable checkpoint attached to a storage quota failure before shutting workers down', async () => {
    const importWorker = new FakeWorker();
    const analysisWorker = new FakeWorker();
    const controller = new ImportController({
      inspectZip: async () => inspection,
      fingerprintImport: async () => fingerprint('expected-fingerprint'),
      createImportWorker: () => importWorker,
      createAnalysisWorker: () => analysisWorker,
      createAnalysis: async () => undefined,
      getAnalysis: async () => compatibleAnalysis(),
      updateAnalysisStatus: noStatusUpdate
    });
    const events: PipelineMessage[] = [];
    controller.subscribe((event) => events.push(event));

    await controller.start(new Blob(['synthetic']), { profile: 'safe', analysisId: 'analysis-1' });
    const durable = checkpoint({ committedBatches: 4, processedConversations: 200 });
    analysisWorker.emit({
      type: 'FAIL',
      code: 'STORAGE_QUOTA_EXCEEDED',
      stage: 'aggregation',
      messageKey: 'import.storageFull',
      checkpoint: durable
    });

    expect(controller.getLatestCheckpoint()).toEqual(durable);
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ type: 'FAIL', code: 'STORAGE_QUOTA_EXCEEDED' }));
      expect(importWorker.terminated).toBe(true);
      expect(analysisWorker.terminated).toBe(true);
    });
  });
});
