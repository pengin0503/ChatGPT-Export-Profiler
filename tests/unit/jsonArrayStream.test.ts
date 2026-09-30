import { describe, expect, it, vi } from 'vitest';
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

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal, maxValueBytes?: number): Promise<string[]> {
  const values: string[] = [];
  for await (const value of splitTopLevelJsonArray(stream, signal, maxValueBytes)) values.push(value);
  return values;
}

describe('splitTopLevelJsonArray', () => {
  it('limits each value separately and accepts the exact byte boundary', async () => {
    expect(await collect(chunkUtf8('[{"id":1},{"id":2}]', [3]), undefined, 8)).toEqual(['{"id":1}', '{"id":2}']);
    await expect(collect(chunkUtf8('[{"id":1}]', [3]), undefined, 7)).rejects.toMatchObject({ code: 'CONVERSATION_TOO_LARGE' });
  });

  it('enforces the default 32 MiB limit before materializing an oversized value', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode('[{"text":"'));
        else if (pulls <= 514) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() { cancelled = true; }
    });
    await expect(collect(stream)).rejects.toMatchObject({ code: 'CONVERSATION_TOO_LARGE' });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(514);
  }, 15_000);

  it('measures UTF-8 bytes across split multibyte characters', async () => {
    const input = '[{"text":"日😀"}]';
    expect(await collect(chunkUtf8(input, [1]), undefined, 18)).toEqual(['{"text":"日😀"}']);
    await expect(collect(chunkUtf8(input, [1]), undefined, 17)).rejects.toMatchObject({ code: 'CONVERSATION_TOO_LARGE' });
  });

  it('cancels the source immediately when a value grows beyond the limit', async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 4) { controller.close(); return; }
        controller.enqueue(new TextEncoder().encode(pulls === 1 ? '[{"text":"' : 'synthetic chunk'));
      },
      cancel() { cancelled = true; }
    });
    await expect(collect(stream, undefined, 20)).rejects.toMatchObject({ code: 'CONVERSATION_TOO_LARGE' });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(5);
  });

  it('survives UTF-8 chunk splits, escaped quotes, nested values, and braces inside strings', async () => {
    const input = JSON.stringify([
      { text: '} ] \\" 日本語', nested: { value: [1, 2, 3] } },
      { text: 'Synthetic message B', enabled: true }
    ]);
    const values = await collect(chunkUtf8(input, [1, 2, 5, 3]));
    expect(values.map((value) => JSON.parse(value))).toEqual(JSON.parse(input));
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

  it('cancels the underlying reader when a consumer stops iteration early', async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    let emitted = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!emitted) {
          emitted = true;
          controller.enqueue(encoder.encode('[{"id":1},'));
        }
      },
      cancel
    });

    for await (const value of splitTopLevelJsonArray(stream)) {
      expect(JSON.parse(value)).toEqual({ id: 1 });
      break;
    }

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
