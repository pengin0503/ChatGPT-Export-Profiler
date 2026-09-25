import type { PricingRecord } from '../analysis/pricing';

export const PRICING_DATASET_VERSION = 1 as const;

/**
 * Scope: OpenAI API Standard processing, short-context text token rates.
 * Historical periods are intentionally omitted unless an official source establishes them.
 * This dataset was verified on 2026-09-25 and is not a claim about ChatGPT subscription billing.
 */
export const BUILT_IN_PRICING_V1: readonly PricingRecord[] = [
  {
    model: 'gpt-6-astra',
    effectiveFrom: '2026-09-03',
    effectiveTo: null,
    inputPerMillion: 10,
    cachedInputPerMillion: 1,
    outputPerMillion: 50,
    currency: 'USD',
    datasetVersion: PRICING_DATASET_VERSION,
    source: 'https://developers.openai.com/api/docs/changelog | https://developers.openai.com/api/docs/models/gpt-6-astra'
  },
  {
    model: 'gpt-6-sol',
    effectiveFrom: '2026-09-22',
    effectiveTo: null,
    inputPerMillion: 2,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 10,
    currency: 'USD',
    datasetVersion: PRICING_DATASET_VERSION,
    source: 'https://developers.openai.com/api/docs/changelog'
  },
  {
    model: 'gpt-6-luna',
    effectiveFrom: '2026-09-22',
    effectiveTo: null,
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    outputPerMillion: 0.5,
    currency: 'USD',
    datasetVersion: PRICING_DATASET_VERSION,
    source: 'https://developers.openai.com/api/docs/changelog'
  },
  {
    model: 'gpt-5.6-sol',
    effectiveFrom: '2026-08-21',
    effectiveTo: null,
    inputPerMillion: 4,
    cachedInputPerMillion: 0.4,
    outputPerMillion: 20,
    currency: 'USD',
    datasetVersion: PRICING_DATASET_VERSION,
    source: 'https://developers.openai.com/api/docs/changelog | https://developers.openai.com/api/docs/models/gpt-5.6-sol'
  },
  {
    model: 'gpt-5.6-terra',
    effectiveFrom: '2026-07-30',
    effectiveTo: null,
    inputPerMillion: 2,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 12,
    currency: 'USD',
    datasetVersion: PRICING_DATASET_VERSION,
    source: 'https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/ | https://developers.openai.com/api/docs/pricing'
  },
  {
    model: 'gpt-5.6-luna',
    effectiveFrom: '2026-07-30',
    effectiveTo: null,
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.2,
    currency: 'USD',
    datasetVersion: PRICING_DATASET_VERSION,
    source: 'https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/ | https://developers.openai.com/api/docs/pricing'
  }
];
