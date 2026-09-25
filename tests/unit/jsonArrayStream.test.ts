import { describe, expect, it } from 'vitest';
import { splitTopLevelJsonArray } from '../../src/import/jsonArrayStream';

function chunkUtf8(text: string, pattern: number[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let patternIndex = 0;
  while (offset < bytes.length) {
    const size = pattern[patternIndex % pattern.length] ?? bytes.length;
    chunks.push(bytes.slice(offset, Math.min(bytes.length, offset + size)));
    offset += size;
    patternIndex += 1;
  }
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    }
  });
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<string[]> {
  const values: string[] = [];
  for await (const value of splitTopLevelJsonArray(stream, signal)) values.push(value);
  return values;
}

describe('splitTopLevelJsonArray', () => {
  it('survives UTF-8 chunk splits, escaped quotes, nested values, and braces inside strings', async () => {
    const input = JSON.stringify([
      { text: '} ] \\" 日本語', nested: { value: [1, 2, 3] } },
      { text: 'Synthetic message B', enabled: true }
    ]);
    const values = await collect(chunkUtf8(input, [1, 2, 5, 3]));
    expect(values.map(JSON.parse)).toEqual(JSON.parse(input));
  });

  it('accepts whitespace and an empty array', async () => {
    expect(await collect(chunkUtf8('  [  ]  ', [2]))).toEqual([]);
  });

  it('rejects a non-array root', async () => {
    await expect(collect(chunkUtf8('{"id":1}', [1]))).rejects.toThrow(/array/i);
  });

  it('rejects a truncated value', async () => {
    await expect(collect(chunkUtf8('[{"id":1}', [2, 1]))).rejects.toThrow(/incomplete|truncated/i);
  });

  it('rejects trailing garbage after the closing bracket', async () => {
    await expect(collect(chunkUtf8('[{"id":1}] trailing', [3]))).rejects.toThrow(/trailing/i);
  });

  it('honors an aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collect(chunkUtf8('[{"id":1}]', [1]), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
