// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import {
  PROFILER_DB_NAME,
  analysisRepository,
  checkpointRepository,
  metricsRepository,
  type AnalysisRecord,
  type ConversationMetricRecord,
  type ImportCheckpoint
} from '../../src/storage/repositories';

const analysis = (id: string): AnalysisRecord => ({
  id,
  fingerprint: `fingerprint-${id}`,
  createdAt: 1_790_000_000_000,
  status: 'complete',
  appVersion: '0.1.0',
  schemaVersion: 1,
  analyzerVersion: 1,
  tokenizerVersion: 1,
  pricingDatasetVersion: 1
});

const metric = (analysisId: string, conversationId: string): ConversationMetricRecord => ({
  analysisId,
  conversationId,
  title: `Synthetic ${conversationId}`,
  messages: 2,
  visibleTokens: 42,
  inputTokens: 12,
  outputTokens: 30,
  otherTokens: 0,
  modelIds: ['gpt-6-sol'],
  hasWeb: false,
  hasFiles: false,
  hasTools: false
});

beforeEach(async () => {
  await deleteDB(PROFILER_DB_NAME);
});

afterEach(async () => {
  await deleteDB(PROFILER_DB_NAME);
});

describe('local analysis repositories', () => {
  it('roundtrips analysis metadata', async () => {
    await analysisRepository.create(analysis('a1'));
    await expect(analysisRepository.get('a1')).resolves.toEqual(analysis('a1'));
    await expect(analysisRepository.list()).resolves.toEqual([analysis('a1')]);
  });

  it('roundtrips bounded conversation metric batches without raw message bodies', async () => {
    await analysisRepository.create(analysis('a1'));
    await metricsRepository.putConversationMetrics('a1', [metric('a1', 'c1'), metric('a1', 'c2')]);
    const stored = await metricsRepository.listConversationMetrics('a1');
    expect(stored).toHaveLength(2);
    expect(stored[0]).not.toHaveProperty('text');
    expect(stored[0]).not.toHaveProperty('messageText');
    expect(stored[0]).not.toHaveProperty('rawBody');
    expect(JSON.stringify(stored)).not.toContain('Synthetic message body sentinel');
  });

  it('saves, loads, and clears a durable checkpoint', async () => {
    await analysisRepository.create(analysis('a1'));
    const checkpoint: ImportCheckpoint = {
      analysisId: 'a1',
      fingerprint: 'fingerprint-a1',
      stage: 'aggregation',
      committedBatches: 3,
      processedConversations: 120,
      updatedAt: 1_790_000_001_000
    };
    await checkpointRepository.save(checkpoint);
    await expect(checkpointRepository.load('a1')).resolves.toEqual(checkpoint);
    await checkpointRepository.clear('a1');
    await expect(checkpointRepository.load('a1')).resolves.toBeUndefined();
  });

  it('deleting an analysis removes only records owned by that analysis', async () => {
    await analysisRepository.create(analysis('a1'));
    await analysisRepository.create(analysis('a2'));
    await metricsRepository.putConversationMetrics('a1', [metric('a1', 'c1')]);
    await metricsRepository.putConversationMetrics('a2', [metric('a2', 'c2')]);
    await checkpointRepository.save({
      analysisId: 'a1',
      fingerprint: 'fingerprint-a1',
      stage: 'tokenization',
      committedBatches: 1,
      processedConversations: 10,
      updatedAt: 1
    });

    await analysisRepository.delete('a1');

    await expect(analysisRepository.get('a1')).resolves.toBeUndefined();
    await expect(metricsRepository.listConversationMetrics('a1')).resolves.toEqual([]);
    await expect(checkpointRepository.load('a1')).resolves.toBeUndefined();
    await expect(analysisRepository.get('a2')).resolves.toEqual(analysis('a2'));
    await expect(metricsRepository.listConversationMetrics('a2')).resolves.toEqual([metric('a2', 'c2')]);
  });
});
