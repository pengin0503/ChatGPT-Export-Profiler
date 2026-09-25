import { Tiktoken } from 'js-tiktoken/lite';
import type { NormalizedMessage } from './domain';

export type TokenizerEncoding = 'o200k_base' | 'cl100k_base';
export type TokenizerConfidence = 'exact' | 'family' | 'fallback';

export interface TokenizerSelection {
  encoding: TokenizerEncoding;
  confidence: TokenizerConfidence;
}

export interface TokenCountResult extends TokenizerSelection {
  count: number;
}

const rankLoaders = {
  o200k_base: () => import('js-tiktoken/ranks/o200k_base'),
  cl100k_base: () => import('js-tiktoken/ranks/cl100k_base')
} as const;

const encoderCache = new Map<TokenizerEncoding, Promise<Tiktoken>>();

const O200K_EXACT_MODELS = new Set([
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-6-pro',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.6-pro',
  'gpt-5',
  'gpt-4.1',
  'gpt-4o',
  'o1',
  'o3',
  'o4-mini'
]);

const CL100K_EXACT_MODELS = new Set(['gpt-4', 'gpt-3.5-turbo', 'gpt-3.5']);

async function getEncoder(encoding: TokenizerEncoding): Promise<Tiktoken> {
  const cached = encoderCache.get(encoding);
  if (cached) return cached;

  const promise = rankLoaders[encoding]().then((module) => new Tiktoken(module.default));
  encoderCache.set(encoding, promise);
  return promise;
}

export function selectTokenizer(model?: string): TokenizerSelection {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) return { encoding: 'o200k_base', confidence: 'fallback' };

  if (O200K_EXACT_MODELS.has(normalized)) return { encoding: 'o200k_base', confidence: 'exact' };
  if (CL100K_EXACT_MODELS.has(normalized)) return { encoding: 'cl100k_base', confidence: 'exact' };

  if (/^(gpt-(?:6|5(?:\.|-)|4\.1|4o)|o[134](?:-|$))/.test(normalized)) {
    return { encoding: 'o200k_base', confidence: 'family' };
  }
  if (/^(gpt-4-|gpt-3\.5)/.test(normalized)) {
    return { encoding: 'cl100k_base', confidence: 'family' };
  }

  return { encoding: 'o200k_base', confidence: 'fallback' };
}

export async function countTextTokens(text: string, selection: TokenizerSelection): Promise<TokenCountResult> {
  const encoder = await getEncoder(selection.encoding);
  return {
    count: encoder.encode(text).length,
    encoding: selection.encoding,
    confidence: selection.confidence
  };
}

export function countVisibleTokens(message: Pick<NormalizedMessage, 'text' | 'canonicalModelId' | 'rawModelSlug'>): Promise<TokenCountResult> {
  const selection = selectTokenizer(message.canonicalModelId ?? message.rawModelSlug);
  return countTextTokens(message.text, selection);
}
