import { normalizeConversation } from '../analysis/normalize';
import { QualityCollector } from '../analysis/quality';
import { streamConversationObjects } from '../import/conversationStream';
import {
  PERFORMANCE_PROFILES,
  runBoundedBatchProducer,
  type BatchAckMessage,
  type PipelineMessage,
  type StartImportMessage
} from '../import/pipelineProtocol';

interface WorkerScope {
  postMessage(message: PipelineMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void;
}

const scope = self as unknown as WorkerScope;
let abortController: AbortController | undefined;
const acknowledgements = new Map<number, () => void>();

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  if (error instanceof Error && error.name === 'AbortError') return 'IMPORT_ABORTED';
  return 'IMPORT_STREAM_FAILED';
}

function settleAck(message: BatchAckMessage): void {
  const resolve = acknowledgements.get(message.batchId);
  if (!resolve) return;
  acknowledgements.delete(message.batchId);
  resolve();
}

function releaseAllAcks(): void {
  for (const resolve of acknowledgements.values()) resolve();
  acknowledgements.clear();
}

async function runImport(message: StartImportMessage): Promise<void> {
  if (!message.file) return;
  abortController?.abort();
  releaseAllAcks();
  abortController = new AbortController();
  const signal = abortController.signal;
  const quality = new QualityCollector();
  const profile = PERFORMANCE_PROFILES[message.profile];
  const resumeCount = message.checkpoint?.processedConversations ?? 0;
  let validSeen = 0;
  let emitted = 0;
  let sentConversations = 0;
  let batchId = message.checkpoint?.committedBatches ?? 0;

  async function* normalizedConversations() {
    for await (const raw of streamConversationObjects(message.file!, signal, message.zipSafetyPolicy)) {
      const normalized = normalizeConversation(raw, quality, { modelAliases: message.modelAliases });
      if (!normalized) continue;
      validSeen += 1;
      if (validSeen <= resumeCount) continue;
      emitted += 1;
      if (emitted === 1 || emitted % 50 === 0) {
        scope.postMessage({
          type: 'PROGRESS',
          stage: 'normalization',
          processedConversations: resumeCount + emitted,
          messageKey: 'import.processing'
        });
      }
      yield normalized;
    }
  }

  try {
    await runBoundedBatchProducer(normalizedConversations(), {
      batchSize: profile.batchSize,
      maxInFlightBatches: profile.maxInFlightBatches,
      sendBatch: async (conversations) => {
        const currentBatchId = ++batchId;
        sentConversations += conversations.length;
        scope.postMessage({
          type: 'BATCH',
          analysisId: message.analysisId,
          fingerprint: message.fingerprint,
          batchId: currentBatchId,
          processedConversations: resumeCount + sentConversations,
          conversations,
          quality: quality.snapshot()
        });
        await new Promise<void>((resolve) => acknowledgements.set(currentBatchId, resolve));
      }
    });

    if (!signal.aborted) {
      scope.postMessage({ type: 'COMPLETE', analysisId: message.analysisId, source: 'import' });
    }
  } catch (error) {
    if (signal.aborted) return;
    scope.postMessage({
      type: 'FAIL',
      code: errorCode(error),
      stage: 'parsing',
      messageKey: 'import.streamFailed'
    });
  }
}

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'START_IMPORT') {
    void runImport(message);
    return;
  }
  if (message.type === 'BATCH_ACK') {
    settleAck(message);
    return;
  }
  if (message.type === 'CANCEL') {
    abortController?.abort();
    releaseAllAcks();
  }
});
