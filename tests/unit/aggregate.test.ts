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
  canonicalModelId: string
): NormalizedMessage {
  return {
    conversationId,
    messageId,
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

    expect(result.byModel['gpt-6-sol']?.messages).toBe(3);
    expect(result.byModel['gpt-5.6-sol']?.messages).toBe(2);
    expect(result.byModel['gpt-6-sol']?.conversations).toBe(2);

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
    expect(result.conversations).toEqual([]);
  });
});
