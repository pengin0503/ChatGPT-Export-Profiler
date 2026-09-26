import { openProfilerDb } from './db';
import type { AnalysisOwnedRecord, ConversationMetricRecord, DailyConversationUsage } from './db';

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
  usageByDay: Record<string, { inputTokens: number; outputTokens: number }>;
}

export type TimelineKind = 'hour' | 'day' | 'week' | 'month' | 'year';
export interface StoredTimelineMetric {
  kind: TimelineKind;
  key: string;
  messages: number;
  conversations: number;
  visibleTokens: number;
}

function toSeconds(timestamp: number): number {
  return timestamp < 100_000_000_000 ? timestamp : timestamp / 1000;
}

function rangeBound(value?: number): number | undefined {
  return value === undefined ? undefined : toSeconds(value);
}

function timestampFor(row: ConversationMetricRecord): number | undefined {
  return row.firstTimestamp ?? row.lastTimestamp;
}

function rowOverlapsRange(row: ConversationMetricRecord, range?: DateRange): boolean {
  if (!range || (range.from === undefined && range.to === undefined)) return true;
  const first = row.firstTimestamp ?? row.lastTimestamp;
  const last = row.lastTimestamp ?? row.firstTimestamp;
  if (first === undefined || last === undefined) return false;
  const start = toSeconds(Math.min(first, last));
  const end = toSeconds(Math.max(first, last));
  const from = rangeBound(range.from);
  const to = rangeBound(range.to);
  if (from !== undefined && end < from) return false;
  if (to !== undefined && start >= to) return false;
  return true;
}

function dayStartSeconds(day: string): number | undefined {
  const milliseconds = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : undefined;
}

function dayInRange(day: string, range?: DateRange): boolean {
  if (!range || (range.from === undefined && range.to === undefined)) return true;
  const start = dayStartSeconds(day);
  if (start === undefined) return false;
  const end = start + 86_400;
  const from = rangeBound(range.from);
  const to = rangeBound(range.to);
  if (from !== undefined && end <= from) return false;
  if (to !== undefined && start >= to) return false;
  return true;
}

function dailyEntries(row: ConversationMetricRecord): Array<[string, DailyConversationUsage]> {
  if (!row.usageByDay) return [];
  return Object.entries(row.usageByDay).filter(([, usage]) =>
    usage !== undefined &&
    Number.isFinite(usage.messages) &&
    Number.isFinite(usage.visibleTokens)
  );
}

function projectConversation(row: ConversationMetricRecord, range?: DateRange): ConversationMetricRecord | null {
  if (!range || (range.from === undefined && range.to === undefined)) return row;
  const entries = dailyEntries(row);
  if (entries.length === 0) return rowOverlapsRange(row, range) ? row : null;

  const matching = entries.filter(([day]) => dayInRange(day, range));
  if (matching.length === 0) return null;

  const modelIds = new Set<string>();
  const totals = matching.reduce(
    (acc, [, usage]) => {
      acc.messages += usage.messages;
      acc.visibleTokens += usage.visibleTokens;
      acc.inputTokens += usage.inputTokens;
      acc.outputTokens += usage.outputTokens;
      acc.otherTokens += usage.otherTokens;
      for (const modelId of usage.modelIds) modelIds.add(modelId);
      return acc;
    },
    { messages: 0, visibleTokens: 0, inputTokens: 0, outputTokens: 0, otherTokens: 0 }
  );

  return {
    ...row,
    ...totals,
    modelIds: [...modelIds].sort(),
    usageByDay: Object.fromEntries(matching.map(([day, usage]) => [day, { ...usage, modelIds: [...usage.modelIds] }]))
  };
}

function rowComparator(sort: ConversationSort): (a: ConversationMetricRecord, b: ConversationMetricRecord) => number {
  const normalized = (value: number | undefined, fallback: number) => value === undefined ? fallback : toSeconds(value);
  const duration = (row: ConversationMetricRecord) =>
    Math.max(0, normalized(row.lastTimestamp ?? row.firstTimestamp, 0) - normalized(row.firstTimestamp ?? row.lastTimestamp, 0));
  const newest = (row: ConversationMetricRecord) => normalized(row.lastTimestamp ?? row.firstTimestamp, Number.NEGATIVE_INFINITY);
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
  const compare = comparators[sort];
  return (a, b) => compare(a, b) || a.conversationId.localeCompare(b.conversationId);
}

function sortRows(rows: ConversationMetricRecord[], sort: ConversationSort): void {
  rows.sort(rowComparator(sort));
}

function projectAndFilterConversation(
  source: ConversationMetricRecord,
  options: ConversationQueryOptions
): ConversationMetricRecord | null {
  const row = projectConversation(source, options.range);
  if (!row) return null;
  if (options.modelId && !row.modelIds.includes(options.modelId)) return null;
  if (options.minTokens !== undefined && row.visibleTokens < options.minTokens) return null;
  if (options.maxTokens !== undefined && row.visibleTokens > options.maxTokens) return null;
  if (options.hasWeb !== undefined && row.hasWeb !== options.hasWeb) return null;
  if (options.hasFiles !== undefined && row.hasFiles !== options.hasFiles) return null;
  if (options.hasTools !== undefined && row.hasTools !== options.hasTools) return null;
  return row;
}

function retainBoundedSorted(
  rows: ConversationMetricRecord[],
  row: ConversationMetricRecord,
  compare: (a: ConversationMetricRecord, b: ConversationMetricRecord) => number,
  maximum: number
): void {
  if (maximum <= 0) return;
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(row, rows[middle]) < 0) high = middle;
    else low = middle + 1;
  }
  rows.splice(low, 0, row);
  if (rows.length > maximum) rows.pop();
}

async function listConversationRows(analysisId: string): Promise<ConversationMetricRecord[]> {
  const db = await openProfilerDb();
  try {
    return await db.getAllFromIndex('conversationMetrics', 'by-analysis', analysisId);
  } finally {
    db.close();
  }
}

async function scanConversationPage(
  analysisId: string,
  options: ConversationQueryOptions
): Promise<ConversationQueryResult> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit ?? 100);
  const maximum = Math.min(Number.MAX_SAFE_INTEGER, offset + limit);
  const compare = rowComparator(options.sort ?? 'newest');
  const rows: ConversationMetricRecord[] = [];
  let total = 0;
  const db = await openProfilerDb();
  try {
    const tx = db.transaction('conversationMetrics', 'readonly');
    const index = tx.store.index('by-analysis');
    let cursor = await index.openCursor(analysisId);
    while (cursor) {
      const row = projectAndFilterConversation(cursor.value, options);
      if (row) {
        total += 1;
        retainBoundedSorted(rows, row, compare, maximum);
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  } finally {
    db.close();
  }
  return { total, rows: rows.slice(offset, offset + limit) };
}

export async function queryConversationMetrics(
  analysisId: string,
  options: ConversationQueryOptions = {}
): Promise<ConversationQueryResult> {
  return scanConversationPage(analysisId, options);
}

export async function listAllConversationMetrics(
  analysisId: string,
  options: Omit<ConversationQueryOptions, 'offset' | 'limit'> = {}
): Promise<ConversationMetricRecord[]> {
  const result = await queryConversationMetrics(analysisId, { ...options, offset: 0, limit: Number.MAX_SAFE_INTEGER });
  return result.rows;
}

function utcDay(timestamp: number): string {
  const milliseconds = toSeconds(timestamp) * 1000;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export async function getOverviewMetrics(analysisId: string, range?: DateRange): Promise<OverviewMetrics> {
  const sourceRows = await listConversationRows(analysisId);
  const rows = sourceRows.flatMap((row) => {
    const projected = projectConversation(row, range);
    return projected ? [projected] : [];
  });
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
  for (const source of sourceRows) {
    const entries = dailyEntries(source);
    if (entries.length > 0) {
      for (const [key, usage] of entries) {
        if (!dayInRange(key, range)) continue;
        const value = days.get(key) ?? { messages: 0, conversations: 0, visibleTokens: 0 };
        value.messages += usage.messages;
        value.conversations += 1;
        value.visibleTokens += usage.visibleTokens;
        days.set(key, value);
      }
      continue;
    }
    const projected = projectConversation(source, range);
    if (!projected) continue;
    const timestamp = timestampFor(projected);
    if (timestamp === undefined) continue;
    const key = utcDay(timestamp);
    const value = days.get(key) ?? { messages: 0, conversations: 0, visibleTokens: 0 };
    value.messages += projected.messages;
    value.conversations += 1;
    value.visibleTokens += projected.visibleTokens;
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
          usageByDay: {},
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
      if (typeof value.usageByDay === 'object' && value.usageByDay !== null && !Array.isArray(value.usageByDay)) {
        for (const [day, usage] of Object.entries(value.usageByDay)) {
          if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) continue;
          const daily = usage as Record<string, unknown>;
          const existing = target.usageByDay[day] ?? { inputTokens: 0, outputTokens: 0 };
          existing.inputTokens += number(daily.inputTokens);
          existing.outputTokens += number(daily.outputTokens);
          target.usageByDay[day] = existing;
        }
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

export async function getTopModelId(analysisId: string, range?: DateRange): Promise<string | undefined> {
  const models = await getModelMetrics(analysisId);
  if (!range || (range.from === undefined && range.to === undefined)) return models[0]?.modelId;

  const ranked = models.map((model) => {
    const entries = Object.entries(model.usageByDay);
    let visibleTokens = 0;
    if (entries.length > 0) {
      for (const [day, usage] of entries) {
        if (dayInRange(day, range)) visibleTokens += usage.inputTokens + usage.outputTokens;
      }
    } else {
      const fallbackRow: ConversationMetricRecord = {
        analysisId,
        conversationId: model.modelId,
        title: model.modelId,
        firstTimestamp: model.firstTimestamp,
        lastTimestamp: model.lastTimestamp,
        messages: model.messages,
        visibleTokens: model.visibleTokens,
        inputTokens: model.inputTokens,
        outputTokens: model.outputTokens,
        otherTokens: model.otherTokens,
        modelIds: [model.modelId],
        hasWeb: false,
        hasFiles: false,
        hasTools: false
      };
      if (rowOverlapsRange(fallbackRow, range)) visibleTokens = model.visibleTokens;
    }
    return { modelId: model.modelId, visibleTokens };
  }).filter((entry) => entry.visibleTokens > 0);

  ranked.sort((a, b) => b.visibleTokens - a.visibleTokens || a.modelId.localeCompare(b.modelId));
  return ranked[0]?.modelId;
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
