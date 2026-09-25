import type { NormalizedConversation } from '../analysis/domain';
import type { QualitySnapshot } from '../analysis/quality';
import type { ImportCheckpoint } from '../storage/repositories';
import type { ImportStage } from '../storage/db';

export type PerformanceProfileName = 'safe' | 'standard' | 'fast';

export interface PerformanceProfile {
  maxInFlightBatches: number;
  batchSize: number;
}

export const PERFORMANCE_PROFILES: Readonly<Record<PerformanceProfileName, PerformanceProfile>> = {
  safe: { maxInFlightBatches: 1, batchSize: 25 },
  standard: { maxInFlightBatches: 2, batchSize: 50 },
  fast: { maxInFlightBatches: 4, batchSize: 100 }
};

export interface StartImportMessage {
  type: 'START_IMPORT';
  analysisId: string;
  fingerprint: string;
  profile: PerformanceProfileName;
  file?: Blob;
  checkpoint?: ImportCheckpoint;
  modelAliases?: Record<string, string>;
}

export interface BatchMessage {
  type: 'BATCH';
  analysisId: string;
  fingerprint: string;
  batchId: number;
  processedConversations: number;
  conversations: NormalizedConversation[];
  quality: QualitySnapshot;
}

export interface BatchAckMessage {
  type: 'BATCH_ACK';
  batchId: number;
  checkpoint: ImportCheckpoint;
}

export interface ProgressMessage {
  type: 'PROGRESS';
  stage: ImportStage;
  processedConversations: number;
  messageKey?: string;
}

export interface WarningMessage {
  type: 'WARNING';
  code: string;
  stage: ImportStage;
  messageKey: string;
}

export interface CompleteMessage {
  type: 'COMPLETE';
  analysisId: string;
  source: 'import' | 'analysis';
}

export interface CancelMessage {
  type: 'CANCEL';
}

export interface FailMessage {
  type: 'FAIL';
  code: string;
  stage: ImportStage;
  messageKey: string;
  checkpoint?: ImportCheckpoint;
}

export type PipelineMessage =
  | StartImportMessage
  | BatchMessage
  | BatchAckMessage
  | ProgressMessage
  | WarningMessage
  | CompleteMessage
  | CancelMessage
  | FailMessage;

export interface BoundedBatchProducerOptions<T> {
  batchSize: number;
  maxInFlightBatches: number;
  sendBatch(batch: T[]): Promise<void>;
}

export async function runBoundedBatchProducer<T>(
  source: AsyncIterable<T>,
  options: BoundedBatchProducerOptions<T>
): Promise<void> {
  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new RangeError('batchSize must be a positive integer.');
  }
  if (!Number.isInteger(options.maxInFlightBatches) || options.maxInFlightBatches <= 0) {
    throw new RangeError('maxInFlightBatches must be a positive integer.');
  }

  const inFlight = new Set<Promise<void>>();
  let batch: T[] = [];

  const launch = (values: T[]): void => {
    const task = Promise.resolve().then(() => options.sendBatch(values));
    inFlight.add(task);
    task.then(
      () => inFlight.delete(task),
      () => inFlight.delete(task)
    );
  };

  for await (const value of source) {
    batch.push(value);
    if (batch.length < options.batchSize) continue;

    launch(batch);
    batch = [];
    if (inFlight.size >= options.maxInFlightBatches) {
      await Promise.race(inFlight);
    }
  }

  if (batch.length > 0) launch(batch);
  await Promise.all(inFlight);
}
