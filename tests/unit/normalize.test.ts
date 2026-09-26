import { describe, expect, it } from 'vitest';
import minimal from '../fixtures/minimal-conversations.json';
import mixed from '../fixtures/mixed-validity-conversations.json';
import unknown from '../fixtures/unknown-model-tool.json';
import { normalizeConversation } from '../../src/analysis/normalize';
import { QualityCollector } from '../../src/analysis/quality';

describe('normalizeConversation', () => {
  it('normalizes a valid message tree and preserves parent message relationships', () => {
    const quality = new QualityCollector();
    const conversation = normalizeConversation(minimal, quality)!;
    expect(conversation.id).toBe('conv-minimal');
    expect(conversation.messages.map((message) => message.messageId)).toEqual(['msg-user', 'msg-assistant']);
    expect(conversation.messages[1].parentId).toBe('msg-user');
    expect(conversation.messages[1].canonicalModelId).toBe('gpt-6-sol');
    expect(conversation.messages[1].toolEvents).toContainEqual({ kind: 'web-search', rawType: 'web_search' });
    expect(quality.snapshot().coverage.modelIdentification).toEqual({ attempted: 2, identified: 1, ratio: 0.5 });
  });

  it('applies a local model alias override during normalization', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(unknown) as unknown as Record<string, unknown>;
    const mapping = raw.mapping as Record<string, Record<string, unknown>>;
    const firstNode = Object.values(mapping)[0];
    const message = firstNode.message as Record<string, unknown>;
    message.metadata = { ...(message.metadata as Record<string, unknown>), model_slug: 'future-model-x' };

    const conversation = normalizeConversation(raw, quality, { modelAliases: { 'future-model-x': 'gpt-6-sol' } })!;
    expect(conversation.messages[0].rawModelSlug).toBe('future-model-x');
    expect(conversation.messages[0].canonicalModelId).toBe('gpt-6-sol');
    expect(quality.snapshot().coverage.modelIdentification.identified).toBeGreaterThan(0);
  });

  it('keeps valid conversations when a neighboring conversation is malformed', () => {
    const quality = new QualityCollector();
    const results = (mixed as unknown[]).map((item) => normalizeConversation(item, quality));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(quality.snapshot().recoverable).toBeGreaterThan(0);
  });

  it('preserves unknown model and tool raw values', () => {
    const quality = new QualityCollector();
    const conversation = normalizeConversation(unknown, quality)!;
    expect(conversation.messages[0].rawModelSlug).toBe('future-model-x');
    expect(conversation.messages[0].canonicalModelId).toBeUndefined();
    expect(conversation.messages[0].toolEvents).toContainEqual({ kind: 'unknown', rawType: 'future_tool' });
    expect(conversation.messages[0].unknownMetadataKeys).toContain('future_metadata');
  });

  it('skips a malformed message node without discarding the conversation', () => {
    const quality = new QualityCollector();
    const conversation = normalizeConversation((mixed as unknown[])[2], quality)!;
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0].messageId).toBe('msg-b');
    expect(quality.snapshot().recoverable).toBeGreaterThan(0);
  });

  it('reports unsupported message content instead of silently treating it as complete empty text', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(minimal) as unknown as Record<string, unknown>;
    const mapping = raw.mapping as Record<string, Record<string, unknown>>;
    const userNode = mapping['user-node'];
    const userMessage = userNode.message as Record<string, unknown>;
    userMessage.content = { content_type: 'future_content', payload: { text: 'not represented by parts' } };

    const conversation = normalizeConversation(raw, quality)!;
    expect(conversation.messages[0].text).toBe('');
    expect(quality.snapshot().recoverable).toBeGreaterThan(0);
    expect(quality.snapshot().issues.some((issue) => issue.code === 'message-unsupported-content')).toBe(true);
  });

  it('records unknown conversation-level fields as schema drift', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(minimal) as unknown as Record<string, unknown>;
    raw.synthetic_unknown_conversation_field = ['fixture-only'];

    normalizeConversation(raw, quality);
    const snapshot = quality.snapshot();
    expect(snapshot.unknownSchema).toBeGreaterThan(0);
    expect(snapshot.unknownSchemaKeys).toContain('synthetic_unknown_conversation_field');
  });
});
