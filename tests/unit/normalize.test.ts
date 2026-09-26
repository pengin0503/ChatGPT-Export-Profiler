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

  it('recognizes exported reasoning containers without counting hidden reasoning as visible text or damage', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(minimal) as unknown as Record<string, unknown>;
    const mapping = raw.mapping as Record<string, Record<string, unknown>>;
    const userMessage = mapping['user-node'].message as Record<string, unknown>;
    const assistantMessage = mapping['assistant-node'].message as Record<string, unknown>;
    userMessage.content = {
      content_type: 'thoughts',
      source_analysis_msg_id: 'synthetic-analysis',
      thoughts: [{ summary: 'Synthetic summary', content: 'Synthetic non-visible reasoning', chunks: [], finished: true }]
    };
    assistantMessage.content = { content_type: 'reasoning_recap', content: 'synthetic-recap' };

    const conversation = normalizeConversation(raw, quality)!;
    expect(conversation.messages.map((message) => message.text)).toEqual(['', '']);
    expect(quality.snapshot().issues.some((issue) => issue.code === 'message-unsupported-content')).toBe(false);
  });

  it('treats currently observed structural fields as recognized schema without copying their values', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(minimal) as unknown as Record<string, unknown>;
    Object.assign(raw, {
      is_do_not_remember: false,
      is_read_only: null,
      is_study_mode: true,
      memory_scope: 'synthetic-scope',
      pinned_time: null
    });
    const mapping = raw.mapping as Record<string, Record<string, unknown>>;
    const assistantMessage = mapping['assistant-node'].message as Record<string, unknown>;
    assistantMessage.metadata = {
      ...(assistantMessage.metadata as Record<string, unknown>),
      async_task_title: 'Synthetic task',
      branching_from_conversation_title: 'Synthetic branch',
      code_blocks: {},
      conversation_context_citation_metadata: [],
      error_metadata: {},
      image_results: [],
      is_async_task_result_message: false,
      message_locale: 'xx-TEST',
      parent_id: 'synthetic-parent',
      search_result_groups: [],
      serialization_metadata: {},
      tool_icons: [],
      view_state: {}
    };

    const conversation = normalizeConversation(raw, quality)!;
    const snapshot = quality.snapshot();
    const observedConversationFields = ['is_do_not_remember', 'is_read_only', 'is_study_mode', 'memory_scope', 'pinned_time'];
    const observedMetadataFields = [
      'async_task_title',
      'branching_from_conversation_title',
      'code_blocks',
      'conversation_context_citation_metadata',
      'error_metadata',
      'image_results',
      'is_async_task_result_message',
      'message_locale',
      'parent_id',
      'search_result_groups',
      'serialization_metadata',
      'tool_icons',
      'view_state'
    ];

    for (const key of [...observedConversationFields, ...observedMetadataFields]) {
      expect(snapshot.unknownSchemaKeys).not.toContain(key);
    }
    for (const key of observedMetadataFields) {
      expect(conversation.messages[1].unknownMetadataKeys).not.toContain(key);
    }
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
