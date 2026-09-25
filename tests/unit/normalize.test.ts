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
});
