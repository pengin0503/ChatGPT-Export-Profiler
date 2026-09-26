import { describe, expect, it } from 'vitest';
import type { NormalizedConversation } from '../../src/analysis/domain';
import { filterUniqueConversations, safeKeySegment } from '../../src/analysis/batchIntegrity';

function conversation(id: string): NormalizedConversation {
  return { id, title: id, messages: [] };
}

describe('batch integrity helpers', () => {
  it('deduplicates conversation ids consistently across and within batches', () => {
    const seen = new Set<string>(['existing']);
    const result = filterUniqueConversations(
      [conversation('existing'), conversation('new'), conversation('new'), conversation('other')],
      seen
    );

    expect(result.accepted.map((item) => item.id)).toEqual(['new', 'other']);
    expect(result.duplicateIds).toEqual(['existing', 'new']);
    expect([...seen].sort()).toEqual(['existing', 'new', 'other']);
  });

  it('encodes unpaired UTF-16 tool identifiers without throwing or colliding', () => {
    expect(() => safeKeySegment('\uD800')).not.toThrow();
    expect(safeKeySegment('\uD800')).not.toBe(safeKeySegment('\uD801'));
    expect(safeKeySegment('web')).toMatch(/^[0-9a-f]+$/);
  });
});
