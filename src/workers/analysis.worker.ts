import { createAggregator } from '../analysis/aggregate';
import type { QualitySnapshot } from '../analysis/quality';
import type { BatchMessage, PipelineMessage, StartImportMessage } from '../import/pipelineProtocol';
import { openProfilerDb } from '../storage/db';
import type { ConversationMetricRecord, ImportCheckpoint } from '../storage/repositories';

interface WorkerScope {
  postMessage(message: PipelineMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void;
}

const scope = self as unknown as WorkerScope;
let activeStart: StartImportMessage | undefined;
let cancelled = false;
let work = Promise.resolve();

function qualityRecord(snapshot: QualitySnapshot): Record<string, unknown> {
  return {
    fatal: snapshot.fatal,
    recoverable: snapshot.recoverable,
    warning: snapshot.warning,
    unknownSchema: snapshot.unknownSchema,
    issues: snapshot.issues.map((issue) => ({ ...issue })),
    unknownSchemaKeys: [...snapshot.unknownSchemaKeys],
    coverage: {
      modelIdentification: { ...snapshot.coverage.modelIdentification },
      tokenization: { ...snapshot.coverage.tokenization }
    }
  };
}

async function persistBatch(message: BatchMessage): Promise<ImportCheckpoint> {
  const aggregator = createAggregator();
  for (const conversation of message.conversations) {
    await aggregator.acceptConversation(conversation);
  }
  const result = aggregator.finish();
  const records: ConversationMetricRecord[] = result.conversations.map((conversation) => ({
    analysisId: message.analysisId,
    conversationId: conversation.id,
    title: conversation.title,
    firstTimestamp: conversation.firstTimestamp,
    lastTimestamp: conversation.lastTimestamp,
    messages: conversation.messages,
    visibleTokens: conversation.visibleTokens,
    inputTokens: conversation.inputTokens,
    outputTokens: conversation.outputTokens,
    otherTokens: conversation.otherTokens,
    modelIds: [...conversation.modelIds],
    hasWeb: conversation.hasWeb,
    hasFiles: conversation.hasFiles,
    hasTools: conversation.hasTools
  }));

  const checkpoint: ImportCheckpoint = {
    analysisId: message.analysisId,
    fingerprint: message.fingerprint,
    stage: 'aggregation',
    committedBatches: message.batchId,
    processedConversations: message.processedConversations,
    updatedAt: Date.now()
  };

  const db = await openProfilerDb();
  try {
    const tx = db.transaction(['conversationMetrics', 'dataQuality', 'checkpoints'], 'readwrite');
    for (const record of records) await tx.objectStore('conversationMetrics').put(record);
    await tx.objectStore('dataQuality').put({ analysisId: message.analysisId, value: qualityRecord(message.quality) });
    await tx.objectStore('checkpoints').put(checkpoint);
    await tx.done;
  } finally {
    db.close();
  }
  return checkpoint;
}

async function handleBatch(message: BatchMessage): Promise<void> {
  if (cancelled || !activeStart) return;
  if (message.analysisId !== activeStart.analysisId || message.fingerprint !== activeStart.fingerprint) {
    throw new Error('Batch identity does not match the active analysis.');
  }

  const checkpoint = await persistBatch(message);
  if (cancelled) return;
  scope.postMessage({
    type: 'PROGRESS',
    stage: 'aggregation',
    processedConversations: checkpoint.processedConversations,
    messageKey: 'import.aggregating'
  });
  scope.postMessage({ type: 'BATCH_ACK', batchId: message.batchId, checkpoint });
}

async function finalizeAnalysis(analysisId: string): Promise<void> {
  if (cancelled) return;
  const db = await openProfilerDb();
  try {
    const record = await db.get('analyses', analysisId);
    if (record) await db.put('analyses', { ...record, status: 'complete' });
    await db.delete('checkpoints', analysisId);
  } finally {
    db.close();
  }
  if (!cancelled) scope.postMessage({ type: 'COMPLETE', analysisId, source: 'analysis' });
}

function reportFailure(error: unknown): void {
  if (cancelled) return;
  scope.postMessage({
    type: 'FAIL',
    code: 'ANALYSIS_WORKER_FAILED',
    stage: 'aggregation',
    messageKey: error instanceof Error ? 'import.analysisFailed' : 'import.analysisFailed'
  });
}

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'START_IMPORT') {
    activeStart = message;
    cancelled = false;
    work = Promise.resolve();
    return;
  }
  if (message.type === 'BATCH') {
    work = work.then(() => handleBatch(message)).catch((error: unknown) => {
      reportFailure(error);
    });
    return;
  }
  if (message.type === 'COMPLETE' && message.source === 'import') {
    work = work.then(() => finalizeAnalysis(message.analysisId)).catch((error: unknown) => {
      reportFailure(error);
    });
    return;
  }
  if (message.type === 'CANCEL') {
    cancelled = true;
  }
});
