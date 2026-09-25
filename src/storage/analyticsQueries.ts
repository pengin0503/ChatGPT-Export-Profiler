import { openProfilerDb } from './db';
import type { AnalysisOwnedRecord, ConversationMetricRecord } from './db';

export interface DateRange {
  from?: number;
  to?: number;
}

export type ConversationSort =
  | 'visibleTokens-desc'
  | 'visibleTokens-asc'
  | 'inputTokens-desc'
  | 'outputTokens-desc'
  | 'messages-desc'
  | 'duration-desc'
  | 'newest'
  | 'oldest';

export interface ConversationQueryOptions {
  range?: DateRange;
  modelId?: string;
  minTokens?: number;
  maxTokens?: number;
  hasWeb?: boolean;
  hasFiles?: boolean;
  hasTools?: boolean;
  sort?: ConversationSort;
  offset?: number;
  limit?: number;
}

export interface ConversationQueryResult {
  total: number;
  rows: ConversationMetricRecord[];
}

export interface OverviewMetrics {
  totals: { conversations: number; messages: number; visibleTokens: number };
  peakDay: { key: string; messages: number; conversations: number; visibleTokens: number } | null;
  largestConversation: ConversationMetricRecord | null;
}

export interface StoredModelMetric {
  modelId: string;
  messages: number;
  conversations: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
  rawAliases: string[];
  firstTimestamp?: number;
  lastTimestamp?: number;
}

export type TimelineKind = 'hour' | 'day' | 'week' | 'month' | 'year';
export interface StoredTimelineMetric {
  kind: TimelineKind;
  key: string;
  messages: number;
  conversations: number;
  visibleTokens: number;
}

function timestampFor(row: ConversationMetricRecord): number | undefined {
  return row.firstTimestamp ?? row.lastTimestamp;
}

function inRange(row: ConversationMetricRecord, range?: DateRange): boolean {
  if (!range || (range.from === undefined && range.to === undefined)) return true;
  const timestamp = timestampFor(row);
  if (timestamp === undefined) return false;
  if (range.from !== undefined && timestamp < range.from) return false;
  if (range.to !== undefined && timestamp >= range.to) return false;
  return true;
}

function sortRows(rows: ConversationMetricRecord[], sort: ConversationSort): void {
  const duration = (row: ConversationMetricRecord) =>
    Math.max(0, (row.lastTimestamp ?? row.firstTimestamp ?? 0) - (row.firstTimestamp ?? row.lastTimestamp ?? 0));
  const newest = (row: ConversationMetricRecord) => row.lastTimestamp ?? row.firstTimestamp ?? Number.NEGATIVE_INFINITY;
  const comparators: Record<ConversationSort, (a: ConversationMetricRecord, b: ConversationMetricRecord) => number> = {
    'visibleTokens-desc': (a, b) => b.visibleTokens - a.visibleTokens,
    'visibleTokens-asc': (a, b) => a.visibleTokens - b.visibleTokens,
    'inputTokens-desc': (a, b) => b.inputTokens - a.inputTokens,
    'outputTokens-desc': (a, b) => b.outputTokens - a.outputTokens,
    'messages-desc': (a, b) => b.messages - a.messages,
    'duration-desc': (a, b) => duration(b) - duration(a),
    newest: (a, b) => newest(b) - newest(a),
    oldest: (a, b) => newest(a) - newest(b)
  };
  rows.sort((a, b) => comparators[sort](a, b) || a.conversationId.localeCompare(b.conversationId));
}

async function listConversationRows(analysisId: string): Promise<ConversationMetricRecord[]> {
  const db = await openProfilerDb();
  try {
    return await db.getAllFromIndex('conversationMetrics', 'by-analysis', analysisId);
  } finally {
    db.close();
  }
}

export async function queryConversationMetrics(
  analysisId: string,
  options: ConversationQueryOptions = {}
): Promise<ConversationQueryResult> {
  const filtered = (await listConversationRows(analysisId)).filter((row) => {
    if (!inRange(row, options.range)) return false;
    if (options.modelId && !row.modelIds.includes(options.modelId)) return false;
    if (options.minTokens !== undefined && row.visibleTokens < options.minTokens) return false;
    if (options.maxTokens !== undefined && row.visibleTokens > options.maxTokens) return false;
    if (options.hasWeb !== undefined && row.hasWeb !== options.hasWeb) return false;
    if (options.hasFiles !== undefined && row.hasFiles !== options.hasFiles) return false;
    if (options.hasTools !== undefined && row.hasTools !== options.hasTools) return false;
    return true;
  });
  sortRows(filtered, options.sort ?? 'newest');
  const total = filtered.length;
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit ?? 100);
  return { total, rows: filtered.slice(offset, offset + limit) };
}

function utcDay(timestamp: number): string {
  const milliseconds = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export async function getOverviewMetrics(analysisId: string, range?: DateRange): Promise<OverviewMetrics> {
  const rows = (await listConversationRows(analysisId)).filter((row) => inRange(row, range));
  const totals = rows.reduce(
    (acc, row) => ({
      conversations: acc.conversations + 1,
      messages: acc.messages + row.messages,
      visibleTokens: acc.visibleTokens + row.visibleTokens
    }),
    { conversations: 0, messages: 0, visibleTokens: 0 }
  );
  const largestConversation = [...rows].sort(
    (a, b) => b.visibleTokens - a.visibleTokens || a.conversationId.localeCompare(b.conversationId)
  )[0] ?? null;
  const days = new Map<string, { messages: number; conversations: number; visibleTokens: number }>();
  for (const row of rows) {
    const timestamp = timestampFor(row);
    if (timestamp === undefined) continue;
    const key = utcDay(timestamp);
    const value = days.get(key) ?? { messages: 0, conversations: 0, visibleTokens: 0 };
    value.messages += row.messages;
    value.conversations += 1;
    value.visibleTokens += row.visibleTokens;
    days.set(key, value);
  }
  const peak = [...days.entries()].sort(
    (a, b) => b[1].messages - a[1].messages || b[1].visibleTokens - a[1].visibleTokens || a[0].localeCompare(b[0])
  )[0];
  return {
    totals,
    largestConversation,
    peakDay: peak ? { key: peak[0], ...peak[1] } : null
  };
}

function recordValue(record: AnalysisOwnedRecord): Record<string, unknown> {
  return record.value;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function getModelMetrics(analysisId: string): Promise<StoredModelMetric[]> {
  const db = await openProfilerDb();
  try {
    const records = await db.getAllFromIndex('modelMetrics', 'by-analysis', analysisId);
    const merged = new Map<string, StoredModelMetric & { aliases: Set<string> }>();
    for (const record of records) {
      const value = recordValue(record);
      const modelId = typeof value.modelId === 'string' ? value.modelId : undefined;
      if (!modelId) continue;
      let target = merged.get(modelId);
      if (!target) {
        target = {
          modelId,
          messages: 0,
          conversations: 0,
          visibleTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          otherTokens: 0,
          rawAliases: [],
          aliases: new Set()
        };
        merged.set(modelId, target);
      }
      target.messages += number(value.messages);
      target.conversations += number(value.conversations);
      target.visibleTokens += number(value.visibleTokens);
      target.inputTokens += number(value.inputTokens);
      target.outputTokens += number(value.outputTokens);
      target.otherTokens += number(value.otherTokens);
      if (Array.isArray(value.rawAliases)) {
        for (const alias of value.rawAliases) if (typeof alias === 'string') target.aliases.add(alias);
      }
      const first = optionalNumber(value.firstTimestamp);
      const last = optionalNumber(value.lastTimestamp);
      if (first !== undefined) target.firstTimestamp = target.firstTimestamp === undefined ? first : Math.min(target.firstTimestamp, first);
      if (last !== undefined) target.lastTimestamp = target.lastTimestamp === undefined ? last : Math.max(target.lastTimestamp, last);
    }
    return [...merged.values()]
      .map(({ aliases, ...value }) => ({ ...value, rawAliases: [...aliases].sort() }))
      .sort((a, b) => b.visibleTokens - a.visibleTokens || a.modelId.localeCompare(b.modelId));
  } finally {
    db.close();
  }
}

export async function getTimelineMetrics(analysisId: string, kind: TimelineKind): Promise<StoredTimelineMetric[]> {
  const db = await openProfilerDb();
  try {
    const records = await db.getAllFromIndex('timelineMetrics', 'by-analysis', analysisId);
    const merged = new Map<string, StoredTimelineMetric>();
    for (const record of records) {
      const value = recordValue(record);
      if (value.kind !== kind || typeof value.key !== 'string') continue;
      const current = merged.get(value.key) ?? { kind, key: value.key, messages: 0, conversations: 0, visibleTokens: 0 };
      current.messages += number(value.messages);
      current.conversations += number(value.conversations);
      current.visibleTokens += number(value.visibleTokens);
      merged.set(value.key, current);
    }
    return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
  } finally {
    db.close();
  }
}
