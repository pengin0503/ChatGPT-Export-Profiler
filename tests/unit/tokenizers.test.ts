import { describe, expect, it } from 'vitest';
import { countTextTokens, countVisibleTokens } from '../../src/analysis/tokenizers';
import type { NormalizedMessage } from '../../src/analysis/domain';

function message(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    conversationId: 'synthetic-conversation',
    messageId: 'synthetic-message',
    role: 'user',
    text: 'hello world',
    toolEvents: [],
    attachmentCount: 0,
    unknownMetadataKeys: [],
    ...overrides
  };
}

describe('local tokenizers', () => {
  it('counts with a local rank module and keeps fallback confidence without network access', async () => {
    const originalFetch = globalThis.fetch;
    let networkAttempted = false;
    globalThis.fetch = (async () => {
      networkAttempted = true;
      throw new Error('network access is forbidden in tokenizer tests');
    }) as typeof fetch;

    try {
      const result = await countTextTokens('hello world', {
        encoding: 'o200k_base',
        confidence: 'fallback'
      });
      expect(result.count).toBeGreaterThan(0);
      expect(result.encoding).toBe('o200k_base');
      expect(result.confidence).toBe('fallback');
      expect(networkAttempted).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses an explicit tokenizer mapping for a known canonical model', async () => {
    const result = await countVisibleTokens(message({ canonicalModelId: 'gpt-6-sol' }));
    expect(result.count).toBeGreaterThan(0);
    expect(result.encoding).toBe('o200k_base');
    expect(result.confidence).toBe('exact');
  });

  it('falls back conservatively for an unknown model', async () => {
    const result = await countVisibleTokens(message({ rawModelSlug: 'future-model-x' }));
    expect(result.count).toBeGreaterThan(0);
    expect(result.encoding).toBe('o200k_base');
    expect(result.confidence).toBe('fallback');
  });
});
