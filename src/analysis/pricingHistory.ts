import { BUILT_IN_PRICING_V1 } from '../data/pricing.v1';
import { openProfilerDb } from '../storage/db';
import type { PricingRecord } from './pricing';

function isPricingRecord(value: unknown): value is PricingRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.model === 'string' &&
    typeof record.effectiveFrom === 'string' &&
    (record.effectiveTo === null || typeof record.effectiveTo === 'string') &&
    typeof record.inputPerMillion === 'number' &&
    typeof record.cachedInputPerMillion === 'number' &&
    typeof record.outputPerMillion === 'number'
  );
}

export async function loadPricingRecords(): Promise<PricingRecord[]> {
  const db = await openProfilerDb();
  try {
    const overrides = (await db.getAll('pricingHistory'))
      .map((record) => record.value)
      .filter(isPricingRecord)
      .map((record) => ({ ...record, currency: 'USD' as const, datasetVersion: record.datasetVersion ?? 1 }));
    return [...BUILT_IN_PRICING_V1, ...overrides];
  } finally {
    db.close();
  }
}
