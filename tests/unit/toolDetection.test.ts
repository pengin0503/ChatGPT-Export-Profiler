import { describe, expect, it } from 'vitest';
import { detectToolEvents } from '../../src/analysis/toolDetection';

describe('detectToolEvents', () => {
  it('maps explicit known tool identifiers conservatively', () => {
    expect(detectToolEvents({ tool_name: 'web_search' })).toEqual([{ kind: 'web-search', rawType: 'web_search' }]);
    expect(detectToolEvents({ tool_type: 'file_search' })).toEqual([{ kind: 'file', rawType: 'file_search' }]);
    expect(detectToolEvents({ recipient: 'python' })).toEqual([{ kind: 'python', rawType: 'python' }]);
  });

  it('recognizes current structured export evidence for web, image, and file usage', () => {
    expect(detectToolEvents({ search_result_groups: [{}] })).toEqual([
      { kind: 'web-search', rawType: 'search_result_groups' }
    ]);
    expect(detectToolEvents({ image_results: [{}] })).toEqual([{ kind: 'image', rawType: 'image_results' }]);
    expect(detectToolEvents({ attachments: [{}] })).toEqual([{ kind: 'file', rawType: 'attachments' }]);
  });

  it('does not double-count structured evidence when an explicit identifier already records the same kind', () => {
    expect(detectToolEvents({ tool_name: 'web_search', search_result_groups: [{}] })).toEqual([
      { kind: 'web-search', rawType: 'web_search' }
    ]);
  });

  it('keeps an unrecognized nonempty tool identifier as unknown', () => {
    expect(detectToolEvents({ tool_type: 'future_tool' })).toEqual([{ kind: 'unknown', rawType: 'future_tool' }]);
  });

  it('does not invent a tool event from unrelated metadata', () => {
    expect(detectToolEvents({ model_slug: 'gpt-6-sol', request_id: 'synthetic' })).toEqual([]);
  });
});
