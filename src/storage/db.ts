import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const PROFILER_DB_NAME = 'chatgpt-export-profiler';
export const PROFILER_DB_VERSION = 2;

export type AnalysisStatus = 'running' | 'complete' | 'cancelled' | 'failed';

export interface AnalysisRecord {
  id: string;
  fingerprint: string;
  createdAt: number;
  status: AnalysisStatus;
  appVersion: string;
  schemaVersion: number;
  analyzerVersion: number;
  tokenizerVersion: number;
  pricingDatasetVersion: number;
}

export interface StoredConversationRecord {
  analysisId: string;
  conversationId: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface DailyConversationUsage {
  messages: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
  modelIds: string[];
}

export interface ConversationMetricRecord {
  analysisId: string;
  conversationId: string;
  title: string;
  firstTimestamp?: number;
  lastTimestamp?: number;
  messages: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
  modelIds: string[];
  hasWeb: boolean;
  hasFiles: boolean;
  hasTools: boolean;
  usageByDay?: Record<string, DailyConversationUsage>;
}

export interface AnalysisOwnedRecord {
  analysisId: string;
  localKey: string;
  value: Record<string, unknown>;
}

export interface DataQualityRecord {
  analysisId: string;
  value: Record<string, unknown>;
}

export type ImportStage =
  | 'inspection'
  | 'export-detection'
  | 'parsing'
  | 'normalization'
  | 'tokenization'
  | 'aggregation'
  | 'cost'
  | 'indexing'
  | 'complete';

export interface ImportCheckpoint {
  analysisId: string;
  fingerprint: string;
  stage: ImportStage;
  committedBatches: number;
  processedConversations: number;
  updatedAt: number;
  modelAliases?: Record<string, string>;
}

export interface KeyValueRecord {
  key: string;
  value: unknown;
}

export interface ProfilerDbSchema extends DBSchema {
  analyses: {
    key: string;
    value: AnalysisRecord;
  };
  conversations: {
    key: [string, string];
    value: StoredConversationRecord;
    indexes: { 'by-analysis': string };
  };
  conversationMetrics: {
    key: [string, string];
    value: ConversationMetricRecord;
    indexes: {
      'by-analysis': string;
      'by-analysis-visible-tokens': [string, number];
      'by-analysis-input-tokens': [string, number];
      'by-analysis-output-tokens': [string, number];
      'by-analysis-messages': [string, number];
    };
  };
  modelMetrics: {
    key: [string, string];
    value: AnalysisOwnedRecord;
    indexes: { 'by-analysis': string };
  };
  timelineMetrics: {
    key: [string, string];
    value: AnalysisOwnedRecord;
    indexes: { 'by-analysis': string };
  };
  toolMetrics: {
    key: [string, string];
    value: AnalysisOwnedRecord;
    indexes: { 'by-analysis': string };
  };
  costProfiles: {
    key: string;
    value: KeyValueRecord;
  };
  pricingHistory: {
    key: string;
    value: KeyValueRecord;
  };
  dataQuality: {
    key: string;
    value: DataQualityRecord;
  };
  settings: {
    key: string;
    value: KeyValueRecord;
  };
  checkpoints: {
    key: string;
    value: ImportCheckpoint;
  };
}

export async function openProfilerDb(): Promise<IDBPDatabase<ProfilerDbSchema>> {
  return openDB<ProfilerDbSchema>(PROFILER_DB_NAME, PROFILER_DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('analyses')) db.createObjectStore('analyses', { keyPath: 'id' });

      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: ['analysisId', 'conversationId'] });
        store.createIndex('by-analysis', 'analysisId');
      }

      const conversationMetrics = db.objectStoreNames.contains('conversationMetrics')
        ? transaction.objectStore('conversationMetrics')
        : db.createObjectStore('conversationMetrics', { keyPath: ['analysisId', 'conversationId'] });
      if (!conversationMetrics.indexNames.contains('by-analysis')) {
        conversationMetrics.createIndex('by-analysis', 'analysisId');
      }
      if (!conversationMetrics.indexNames.contains('by-analysis-visible-tokens')) {
        conversationMetrics.createIndex('by-analysis-visible-tokens', ['analysisId', 'visibleTokens']);
      }
      if (!conversationMetrics.indexNames.contains('by-analysis-input-tokens')) {
        conversationMetrics.createIndex('by-analysis-input-tokens', ['analysisId', 'inputTokens']);
      }
      if (!conversationMetrics.indexNames.contains('by-analysis-output-tokens')) {
        conversationMetrics.createIndex('by-analysis-output-tokens', ['analysisId', 'outputTokens']);
      }
      if (!conversationMetrics.indexNames.contains('by-analysis-messages')) {
        conversationMetrics.createIndex('by-analysis-messages', ['analysisId', 'messages']);
      }

      for (const name of ['modelMetrics', 'timelineMetrics', 'toolMetrics'] as const) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: ['analysisId', 'localKey'] });
          store.createIndex('by-analysis', 'analysisId');
        }
      }

      if (!db.objectStoreNames.contains('costProfiles')) db.createObjectStore('costProfiles', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pricingHistory')) db.createObjectStore('pricingHistory', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('dataQuality')) db.createObjectStore('dataQuality', { keyPath: 'analysisId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('checkpoints')) db.createObjectStore('checkpoints', { keyPath: 'analysisId' });
    }
  });
}
