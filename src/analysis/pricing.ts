import type { CanonicalModelId } from './domain';

const TOKENS_PER_MILLION = 1_000_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface PricingRecord {
  model: CanonicalModelId;
  effectiveFrom: string;
  effectiveTo: string | null;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  currency: 'USD';
  datasetVersion: number;
  source?: string;
}

export interface CostAssumptions {
  cacheRatio: number;
  hiddenInputOverheadRatio: number;
  reasoningOutputOverheadRatio: number;
}

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
}

export interface CostRange {
  lower: number;
  upper: number;
  assumptions: CostAssumptions;
}

function assertTokenCount(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
}

function assertRatio(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function startTimestamp(value: string): number {
  const timestamp = Date.parse(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`Invalid pricing effective date: ${value}`);
  }
  return timestamp;
}

function endTimestamp(value: string): number {
  const timestamp = Date.parse(DATE_ONLY.test(value) ? `${value}T23:59:59.999Z` : value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`Invalid pricing effective date: ${value}`);
  }
  return timestamp;
}

export function findPrice(
  modelId: CanonicalModelId,
  timestamp: number,
  pricing: readonly PricingRecord[]
): PricingRecord | undefined {
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return pricing
    .filter((record) => {
      if (record.model !== modelId) return false;
      const from = startTimestamp(record.effectiveFrom);
      const to = record.effectiveTo === null ? Number.POSITIVE_INFINITY : endTimestamp(record.effectiveTo);
      return timestamp >= from && timestamp <= to;
    })
    .sort((a, b) => startTimestamp(b.effectiveFrom) - startTimestamp(a.effectiveFrom))[0];
}

export function calculateVisibleCost(
  inputTokens: number,
  outputTokens: number,
  record: PricingRecord
): number {
  assertTokenCount(inputTokens, 'inputTokens');
  assertTokenCount(outputTokens, 'outputTokens');
  return (
    (inputTokens / TOKENS_PER_MILLION) * record.inputPerMillion +
    (outputTokens / TOKENS_PER_MILLION) * record.outputPerMillion
  );
}

export function calculateScenarioCost(
  usage: UsageTokens,
  record: PricingRecord,
  assumptions: CostAssumptions
): CostRange {
  assertTokenCount(usage.inputTokens, 'inputTokens');
  assertTokenCount(usage.outputTokens, 'outputTokens');
  assertRatio(assumptions.cacheRatio, 'cacheRatio');
  assertRatio(assumptions.hiddenInputOverheadRatio, 'hiddenInputOverheadRatio');
  assertRatio(assumptions.reasoningOutputOverheadRatio, 'reasoningOutputOverheadRatio');

  const visibleCachedInput = usage.inputTokens * assumptions.cacheRatio;
  const visibleUncachedInput = usage.inputTokens - visibleCachedInput;
  const lower =
    (visibleUncachedInput / TOKENS_PER_MILLION) * record.inputPerMillion +
    (visibleCachedInput / TOKENS_PER_MILLION) * record.cachedInputPerMillion +
    (usage.outputTokens / TOKENS_PER_MILLION) * record.outputPerMillion;

  const hiddenInputTokens = usage.inputTokens * assumptions.hiddenInputOverheadRatio;
  const reasoningOutputTokens = usage.outputTokens * assumptions.reasoningOutputOverheadRatio;
  const upper =
    lower +
    (hiddenInputTokens / TOKENS_PER_MILLION) * record.inputPerMillion +
    (reasoningOutputTokens / TOKENS_PER_MILLION) * record.outputPerMillion;

  return { lower, upper, assumptions: { ...assumptions } };
}
