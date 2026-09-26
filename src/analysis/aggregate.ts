import type { NormalizedConversation, NormalizedMessage } from './domain';
import { countVisibleTokens } from './tokenizers';

export interface AggregateTotals {
  conversations: number;
  messages: number;
  inputMessages: number;
  outputMessages: number;
  otherMessages: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
}

export interface AggregateBucket {
  messages: number;
  conversations: number;
  visibleTokens: number;
}

export interface ModelMetric {
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

export interface ConversationDailyUsage {
  messages: number;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  otherTokens: number;
  modelIds: string[];
}

export interface ConversationMetric {
  id: string;
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
  usageByDay: Record<string, ConversationDailyUsage>;
}

export interface TokenizationCoverage {
  attempted: number;
  identified: number;
  ratio: number | null;
  exact: number;
  family: number;
  fallback: number;
}

export interface AggregationResult {
  totals: AggregateTotals;
  byModel: Record<string, ModelMetric>;
  buckets: {
    hour: Record<string, AggregateBucket>;
    day: Record<string, AggregateBucket>;
    week: Record<string, AggregateBucket>;
    month: Record<string, AggregateBucket>;
    year: Record<string, AggregateBucket>;
  };
  peakDay: ({ key: string } & AggregateBucket) | null;
  medianMessageTokens: number;
  tokenizationCoverage: TokenizationCoverage;
  conversations: ConversationMetric[];
}

type RoleClass = 'input' | 'output' | 'other';
type BucketKind = 'hour' | 'day' | 'week' | 'month' | 'year';

interface MutableBucket extends AggregateBucket {
  conversationIds: Set<string>;
}

interface MutableModelMetric extends Omit<ModelMetric, 'rawAliases' | 'conversations'> {
  conversationIds: Set<string>;
  rawAliasSet: Set<string>;
}

function roleClass(role: string): RoleClass {
  if (role === 'user') return 'input';
  if (role === 'assistant') return 'output';
  return 'other';
}

function toMilliseconds(timestamp: number): number | undefined {
  const milliseconds = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(milliseconds)) return undefined;
  const value = new Date(milliseconds).getTime();
  return Number.isFinite(value) ? value : undefined;
}

function isoWeekKey(date: Date): string {
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - weekday);
  const isoYear = working.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((working.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function timeKeys(timestamp: number): Record<BucketKind, string> | undefined {
  const milliseconds = toMilliseconds(timestamp);
  if (milliseconds === undefined) return undefined;
  const date = new Date(milliseconds);
  const iso = date.toISOString();
  return {
    hour: iso.slice(0, 13),
    day: iso.slice(0, 10),
    week: isoWeekKey(date),
    month: iso.slice(0, 7),
    year: iso.slice(0, 4)
  };
}

function createEmptyTotals(): AggregateTotals {
  return {
    conversations: 0,
    messages: 0,
    inputMessages: 0,
    outputMessages: 0,
    otherMessages: 0,
    visibleTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    otherTokens: 0
  };
}

function updateRange(target: { firstTimestamp?: number; lastTimestamp?: number }, timestamp?: number): void {
  if (timestamp === undefined || toMilliseconds(timestamp) === undefined) return;
  target.firstTimestamp = target.firstTimestamp === undefined ? timestamp : Math.min(target.firstTimestamp, timestamp);
  target.lastTimestamp = target.lastTimestamp === undefined ? timestamp : Math.max(target.lastTimestamp, timestamp);
}

function explicitModelKey(message: NormalizedMessage): string | undefined {
  return message.canonicalModelId ?? message.rawModelSlug;
}

function inferTurnModels(messages: readonly NormalizedMessage[]): Map<string, string> {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  const inferred = new Map<string, string>();

  for (const message of messages) {
    const model = explicitModelKey(message);
    if (message.role !== 'assistant' || !model) continue;
    const visited = new Set<string>();
    let parentId = message.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (parent.role === 'user') {
        if (!explicitModelKey(parent) && !inferred.has(parent.messageId)) inferred.set(parent.messageId, model);
        break;
      }
      parentId = parent.parentId;
    }
  }

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== 'user' || explicitModelKey(message) || inferred.has(message.messageId)) continue;
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const next = messages[nextIndex];
      if (next.role === 'user') break;
      const model = explicitModelKey(next);
      if (next.role === 'assistant' && model) {
        inferred.set(message.messageId, model);
        break;
      }
    }
  }

  return inferred;
}

function medianFromHistogram(histogram: Map<number, number>, total: number): number {
  if (total === 0) return 0;
  const lowerIndex = Math.floor((total - 1) / 2);
  const upperIndex = Math.floor(total / 2);
  let seen = 0;
  let lower = 0;
  let upper = 0;
  for (const [value, count] of [...histogram.entries()].sort((a, b) => a[0] - b[0])) {
    const end = seen + count - 1;
    if (lowerIndex >= seen && lowerIndex <= end) lower = value;
    if (upperIndex >= seen && upperIndex <= end) {
      upper = value;
      break;
    }
    seen += count;
  }
  return (lower + upper) / 2;
}

export function createAggregator() {
  const totals = createEmptyTotals();
  const modelMetrics = new Map<string, MutableModelMetric>();
  const buckets: Record<BucketKind, Map<string, MutableBucket>> = {
    hour: new Map(),
    day: new Map(),
    week: new Map(),
    month: new Map(),
    year: new Map()
  };
  const tokenHistogram = new Map<number, number>();
  const conversationMetrics: ConversationMetric[] = [];
  let tokenizationAttempted = 0;
  let tokenizationIdentified = 0;
  let tokenizationExact = 0;
  let tokenizationFamily = 0;
  let tokenizationFallback = 0;

  function updateBucket(kind: BucketKind, key: string, conversationId: string, tokenCount: number): void {
    let bucket = buckets[kind].get(key);
    if (!bucket) {
      bucket = { messages: 0, conversations: 0, visibleTokens: 0, conversationIds: new Set() };
      buckets[kind].set(key, bucket);
    }
    bucket.messages += 1;
    bucket.visibleTokens += tokenCount;
    bucket.conversationIds.add(conversationId);
    bucket.conversations = bucket.conversationIds.size;
  }

  async function acceptConversation(conversation: NormalizedConversation): Promise<void> {
    totals.conversations += 1;
    const summary: ConversationMetric = {
      id: conversation.id,
      title: conversation.title,
      messages: 0,
      visibleTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      otherTokens: 0,
      modelIds: [],
      hasWeb: false,
      hasFiles: false,
      hasTools: false,
      usageByDay: {}
    };
    const modelIds = new Set<string>();
    const inferredModels = inferTurnModels(conversation.messages);

    for (const message of conversation.messages) {
      const inferredModel = inferredModels.get(message.messageId);
      tokenizationAttempted += 1;
      const tokenResult = await countVisibleTokens({
        text: message.text,
        canonicalModelId: message.canonicalModelId ?? inferredModel,
        rawModelSlug: message.rawModelSlug
      });
      if (tokenResult.confidence === 'exact') {
        tokenizationExact += 1;
        tokenizationIdentified += 1;
      } else if (tokenResult.confidence === 'family') {
        tokenizationFamily += 1;
        tokenizationIdentified += 1;
      } else {
        tokenizationFallback += 1;
      }
      const tokenCount = tokenResult.count;
      const kind = roleClass(message.role);
      totals.messages += 1;
      totals.visibleTokens += tokenCount;
      totals[`${kind}Messages`] += 1;
      totals[`${kind}Tokens`] += tokenCount;
      summary.messages += 1;
      summary.visibleTokens += tokenCount;
      summary[`${kind}Tokens`] += tokenCount;
      updateRange(summary, message.createdAt);
      tokenHistogram.set(tokenCount, (tokenHistogram.get(tokenCount) ?? 0) + 1);

      const key = explicitModelKey(message) ?? inferredModel ?? 'unknown';
      modelIds.add(key);
      let model = modelMetrics.get(key);
      if (!model) {
        model = {
          modelId: key,
          messages: 0,
          visibleTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          otherTokens: 0,
          conversationIds: new Set(),
          rawAliasSet: new Set(),
          usageByDay: {}
        };
        modelMetrics.set(key, model);
      }
      model.messages += 1;
      model.visibleTokens += tokenCount;
      model[`${kind}Tokens`] += tokenCount;
      model.conversationIds.add(conversation.id);
      if (message.rawModelSlug) model.rawAliasSet.add(message.rawModelSlug);
      updateRange(model, message.createdAt);

      const keys = message.createdAt === undefined ? undefined : timeKeys(message.createdAt);
      if (keys) {
        const daily = summary.usageByDay[keys.day] ?? {
          messages: 0,
          visibleTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          otherTokens: 0,
          modelIds: []
        };
        daily.messages += 1;
        daily.visibleTokens += tokenCount;
        daily[`${kind}Tokens`] += tokenCount;
        if (!daily.modelIds.includes(key)) daily.modelIds.push(key);
        summary.usageByDay[keys.day] = daily;
      }

      if (keys && kind !== 'other') {
        const usage = model.usageByDay[keys.day] ?? { inputTokens: 0, outputTokens: 0 };
        if (kind === 'input') usage.inputTokens += tokenCount;
        else usage.outputTokens += tokenCount;
        model.usageByDay[keys.day] = usage;
      }

      if (keys) {
        (Object.keys(keys) as BucketKind[]).forEach((bucketKind) => {
          updateBucket(bucketKind, keys[bucketKind], conversation.id, tokenCount);
        });
      }

      summary.hasWeb ||= message.toolEvents.some((event) => event.kind === 'web-search');
      summary.hasFiles ||= message.attachmentCount > 0 || message.toolEvents.some((event) => event.kind === 'file');
      summary.hasTools ||= message.toolEvents.length > 0;
    }

    summary.modelIds = [...modelIds].sort();
    for (const daily of Object.values(summary.usageByDay)) daily.modelIds.sort();
    updateRange(summary, conversation.createdAt);
    updateRange(summary, conversation.updatedAt);
    conversationMetrics.push(summary);
  }

  function finish(): AggregationResult {
    const finalizedBuckets = {} as AggregationResult['buckets'];
    for (const kind of Object.keys(buckets) as BucketKind[]) {
      finalizedBuckets[kind] = Object.fromEntries(
        [...buckets[kind].entries()].map(([key, bucket]) => [
          key,
          { messages: bucket.messages, conversations: bucket.conversations, visibleTokens: bucket.visibleTokens }
        ])
      );
    }

    const byModel = Object.fromEntries(
      [...modelMetrics.entries()].map(([key, value]) => [
        key,
        {
          modelId: value.modelId,
          messages: value.messages,
          conversations: value.conversationIds.size,
          visibleTokens: value.visibleTokens,
          inputTokens: value.inputTokens,
          outputTokens: value.outputTokens,
          otherTokens: value.otherTokens,
          rawAliases: [...value.rawAliasSet].sort(),
          firstTimestamp: value.firstTimestamp,
          lastTimestamp: value.lastTimestamp,
          usageByDay: Object.fromEntries(Object.entries(value.usageByDay).map(([day, usage]) => [day, { ...usage }]))
        }
      ])
    );

    const dayEntries = Object.entries(finalizedBuckets.day);
    dayEntries.sort((a, b) => b[1].messages - a[1].messages || a[0].localeCompare(b[0]));
    const peakDay = dayEntries[0]
      ? { key: dayEntries[0][0], ...dayEntries[0][1] }
      : null;

    return {
      totals: { ...totals },
      byModel,
      buckets: finalizedBuckets,
      peakDay,
      medianMessageTokens: medianFromHistogram(tokenHistogram, totals.messages),
      tokenizationCoverage: {
        attempted: tokenizationAttempted,
        identified: tokenizationIdentified,
        ratio: tokenizationAttempted === 0 ? null : tokenizationIdentified / tokenizationAttempted,
        exact: tokenizationExact,
        family: tokenizationFamily,
        fallback: tokenizationFallback
      },
      conversations: conversationMetrics.map((value) => ({
        ...value,
        modelIds: [...value.modelIds],
        usageByDay: Object.fromEntries(
          Object.entries(value.usageByDay).map(([day, usage]) => [day, { ...usage, modelIds: [...usage.modelIds] }])
        )
      }))
    };
  }

  return { acceptConversation, finish };
}
