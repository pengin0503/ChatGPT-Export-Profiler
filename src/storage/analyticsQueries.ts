import { calculateVisibleCost, findPrice, type PricingRecord } from '../analysis/pricing';
import { openProfilerDb } from './db';
import type {
  AnalysisOwnedRecord,
  ConversationMetricRecord,
  DailyConversationUsage,
  StoredModelTokenUsage
} from './db';

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
  | 'cost-desc'
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
  pricing?: readonly PricingRecord[];
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
  peakDay: { key: string } & AggregateBucket | null;
  largestConversation: ConversationMetricRecord | null;
}

interface AggregateBucket {
  messages: number;
  conversations: number;
  visibleTokens: number;
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
  usageByDay: Record<string, StoredModelTokenUsage>;
}

export type TimelineKind = 'hour' | 'day' | 'week' | 'month' | 'year';
export interface StoredTimelineMetric {
  kind: TimelineKind;
  key: string;
  messages: number;
  conversations: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
  webSearches: number;
  toolEvents: number;
  usageByDay: Record<string, Record<string, StoredModelTokenUsage>>;
}

export interface PricingAwareCost {
  cost: number;
  coverageComplete: boolean;
  hasUsage: boolean;
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

export function dayInRange(day: string, range?: DateRange): boolean {
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

function cloneDailyUsage(usage: DailyConversationUsage): DailyConversationUsage {
  return {
    ...usage,
    modelIds: [...usage.modelIds],
    ...(usage.byModel ? {
      byModel: Object.fromEntries(Object.entries(usage.byModel).map(([modelId, tokens]) => [modelId, { ...tokens }]))
    } : {})
  };
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
    usageByDay: Object.fromEntries(matching.map(([day, usage]) => [day, cloneDailyUsage(usage)]))
  };
}

export function calculatePricingAwareCost(
  usageByDay: Readonly<Record<string, Readonly<Record<string, StoredModelTokenUsage>>>> | undefined,
  pricing: readonly PricingRecord[]
): PricingAwareCost {
  let cost = 0;
  let coverageComplete = true;
  let hasUsage = false;
  for (const [day, models] of Object.entries(usageByDay ?? {})) {
    const timestamp = Date.parse(`${day}T12:00:00.000Z`);
    if (!Number.isFinite(timestamp)) {
      coverageComplete = false;
      continue;
    }
    for (const [modelId, usage] of Object.entries(models)) {
      if (usage.inputTokens === 0 && usage.outputTokens === 0) continue;
      hasUsage = true;
      const record = findPrice(modelId, timestamp, pricing);
      if (!record) {
        coverageComplete = false;
        continue;
      }
      cost += calculateVisibleCost(usage.inputTokens, usage.outputTokens, record);
    }
  }
  return { cost, coverageComplete: hasUsage && coverageComplete, hasUsage };
}

function conversationUsageByDay(row: ConversationMetricRecord): Record<string, Record<string, StoredModelTokenUsage>> | undefined {
  const entries = dailyEntries(row);
  if (entries.length === 0) return undefined;
  const result: Record<string, Record<string, StoredModelTokenUsage>> = {};
  for (const [day, usage] of entries) {
    if (!usage.byModel) return undefined;
    result[day] = Object.fromEntries(Object.entries(usage.byModel).map(([modelId, tokens]) => [modelId, { ...tokens }]));
  }
  return result;
}

function attachConversationPricing(
  row: ConversationMetricRecord,
  pricing?: readonly PricingRecord[]
): ConversationMetricRecord {
  if (!pricing) return row;
  const result = calculatePricingAwareCost(conversationUsageByDay(row), pricing);
  return {
    ...row,
    apiEquivalentCost: result.cost,
    pricingCoverageComplete: result.coverageComplete
  };
}

function rowComparator(sort: ConversationSort): (a: ConversationMetricRecord, b: ConversationMetricRecord) => number {
  const normalized = (value: number | undefined, fallback: number) => value === undefined ? fallback : toSeconds(value);
  const duration = (row: ConversationMetricRecord) =>
    Math.max(0, normalized(row.lastTimestamp ?? row.firstTimestamp, 0) - normalized(row.firstTimestamp ?? row.lastTimestamp, 0));
  const newest = (row: ConversationMetricRecord) => normalized(row.lastTimestamp ?? row.firstTimestamp, Number.NEGATIVE_INFINITY);
  const cost = (row: ConversationMetricRecord) => row.pricingCoverageComplete ? (row.apiEquivalentCost ?? 0) : Number.NEGATIVE_INFINITY;
  const comparators: Record<ConversationSort, (a: ConversationMetricRecord, b: ConversationMetricRecord) => number> = {
    'visibleTokens-desc': (a, b) => b.visibleTokens - a.visibleTokens,
    'visibleTokens-asc': (a, b) => a.visibleTokens - b.visibleTokens,
    'inputTokens-desc': (a, b) => b.inputTokens - a.inputTokens,
    'outputTokens-desc': (a, b) => b.outputTokens - a.outputTokens,
    'messages-desc': (a, b) => b.messages - a.messages,
    'cost-desc': (a, b) => cost(b) - cost(a),
    'duration-desc': (a, b) => duration(b) - duration(a),
    newest: (a, b) => newest(b) - newest(a),
    oldest: (a, b) => newest(a) - newest(b)
  };
  const compare = comparators[sort];
  return (a, b) => compare(a, b) || a.conversationId.localeCompare(b.conversationId);
}

function projectAndFilterConversation(
  source: ConversationMetricRecord,
  options: ConversationQueryOptions
): ConversationMetricRecord | null {
  const projected = projectConversation(source, options.range);
  if (!projected) return null;
  const row = attachConversationPricing(projected, options.pricing);
  if (options.modelId && !row.modelIds.includes(options.modelId)) return null;
  if (options.minTokens !== undefined && row.visibleTokens < options.minTokens) return null;
  if (options.maxTokens !== undefined && row.visibleTokens > options.maxTokens) return null;
  if (options.hasWeb !== undefined && row.hasWeb !== options.hasWeb) return null;
  if (options.hasFiles !== undefined && row.hasFiles !== options.hasFiles) return null;
  if (options.hasTools !== undefined && row.hasTools !== options.hasTools) return null;
  return row;
}

function siftHeapUp(
  heap: ConversationMetricRecord[],
  index: number,
  compare: (a: ConversationMetricRecord, b: ConversationMetricRecord) => number
): void {
  let current = index;
  while (current > 0) {
    const parent = (current - 1) >>> 1;
    if (compare(heap[current], heap[parent]) <= 0) break;
    [heap[current], heap[parent]] = [heap[parent], heap[current]];
    current = parent;
  }
}

function siftHeapDown(
  heap: ConversationMetricRecord[],
  compare: (a: ConversationMetricRecord, b: ConversationMetricRecord) => number
): void {
  let current = 0;
  while (true) {
    const left = current * 2 + 1;
    const right = left + 1;
    let worst = current;
    if (left < heap.length && compare(heap[left], heap[worst]) > 0) worst = left;
    if (right < heap.length && compare(heap[right], heap[worst]) > 0) worst = right;
    if (worst === current) return;
    [heap[current], heap[worst]] = [heap[worst], heap[current]];
    current = worst;
  }
}

function retainBoundedBest(
  heap: ConversationMetricRecord[],
  row: ConversationMetricRecord,
  compare: (a: ConversationMetricRecord, b: ConversationMetricRecord) => number,
  maximum: number
): void {
  if (maximum <= 0) return;
  if (heap.length < maximum) {
    heap.push(row);
    siftHeapUp(heap, heap.length - 1, compare);
    return;
  }
  if (compare(row, heap[0]) >= 0) return;
  heap[0] = row;
  siftHeapDown(heap, compare);
}

function hasConversationFilters(options: ConversationQueryOptions): boolean {
  return Boolean(
    options.range ||
    options.modelId ||
    options.minTokens !== undefined ||
    options.maxTokens !== undefined ||
    options.hasWeb !== undefined ||
    options.hasFiles !== undefined ||
    options.hasTools !== undefined
  );
}

async function countConversationRows(
  analysisId: string,
  options: ConversationQueryOptions
): Promise<number> {
  const db = await openProfilerDb();
  try {
    const tx = db.transaction('conversationMetrics', 'readonly');
    const index = tx.store.index('by-analysis');
    if (!hasConversationFilters(options)) {
      const total = await index.count(analysisId);
      await tx.done;
      return total;
    }

    let total = 0;
    let cursor = await index.openCursor(analysisId);
    while (cursor) {
      if (projectAndFilterConversation(cursor.value, options)) total += 1;
      cursor = await cursor.continue();
    }
    await tx.done;
    return total;
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
  const total = await countConversationRows(analysisId, options);
  if (limit === 0 || offset >= total) return { total, rows: [] };

  const pageLength = Math.min(limit, total - offset);
  const compare = rowComparator(options.sort ?? 'newest');
  const headSize = Math.min(Number.MAX_SAFE_INTEGER, offset + pageLength);
  const tailSize = total - offset;
  const retainTail = tailSize < headSize;
  const maximum = retainTail ? tailSize : headSize;
  const retentionCompare = retainTail
    ? (a: ConversationMetricRecord, b: ConversationMetricRecord) => compare(b, a)
    : compare;
  const rows: ConversationMetricRecord[] = [];

  const db = await openProfilerDb();
  try {
    const tx = db.transaction('conversationMetrics', 'readonly');
    const index = tx.store.index('by-analysis');
    let cursor = await index.openCursor(analysisId);
    while (cursor) {
      const row = projectAndFilterConversation(cursor.value, options);
      if (row) retainBoundedBest(rows, row, retentionCompare, maximum);
      cursor = await cursor.continue();
    }
    await tx.done;
  } finally {
    db.close();
  }

  rows.sort(compare);
  if (retainTail) return { total, rows: rows.slice(0, pageLength) };
  return { total, rows: rows.slice(offset, offset + pageLength) };
}

export async function queryConversationMetrics(
  analysisId: string,
  options: ConversationQueryOptions = {}
): Promise<ConversationQueryResult> {
  return scanConversationPage(analysisId, options);
}

export async function forEachConversationMetric(
  analysisId: string,
  visitor: (row: ConversationMetricRecord) => void | Promise<void>,
  options: Omit<ConversationQueryOptions, 'offset' | 'limit' | 'sort'> = {}
): Promise<void> {
  const db = await openProfilerDb();
  try {
    const tx = db.transaction('conversationMetrics', 'readonly');
    let cursor = await tx.store.index('by-analysis').openCursor(analysisId);
    while (cursor) {
      const row = projectAndFilterConversation(cursor.value, options);
      if (row) await visitor(row);
      cursor = await cursor.continue();
    }
    await tx.done;
  } finally {
    db.close();
  }
}

export async function listAllConversationMetrics(
  analysisId: string,
  options: Omit<ConversationQueryOptions, 'offset' | 'limit'> = {}
): Promise<ConversationMetricRecord[]> {
  const rows: ConversationMetricRecord[] = [];
  await forEachConversationMetric(analysisId, (row) => { rows.push(row); }, options);
  rows.sort(rowComparator(options.sort ?? 'newest'));
  return rows;
}

function utcDay(timestamp: number): string {
  const milliseconds = toSeconds(timestamp) * 1000;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export async function getOverviewMetrics(analysisId: string, range?: DateRange): Promise<OverviewMetrics> {
  const totals = { conversations: 0, messages: 0, visibleTokens: 0 };
  let largestConversation: ConversationMetricRecord | null = null;
  const days = new Map<string, { messages: number; conversations: number; visibleTokens: number }>();

  await forEachConversationMetric(analysisId, (source) => {
    const projected = projectConversation(source, range);
    if (!projected) return;
    totals.conversations += 1;
    totals.messages += projected.messages;
    totals.visibleTokens += projected.visibleTokens;
    if (
      largestConversation === null ||
      projected.visibleTokens > largestConversation.visibleTokens ||
      (projected.visibleTokens === largestConversation.visibleTokens && projected.conversationId.localeCompare(largestConversation.conversationId) < 0)
    ) {
      largestConversation = projected;
    }

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
      return;
    }
    const timestamp = timestampFor(projected);
    if (timestamp === undefined) return;
    const key = utcDay(timestamp);
    const value = days.get(key) ?? { messages: 0, conversations: 0, visibleTokens: 0 };
    value.messages += projected.messages;
    value.conversations += 1;
    value.visibleTokens += projected.visibleTokens;
    days.set(key, value);
  });

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
    const merged = new Map<string, StoredModelMetric & { aliases: Set<string> }>();
    const tx = db.transaction('modelMetrics', 'readonly');
    let cursor = await tx.store.index('by-analysis').openCursor(analysisId);
    while (cursor) {
      const value = recordValue(cursor.value);
      const modelId = typeof value.modelId === 'string' ? value.modelId : undefined;
      if (modelId) {
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
            const existing = target.usageByDay[day] ?? { inputTokens: 0, outputTokens: 0, otherTokens: 0 };
            existing.inputTokens += number(daily.inputTokens);
            existing.outputTokens += number(daily.outputTokens);
            existing.otherTokens = number(existing.otherTokens) + number(daily.otherTokens);
            target.usageByDay[day] = existing;
          }
        }
        const first = optionalNumber(value.firstTimestamp);
        const last = optionalNumber(value.lastTimestamp);
        if (first !== undefined) target.firstTimestamp = target.firstTimestamp === undefined ? first : Math.min(target.firstTimestamp, first);
        if (last !== undefined) target.lastTimestamp = target.lastTimestamp === undefined ? last : Math.max(target.lastTimestamp, last);
      }
      cursor = await cursor.continue();
    }
    await tx.done;
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
        if (dayInRange(day, range)) visibleTokens += usage.inputTokens + usage.outputTokens + number(usage.otherTokens);
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

function mergeTimelineUsage(
  target: Record<string, Record<string, StoredModelTokenUsage>>,
  raw: unknown
): void {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
  for (const [day, modelValue] of Object.entries(raw)) {
    if (typeof modelValue !== 'object' || modelValue === null || Array.isArray(modelValue)) continue;
    const dayTarget: Record<string, StoredModelTokenUsage> = target[day] ?? Object.create(null);
    for (const [modelId, usageValue] of Object.entries(modelValue)) {
      if (typeof usageValue !== 'object' || usageValue === null || Array.isArray(usageValue)) continue;
      const usage = usageValue as Record<string, unknown>;
      const current = dayTarget[modelId] ?? { inputTokens: 0, outputTokens: 0, otherTokens: 0 };
      current.inputTokens += number(usage.inputTokens);
      current.outputTokens += number(usage.outputTokens);
      current.otherTokens = number(current.otherTokens) + number(usage.otherTokens);
      dayTarget[modelId] = current;
    }
    target[day] = dayTarget;
  }
}

export async function getTimelineMetrics(analysisId: string, kind: TimelineKind): Promise<StoredTimelineMetric[]> {
  const db = await openProfilerDb();
  try {
    const merged = new Map<string, StoredTimelineMetric>();
    const tx = db.transaction('timelineMetrics', 'readonly');
    let cursor = await tx.store.index('by-analysis').openCursor(analysisId);
    while (cursor) {
      const value = recordValue(cursor.value);
      if (value.kind === kind && typeof value.key === 'string') {
        const current = merged.get(value.key) ?? {
          kind,
          key: value.key,
          messages: 0,
          conversations: 0,
          visibleTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          otherTokens: 0,
          webSearches: 0,
          toolEvents: 0,
          usageByDay: {}
        };
        current.messages += number(value.messages);
        current.conversations += number(value.conversations);
        current.visibleTokens += number(value.visibleTokens);
        current.inputTokens += number(value.inputTokens);
        current.outputTokens += number(value.outputTokens);
        current.otherTokens += number(value.otherTokens);
        current.webSearches += number(value.webSearches);
        current.toolEvents += number(value.toolEvents);
        mergeTimelineUsage(current.usageByDay, value.usageByDay);
        merged.set(value.key, current);
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
  } finally {
    db.close();
  }
}
