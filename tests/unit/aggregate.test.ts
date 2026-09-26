import { describe, expect, it } from 'vitest';
import { createAggregator } from '../../src/analysis/aggregate';
import { countTextTokens } from '../../src/analysis/tokenizers';
import type { NormalizedConversation, NormalizedMessage } from '../../src/analysis/domain';

const epochSeconds = (iso: string) => Date.parse(iso) / 1000;

function message(
  conversationId: string,
  messageId: string,
  role: 'user' | 'assistant',
  text: string,
  createdAt: number,
  canonicalModelId?: string,
  parentId?: string
): NormalizedMessage {
  return {
    conversationId,
    messageId,
    parentId,
    role,
    text,
    createdAt,
    canonicalModelId,
    rawModelSlug: canonicalModelId,
    toolEvents: [],
    attachmentCount: 0,
    unknownMetadataKeys: []
  };
}

function conversation(id: string, title: string, messages: NormalizedMessage[]): NormalizedConversation {
  return {
    id,
    title,
    createdAt: messages[0]?.createdAt,
    updatedAt: messages.at(-1)?.createdAt,
    messages
  };
}

describe('createAggregator', () => {
  it('aggregates role, model, peak-day, time-bucket, and median metrics deterministically', async () => {
    const conversations = [
      conversation('c1', 'Synthetic one', [
        message('c1', 'm1', 'user', 'alpha', epochSeconds('2026-09-20T10:00:00Z'), 'gpt-6-sol'),
        message('c1', 'm2', 'assistant', 'beta beta', epochSeconds('2026-09-20T10:05:00Z'), 'gpt-6-sol')
      ]),
      conversation('c2', 'Synthetic two', [
        message('c2', 'm3', 'user', 'gamma gamma gamma', epochSeconds('2026-09-20T11:00:00Z'), 'gpt-5.6-sol'),
        message('c2', 'm4', 'assistant', 'delta', epochSeconds('2026-09-20T11:05:00Z'), 'gpt-5.6-sol')
      ]),
      conversation('c3', 'Synthetic three', [
        message('c3', 'm5', 'user', 'epsilon epsilon', epochSeconds('2026-09-21T09:00:00Z'), 'gpt-6-sol')
      ])
    ];

    const aggregator = createAggregator();
    for (const item of conversations) await aggregator.acceptConversation(item);
    const result = aggregator.finish();

    expect(result.totals.conversations).toBe(3);
    expect(result.totals.messages).toBe(5);
    expect(result.totals.inputMessages).toBe(3);
    expect(result.totals.outputMessages).toBe(2);
    expect(result.totals.inputTokens + result.totals.outputTokens).toBe(result.totals.visibleTokens);
    expect(result.totals.visibleTokens).toBeGreaterThan(0);
    expect(result.tokenizationCoverage).toEqual({
      attempted: 5,
      identified: 5,
      ratio: 1,
      exact: 5,
      family: 0,
      fallback: 0
    });

    expect(result.byModel['gpt-6-sol']?.messages).toBe(3);
    expect(result.byModel['gpt-5.6-sol']?.messages).toBe(2);
    expect(result.byModel['gpt-6-sol']?.conversations).toBe(2);
    const dailyUsage = result.byModel['gpt-6-sol']?.usageByDay;
    expect(Object.keys(dailyUsage ?? {}).sort()).toEqual(['2026-09-20', '2026-09-21']);
    expect(dailyUsage?.['2026-09-20']?.inputTokens).toBeGreaterThan(0);
    expect(dailyUsage?.['2026-09-20']?.outputTokens).toBeGreaterThan(0);

    expect(result.peakDay?.key).toBe('2026-09-20');
    expect(result.peakDay?.messages).toBe(4);
    expect(result.buckets.hour['2026-09-20T10']?.messages).toBe(2);
    expect(result.buckets.day['2026-09-20']?.messages).toBe(4);
    expect(Object.keys(result.buckets.week)).toContain('2026-W38');
    expect(result.buckets.month['2026-09']?.messages).toBe(5);
    expect(result.buckets.year['2026']?.messages).toBe(5);

    const tokenCounts = await Promise.all(
      conversations.flatMap((item) => item.messages).map((item) =>
        countTextTokens(item.text, { encoding: 'o200k_base', confidence: 'exact' }).then((value) => value.count)
      )
    );
    const sorted = [...tokenCounts].sort((a, b) => a - b);
    expect(result.medianMessageTokens).toBe(sorted[Math.floor(sorted.length / 2)]);

    expect(result.conversations).toHaveLength(3);
    expect(result.conversations[0]).not.toHaveProperty('text');
  });

  it('retains per-model daily usage and tool counts for pricing-aware analytics', async () => {
    const prompt = message('pricing-aware', 'u1', 'user', 'synthetic prompt', epochSeconds('2026-09-22T10:00:00Z'), 'gpt-6-sol');
    prompt.toolEvents = [{ kind: 'web-search', rawType: 'web_search' }];
    const response = message('pricing-aware', 'a1', 'assistant', 'synthetic response', epochSeconds('2026-09-22T10:05:00Z'), 'gpt-6-sol', 'u1');
    response.toolEvents = [{ kind: 'python', rawType: 'python' }];
    const aggregator = createAggregator();

    await aggregator.acceptConversation(conversation('pricing-aware', 'Pricing aware', [prompt, response]));
    const result = aggregator.finish();
    const hour = result.buckets.hour['2026-09-22T10'];
    const daily = result.conversations[0]?.usageByDay['2026-09-22'];

    expect(hour?.webSearches).toBe(1);
    expect(hour?.toolEvents).toBe(2);
    expect(hour?.usageByDay['2026-09-22']?.['gpt-6-sol']?.inputTokens).toBeGreaterThan(0);
    expect(hour?.usageByDay['2026-09-22']?.['gpt-6-sol']?.outputTokens).toBeGreaterThan(0);
    expect(daily?.byModel['gpt-6-sol']?.inputTokens).toBeGreaterThan(0);
    expect(daily?.byModel['gpt-6-sol']?.outputTokens).toBeGreaterThan(0);
  });

  it('reports fallback tokenization separately instead of counting it as identified coverage', async () => {
    const aggregator = createAggregator();
    await aggregator.acceptConversation(conversation('fallback', 'Fallback', [
      message('fallback', 'm1', 'assistant', 'synthetic fallback text', epochSeconds('2026-09-22T09:00:00Z'), 'future-model-x')
    ]));

    expect(aggregator.finish().tokenizationCoverage).toEqual({
      attempted: 1,
      identified: 0,
      ratio: 0,
      exact: 0,
      family: 0,
      fallback: 1
    });
  });

  it('returns stable zero/null metrics for an empty export', () => {
    const result = createAggregator().finish();
    expect(result.totals).toEqual({
      conversations: 0,
      messages: 0,
      inputMessages: 0,
      outputMessages: 0,
      otherMessages: 0,
      visibleTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      otherTokens: 0
    });
    expect(result.peakDay).toBeNull();
    expect(result.medianMessageTokens).toBe(0);
    expect(result.tokenizationCoverage).toEqual({
      attempted: 0,
      identified: 0,
      ratio: null,
      exact: 0,
      family: 0,
      fallback: 0
    });
    expect(result.conversations).toEqual([]);
  });

  it('ignores out-of-range timestamps for ranges and timeline buckets instead of aborting the import', async () => {
    const invalid = message('invalid-time', 'm-invalid', 'assistant', 'synthetic', 1e100, 'gpt-6-sol');
    const aggregator = createAggregator();

    await expect(aggregator.acceptConversation(conversation('invalid-time', 'Invalid time', [invalid]))).resolves.toBeUndefined();
    const result = aggregator.finish();

    expect(result.totals.messages).toBe(1);
    expect(result.conversations[0]?.firstTimestamp).toBeUndefined();
    expect(result.conversations[0]?.lastTimestamp).toBeUndefined();
    expect(result.buckets.day).toEqual({});
  });

  it('attributes a model-less user input to the assistant model for the same turn', async () => {
    const prompt = message('turn-model', 'user-1', 'user', 'prompt tokens', epochSeconds('2026-09-22T10:00:00Z'));
    const response = message('turn-model', 'assistant-1', 'assistant', 'response tokens', epochSeconds('2026-09-22T10:00:05Z'), 'gpt-6-sol', 'user-1');
    const aggregator = createAggregator();

    await aggregator.acceptConversation(conversation('turn-model', 'Turn attribution', [prompt, response]));
    const result = aggregator.finish();

    expect(result.byModel.unknown).toBeUndefined();
    expect(result.byModel['gpt-6-sol']?.messages).toBe(2);
    expect(result.byModel['gpt-6-sol']?.inputTokens).toBeGreaterThan(0);
    expect(result.byModel['gpt-6-sol']?.outputTokens).toBeGreaterThan(0);
    expect(result.conversations[0]?.modelIds).toEqual(['gpt-6-sol']);
  });
});
