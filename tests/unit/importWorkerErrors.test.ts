// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipelineMessage } from '../../src/import/pipelineProtocol';

vi.mock('../../src/import/conversationStream', () => ({
  streamConversationObjects: async function* () {
    yield undefined;
    throw Object.assign(new Error('Synthetic oversized conversation'), { code: 'CONVERSATION_TOO_LARGE' });
  }
}));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('import worker failure reporting', () => {
  it('reports an actionable localized message when one conversation is too large', async () => {
    const messages: PipelineMessage[] = [];
    let listener: ((event: MessageEvent<PipelineMessage>) => void) | undefined;
    vi.stubGlobal('self', {
      postMessage(message: PipelineMessage) { messages.push(message); },
      addEventListener(_type: string, callback: typeof listener) { listener = callback; }
    });
    await import('../../src/workers/import.worker');
    listener!({ data: { type: 'START_IMPORT', analysisId: 'synthetic', fingerprint: 'synthetic', profile: 'safe', file: new Blob(['synthetic']) } } as MessageEvent<PipelineMessage>);
    await vi.waitFor(() => expect(messages).toContainEqual({
      type: 'FAIL', code: 'CONVERSATION_TOO_LARGE', stage: 'parsing', messageKey: 'import.conversationTooLarge'
    }));
  });
});
