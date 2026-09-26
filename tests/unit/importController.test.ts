// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ImportController, type WorkerPort } from '../../src/features/import/importController';
import type { PipelineMessage } from '../../src/import/pipelineProtocol';

class RecordingWorker implements WorkerPort {
  readonly messages: PipelineMessage[] = [];
  private readonly listeners = new Set<(event: MessageEvent<PipelineMessage>) => void>();

  postMessage(message: PipelineMessage): void {
    this.messages.push(message);
  }

  terminate(): void {}

  addEventListener(_type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void {
    this.listeners.delete(listener);
  }
}

describe('ImportController ZIP safety policy propagation', () => {
  it('sends the selected ZIP safety policy to the import worker', async () => {
    const policy = { maxEntries: 100_000, maxConversationBytes: 16 * 1024 ** 3, maxCompressionRatio: 500 };
    const importWorker = new RecordingWorker();
    const analysisWorker = new RecordingWorker();
    const controller = new ImportController({
      inspectZip: async () => ({
        ok: true,
        entryCount: 1,
        conversationEntry: { filename: 'conversations.json', compressedSize: 10, uncompressedSize: 20 },
        blockingIssues: []
      }),
      fingerprintImport: async () => ({ hash: 'synthetic-fingerprint' } as never),
      createImportWorker: () => importWorker,
      createAnalysisWorker: () => analysisWorker,
      createAnalysis: async () => {}
    });

    await controller.start(new Blob(['synthetic ZIP bytes']), { profile: 'standard', zipSafetyPolicy: policy });

    expect(importWorker.messages).toContainEqual(expect.objectContaining({
      type: 'START_IMPORT',
      zipSafetyPolicy: policy
    }));
    controller.cancel();
  });
});
