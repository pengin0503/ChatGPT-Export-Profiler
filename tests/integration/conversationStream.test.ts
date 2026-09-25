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

describe('streamConversationObjects', () => {
  it('streams synthetic conversation objects from the validated conversations.json entry', async () => {
    const source = [
      { id: 'synthetic-1', title: 'Synthetic one', mapping: {} },
      { id: 'synthetic-2', title: 'Synthetic two', mapping: {} }
    ];
    const file = await makeZip([
      { name: 'conversations.json', text: JSON.stringify(source) },
      { name: 'user.json', text: '{}' }
    ]);
    await expect(collect(file)).resolves.toEqual(source);
  });

  it('rejects an archive that fails safety inspection before parsing', async () => {
    const file = await makeZip([{ name: 'user.json', text: '{}' }]);
    await expect(collect(file)).rejects.toMatchObject({ code: 'ZIP_SAFETY_BLOCKED' });
  });
});
