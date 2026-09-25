import type { CanonicalModelId } from '../analysis/domain';

export const CANONICAL_MODEL_IDS: readonly CanonicalModelId[] = [
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna'
] as const;

/** Explicit aliases documented by OpenAI. Do not add guessed spellings here. */
export const MODEL_ALIASES: Readonly<Record<string, CanonicalModelId>> = {
  'gpt-5.6': 'gpt-5.6-sol'
};

/**
 * Family resolution is intentionally restricted to an ISO-date snapshot suffix.
 * A nearby or prefix-looking identifier without this shape remains unknown.
 */
export const MODEL_FAMILY_BASES: readonly CanonicalModelId[] = CANONICAL_MODEL_IDS;
