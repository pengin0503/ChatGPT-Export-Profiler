import { createAggregator } from '../analysis/aggregate';
import type { QualitySnapshot } from '../analysis/quality';
import type { BatchMessage, PipelineMessage, StartImportMessage } from '../import/pipelineProtocol';
import { openProfilerDb } from '../storage/db';
import type { AnalysisOwnedRecord, ConversationMetricRecord, ImportCheckpoint } from '../storage/db';
import { isQuotaExceededError } from '../storage/quota';

interface WorkerScope {
  postMessage(message: PipelineMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void;
}

const scope = self as unknown as WorkerScope;
let activeStart: StartImportMessage | undefined;
let latestCheckpoint: ImportCheckpoint | undefined;
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

function toolRecords(message: BatchMessage): AnalysisOwnedRecord[] {
  const counts = new Map<string, { kind: string; rawType: string; count: number }>();
  for (const conversation of message.conversations) {
    for (const normalizedMessage of conversation.messages) {
      for (const event of normalizedMessage.toolEvents) {
        const key = `${event.kind}\u0000${event.rawType}`;
        const current = counts.get(key) ?? { kind: event.kind, rawType: event.rawType, count: 0 };
        current.count += 1;
        counts.set(key, current);
      }
    }
  }
  return [...counts.values()].map((value) => ({
    analysisId: message.analysisId,
    localKey: `${message.batchId}:${value.kind}:${encodeURIComponent(value.rawType)}`,
    value
  }));
}

async function persistBatch(message: BatchMessage): Promise<ImportCheckpoint> {
  const aggregator = createAggregator();
  for (const conversation of message.conversations) await aggregator.acceptConversation(conversation);
  const result = aggregator.finish();

  const conversationRecords: ConversationMetricRecord[] = result.conversations.map((conversation) => ({
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

  const modelRecords: AnalysisOwnedRecord[] = Object.values(result.byModel).map((model) => ({
    analysisId: message.analysisId,
    localKey: `${message.batchId}:${model.modelId}`,
    value: {
      modelId: model.modelId,
      messages: model.messages,
      conversations: model.conversations,
      visibleTokens: model.visibleTokens,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      otherTokens: model.otherTokens,
      rawAliases: [...model.rawAliases],
      usageByDay: Object.fromEntries(Object.entries(model.usageByDay).map(([day, usage]) => [day, { ...usage }])),
      firstTimestamp: model.firstTimestamp,
      lastTimestamp: model.lastTimestamp
    }
  }));

  const timelineRecords: AnalysisOwnedRecord[] = [];
  for (const kind of ['hour', 'day', 'week', 'month', 'year'] as const) {
    for (const [key, bucket] of Object.entries(result.buckets[kind])) {
      timelineRecords.push({
        analysisId: message.analysisId,
        localKey: `${message.batchId}:${kind}:${key}`,
        value: {
          kind,
          key,
          messages: bucket.messages,
          conversations: bucket.conversations,
          visibleTokens: bucket.visibleTokens
        }
      });
    }
  }

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
    const tx = db.transaction(
      ['conversationMetrics', 'modelMetrics', 'timelineMetrics', 'toolMetrics', 'dataQuality', 'checkpoints'],
      'readwrite'
    );
    for (const record of conversationRecords) await tx.objectStore('conversationMetrics').put(record);
    for (const record of modelRecords) await tx.objectStore('modelMetrics').put(record);
    for (const record of timelineRecords) await tx.objectStore('timelineMetrics').put(record);
    for (const record of toolRecords(message)) await tx.objectStore('toolMetrics').put(record);
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
  latestCheckpoint = { ...checkpoint };
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
  if (isQuotaExceededError(error)) {
    scope.postMessage({
      type: 'FAIL',
      code: 'STORAGE_QUOTA_EXCEEDED',
      stage: 'aggregation',
      messageKey: 'import.storageFull',
      checkpoint: latestCheckpoint ? { ...latestCheckpoint } : undefined
    });
  } else {
    scope.postMessage({
      type: 'FAIL',
      code: 'ANALYSIS_WORKER_FAILED',
      stage: 'aggregation',
      messageKey: 'import.analysisFailed'
    });
  }
  cancelled = true;
}

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'START_IMPORT') {
    activeStart = message;
    latestCheckpoint = message.checkpoint ? { ...message.checkpoint } : undefined;
    cancelled = false;
    work = Promise.resolve();
    return;
  }
  if (message.type === 'BATCH') {
    work = work.then(() => handleBatch(message)).catch((error: unknown) => reportFailure(error));
    return;
  }
  if (message.type === 'COMPLETE' && message.source === 'import') {
    work = work.then(() => finalizeAnalysis(message.analysisId)).catch((error: unknown) => reportFailure(error));
    return;
  }
  if (message.type === 'CANCEL') cancelled = true;
});
