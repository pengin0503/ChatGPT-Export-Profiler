import type { CanonicalModelId } from './domain';
import { CANONICAL_MODEL_IDS, MODEL_ALIASES, MODEL_FAMILY_BASES } from '../data/modelAliases';

export type ModelAliasOverrides = Readonly<Record<string, CanonicalModelId>>;

export interface ModelResolution {
  canonicalId?: CanonicalModelId;
  raw: string;
  confidence: 'exact' | 'alias' | 'family' | 'unknown';
}

const canonicalModels = new Set(CANONICAL_MODEL_IDS);
const isoDateSuffix = /^\d{4}-\d{2}-\d{2}$/;

export function resolveModel(raw: string, localAliases: ModelAliasOverrides = {}): ModelResolution {
  const lookup = raw.trim();

  if (canonicalModels.has(lookup)) {
    return { canonicalId: lookup, raw, confidence: 'exact' };
  }

  const localValue = Object.prototype.hasOwnProperty.call(localAliases, lookup) ? localAliases[lookup] : undefined;
  const localAlias = typeof localValue === 'string' ? localValue.trim() : undefined;
  if (localAlias) {
    return { canonicalId: localAlias, raw, confidence: 'alias' };
  }

  const aliased = Object.prototype.hasOwnProperty.call(MODEL_ALIASES, lookup) ? MODEL_ALIASES[lookup] : undefined;
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
