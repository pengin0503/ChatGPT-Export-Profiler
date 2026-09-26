// @vitest-environment node
import 'fake-indexeddb/auto';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import minimal from '../fixtures/minimal-conversations.json';
import { normalizeConversation } from '../../src/analysis/normalize';
import { QualityCollector } from '../../src/analysis/quality';
import { inspectExportZip } from '../../src/import/zipInspector';
import { makeZip } from '../helpers/makeZip';
import { getOverviewMetrics } from '../../src/storage/analyticsQueries';
import { openProfilerDb, PROFILER_DB_NAME, type ConversationMetricRecord } from '../../src/storage/db';
import { analysisRepository } from '../../src/storage/repositories';
import { APP_VERSION } from '../../src/version';
import { sanitizeAnalyticsExport, type AnalyticsExport } from '../../src/features/export-results/exportJson';

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

afterEach(async () => {
  await resetDb();
});

function syntheticMetric(analysisId: string, conversationId: string): ConversationMetricRecord {
  return {
    analysisId,
    conversationId,
    title: `Synthetic ${conversationId}`,
    firstTimestamp: 1_797_100_000,
    lastTimestamp: 1_797_100_060,
    messages: 2,
    visibleTokens: 20,
    inputTokens: 8,
    outputTokens: 12,
    otherTokens: 0,
    modelIds: ['gpt-6-sol'],
    hasWeb: false,
    hasFiles: false,
    hasTools: false,
    usageByDay: {
      '2026-12-13': {
        messages: 2,
        visibleTokens: 20,
        inputTokens: 8,
        outputTokens: 12,
        otherTokens: 0,
        modelIds: ['gpt-6-sol']
      }
    }
  };
}

async function seedAnalysis(analysisId: string, count = 2): Promise<void> {
  const db = await openProfilerDb();
  try {
    await db.put('analyses', {
      id: analysisId,
      fingerprint: `synthetic-${analysisId}`,
      createdAt: 1,
      status: 'complete',
      appVersion: APP_VERSION,
      schemaVersion: 2,
      analyzerVersion: 2,
      tokenizerVersion: 2,
      pricingDatasetVersion: 1
    });
    const tx = db.transaction('conversationMetrics', 'readwrite');
    for (let index = 0; index < count; index += 1) {
      await tx.store.put(syntheticMetric(analysisId, `conversation-${index}`));
    }
    await tx.done;
  } finally {
    db.close();
  }
}

describe('second-round reliability hardening', () => {
  it('recognizes current image-part structural fields without storing their values', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(minimal) as unknown as Record<string, unknown>;
    const mapping = raw.mapping as Record<string, Record<string, unknown>>;
    const message = mapping['assistant-node'].message as Record<string, unknown>;
    message.content = {
      content_type: 'multimodal_text',
      parts: [{
        content_type: 'image_asset_pointer',
        asset_pointer: 'synthetic-asset',
        width: 640,
        height: 480,
        mime_type: 'image/png',
        size_bytes: 12345,
        metadata: { synthetic: true },
        fovea: 512
      }]
    };

    normalizeConversation(raw, quality);
    const unknown = quality.snapshot().unknownSchemaKeys;
    for (const key of ['width', 'height', 'mime_type', 'size_bytes', 'metadata', 'fovea']) {
      expect(unknown.some((entry) => entry.includes(`.${key}:`))).toBe(false);
    }
  });

  it('blocks a manifestless shard sequence that does not start at zero', async () => {
    const file = await makeZip([
      { name: 'conversations-1.json', text: '[]' },
      { name: 'conversations-2.json', text: '[]' }
    ]);
    const result = await inspectExportZip(file);
    expect(result.ok).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('INCOMPLETE_CONVERSATION_SHARDS');
  });

  it('computes overview metrics without IndexedDB getAll materialization', async () => {
    await seedAnalysis('bounded-overview', 3);
    const original = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function forbiddenGetAll(): IDBRequest<unknown[]> {
      throw new Error('getAll must not be used by overview aggregation');
    } as typeof IDBIndex.prototype.getAll;
    try {
      const overview = await getOverviewMetrics('bounded-overview');
      expect(overview.totals).toEqual({ conversations: 3, messages: 6, visibleTokens: 60 });
    } finally {
      IDBIndex.prototype.getAll = original;
    }
  });

  it('deletes an analysis without materializing all IndexedDB keys', async () => {
    await seedAnalysis('bounded-delete', 4);
    const original = IDBIndex.prototype.getAllKeys;
    IDBIndex.prototype.getAllKeys = function forbiddenGetAllKeys(): IDBRequest<IDBValidKey[]> {
      throw new Error('getAllKeys must not be used by analysis deletion');
    } as typeof IDBIndex.prototype.getAllKeys;
    try {
      await expect(analysisRepository.delete('bounded-delete')).resolves.toBeUndefined();
      expect(await analysisRepository.get('bounded-delete')).toBeUndefined();
    } finally {
      IDBIndex.prototype.getAllKeys = original;
    }
  });

  it('omits conversation titles from analytics exports unless explicitly requested', () => {
    const fixture: AnalyticsExport = {
      schemaVersion: 1,
      generatedAt: '2026-09-26T00:00:00.000Z',
      overview: {
        conversations: 1,
        messages: 2,
        visibleTokens: 20,
        peakDay: '2026-09-26',
        largestConversationTitle: 'Sensitive synthetic title'
      },
      models: [],
      conversations: [{
        title: 'Sensitive synthetic title',
        visibleTokens: 20,
        messages: 2,
        modelIds: ['gpt-6-sol']
      }]
    };
    const sanitized = sanitizeAnalyticsExport(fixture);
    expect(sanitized.overview.largestConversationTitle).toBeNull();
    expect('title' in sanitized.conversations[0]).toBe(false);
  });

  it('does not configure GitHub Pages for this private repository', () => {
    expect(existsSync('.github/workflows/pages.yml')).toBe(false);
  });

  it('keeps the app, package, and lockfile release-candidate versions aligned', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect(packageJson.version).toBe('1.0.0-rc.2');
    expect(APP_VERSION).toBe(packageJson.version);
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages['']?.version).toBe(packageJson.version);
  });

  it('supports an auditable release-request marker while preserving tag releases', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain("paths:\n      - '.github/release-requests/**'");
    expect(workflow).toContain('Resolve release tag');
    expect(existsSync('.github/release-requests/v1.0.0-rc.2')).toBe(true);
  });
});
