import type { CanonicalModelId } from './domain';
import { CANONICAL_MODEL_IDS, MODEL_ALIASES, MODEL_FAMILY_BASES } from '../data/modelAliases';

export interface ModelResolution {
  canonicalId?: CanonicalModelId;
  raw: string;
  confidence: 'exact' | 'alias' | 'family' | 'unknown';
}

const canonicalModels = new Set(CANONICAL_MODEL_IDS);
const isoDateSuffix = /^\d{4}-\d{2}-\d{2}$/;

export function resolveModel(raw: string): ModelResolution {
  const lookup = raw.trim();

  if (canonicalModels.has(lookup)) {
    return { canonicalId: lookup, raw, confidence: 'exact' };
  }

  const aliased = MODEL_ALIASES[lookup];
  if (aliased) {
    return { canonicalId: aliased, raw, confidence: 'alias' };
  }

  for (const base of MODEL_FAMILY_BASES) {
    const prefix = `${base}-`;
    if (lookup.startsWith(prefix) && isoDateSuffix.test(lookup.slice(prefix.length))) {
      return { canonicalId: base, raw, confidence: 'family' };
    }
  }

  return { canonicalId: undefined, raw, confidence: 'unknown' };
}
