import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const PROFILER_DB_NAME = 'chatgpt-export-profiler';
export const PROFILER_DB_VERSION = 1;

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
    indexes: { 'by-analysis': string };
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

export type ProfilerDatabase = IDBPDatabase<ProfilerDbSchema>;

export function openProfilerDb(): Promise<ProfilerDatabase> {
  return openDB<ProfilerDbSchema>(PROFILER_DB_NAME, PROFILER_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion >= 1) return;

      db.createObjectStore('analyses', { keyPath: 'id' });

      const conversations = db.createObjectStore('conversations', {
        keyPath: ['analysisId', 'conversationId']
      });
      conversations.createIndex('by-analysis', 'analysisId');

      const conversationMetrics = db.createObjectStore('conversationMetrics', {
        keyPath: ['analysisId', 'conversationId']
      });
      conversationMetrics.createIndex('by-analysis', 'analysisId');

      const modelMetrics = db.createObjectStore('modelMetrics', {
        keyPath: ['analysisId', 'localKey']
      });
      modelMetrics.createIndex('by-analysis', 'analysisId');

      const timelineMetrics = db.createObjectStore('timelineMetrics', {
        keyPath: ['analysisId', 'localKey']
      });
      timelineMetrics.createIndex('by-analysis', 'analysisId');

      const toolMetrics = db.createObjectStore('toolMetrics', {
        keyPath: ['analysisId', 'localKey']
      });
      toolMetrics.createIndex('by-analysis', 'analysisId');

      db.createObjectStore('costProfiles', { keyPath: 'key' });
      db.createObjectStore('pricingHistory', { keyPath: 'key' });
      db.createObjectStore('dataQuality', { keyPath: 'analysisId' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('checkpoints', { keyPath: 'analysisId' });
    }
  });
}
