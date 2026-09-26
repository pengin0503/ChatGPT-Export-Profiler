import { openProfilerDb, PROFILER_DB_NAME } from './db';
import type { AnalysisRecord, AnalysisStatus, ConversationMetricRecord, ImportCheckpoint } from './db';

export { PROFILER_DB_NAME };
export type { AnalysisRecord, ConversationMetricRecord, ImportCheckpoint };

async function withDb<T>(operation: (db: Awaited<ReturnType<typeof openProfilerDb>>) => Promise<T>): Promise<T> {
  const db = await openProfilerDb();
  try {
    return await operation(db);
  } finally {
    db.close();
  }
}

async function assertAnalysisOwnsMetrics(analysisId: string, records: ConversationMetricRecord[]): Promise<void> {
  for (const record of records) {
    if (record.analysisId !== analysisId) {
      throw new Error(`Conversation metric analysisId mismatch: expected ${analysisId}.`);
    }
  }
}

export const analysisRepository = {
  async create(record: AnalysisRecord): Promise<void> {
    await withDb(async (db) => {
      await db.add('analyses', record);
    });
  },

  async get(id: string): Promise<AnalysisRecord | undefined> {
    return withDb((db) => db.get('analyses', id));
  },

  async list(): Promise<AnalysisRecord[]> {
    return withDb(async (db) => {
      const records = await db.getAll('analyses');
      return records.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    });
  },

  async updateStatus(id: string, status: AnalysisStatus): Promise<void> {
    await withDb(async (db) => {
      const record = await db.get('analyses', id);
      if (!record) return;
      await db.put('analyses', { ...record, status });
    });
  },

  async delete(id: string): Promise<void> {
    await withDb(async (db) => {
      const tx = db.transaction(
        [
          'analyses',
          'conversations',
          'conversationMetrics',
          'modelMetrics',
          'timelineMetrics',
          'toolMetrics',
          'dataQuality',
          'checkpoints',
          'costProfiles',
          'settings'
        ],
        'readwrite'
      );

      const conversations = tx.objectStore('conversations');
      let conversationCursor = await conversations.index('by-analysis').openKeyCursor(id);
      while (conversationCursor) {
        await conversations.delete(conversationCursor.primaryKey);
        conversationCursor = await conversationCursor.continue();
      }

      const conversationMetrics = tx.objectStore('conversationMetrics');
      let metricCursor = await conversationMetrics.index('by-analysis').openKeyCursor(id);
      while (metricCursor) {
        await conversationMetrics.delete(metricCursor.primaryKey);
        metricCursor = await metricCursor.continue();
      }

      const modelMetrics = tx.objectStore('modelMetrics');
      let modelCursor = await modelMetrics.index('by-analysis').openKeyCursor(id);
      while (modelCursor) {
        await modelMetrics.delete(modelCursor.primaryKey);
        modelCursor = await modelCursor.continue();
      }

      const timelineMetrics = tx.objectStore('timelineMetrics');
      let timelineCursor = await timelineMetrics.index('by-analysis').openKeyCursor(id);
      while (timelineCursor) {
        await timelineMetrics.delete(timelineCursor.primaryKey);
        timelineCursor = await timelineCursor.continue();
      }

      const toolMetrics = tx.objectStore('toolMetrics');
      let toolCursor = await toolMetrics.index('by-analysis').openKeyCursor(id);
      while (toolCursor) {
        await toolMetrics.delete(toolCursor.primaryKey);
        toolCursor = await toolCursor.continue();
      }

      await tx.objectStore('dataQuality').delete(id);
      await tx.objectStore('checkpoints').delete(id);
      await tx.objectStore('costProfiles').delete(`scenario:${id}`);
      await tx.objectStore('settings').delete(`comparison:${id}`);
      await tx.objectStore('analyses').delete(id);
      await tx.done;
    });
  }
};

export const metricsRepository = {
  async putConversationMetrics(analysisId: string, records: ConversationMetricRecord[]): Promise<void> {
    await assertAnalysisOwnsMetrics(analysisId, records);
    await withDb(async (db) => {
      const tx = db.transaction('conversationMetrics', 'readwrite');
      for (const record of records) await tx.store.put(record);
      await tx.done;
    });
  },

  async listConversationMetrics(analysisId: string): Promise<ConversationMetricRecord[]> {
    return withDb(async (db) => {
      const records = await db.getAllFromIndex('conversationMetrics', 'by-analysis', analysisId);
      return records.sort((a, b) => a.conversationId.localeCompare(b.conversationId));
    });
  }
};

export const checkpointRepository = {
  async save(checkpoint: ImportCheckpoint): Promise<void> {
    await withDb(async (db) => {
      await db.put('checkpoints', checkpoint);
    });
  },

  async load(analysisId: string): Promise<ImportCheckpoint | undefined> {
    return withDb((db) => db.get('checkpoints', analysisId));
  },

  async clear(analysisId: string): Promise<void> {
    await withDb(async (db) => {
      await db.delete('checkpoints', analysisId);
    });
  }
};
