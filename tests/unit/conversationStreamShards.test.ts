// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { streamConversationObjects } from '../../src/import/conversationStream';
import { makeZip } from '../helpers/makeZip';

async function collect(file: Blob): Promise<unknown[]> {
  const controller = new AbortController();
  const values: unknown[] = [];
  for await (const value of streamConversationObjects(file, controller.signal)) values.push(value);
  return values;
}

describe('streamConversationObjects with sharded exports', () => {
  it('streams every synthetic conversation shard in numeric shard order', async () => {
    const file = await makeZip([
      { name: 'conversations-002.json', text: JSON.stringify([{ id: 'synthetic-2', mapping: {} }]) },
      { name: 'conversations-001.json', text: JSON.stringify([{ id: 'synthetic-1', mapping: {} }]) }
    ]);

    await expect(collect(file)).resolves.toEqual([
      { id: 'synthetic-1', mapping: {} },
      { id: 'synthetic-2', mapping: {} }
    ]);
  });
});
