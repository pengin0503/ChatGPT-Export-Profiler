function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

export async function* splitTopLevelJsonArray(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let phase: 'before-array' | 'between-values' | 'in-value' | 'after-array' = 'before-array';
  let buffer = '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  function processText(text: string): string[] {
    const emitted: string[] = [];
    for (const char of text) {
      assertNotAborted(signal);

      if (phase === 'before-array') {
        if (/\s/.test(char)) continue;
        if (char !== '[') throw new Error('Expected a top-level JSON array.');
        phase = 'between-values';
        continue;
      }

      if (phase === 'after-array') {
        if (!/\s/.test(char)) throw new Error('Unexpected trailing data after the top-level JSON array.');
        continue;
      }

      if (phase === 'between-values') {
        if (/\s/.test(char)) continue;
        if (char === ']') {
          phase = 'after-array';
          continue;
        }
        if (char === ',') throw new Error('Unexpected comma in top-level JSON array.');

        phase = 'in-value';
        buffer = char;
        depth = char === '{' || char === '[' ? 1 : 0;
        inString = char === '"';
        escaped = false;
        continue;
      }

      if (inString) {
        buffer += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        buffer += char;
        continue;
      }

      if (char === '{' || char === '[') {
        depth += 1;
        buffer += char;
        continue;
      }

      if (char === '}' || char === ']') {
        if (depth > 0) {
          depth -= 1;
          buffer += char;
          continue;
        }
        if (char === ']') {
          const value = buffer.trim();
          if (!value) throw new Error('Incomplete JSON array value.');
          emitted.push(value);
          buffer = '';
          phase = 'after-array';
          continue;
        }
        throw new Error('Unexpected closing brace in top-level JSON value.');
      }

      if (depth === 0 && char === ',') {
        const value = buffer.trim();
        if (!value) throw new Error('Incomplete JSON array value.');
        emitted.push(value);
        buffer = '';
        phase = 'between-values';
        continue;
      }

      buffer += char;
    }
    return emitted;
  }

  try {
    while (true) {
      assertNotAborted(signal);
      const { value, done } = await reader.read();
      if (done) break;
      for (const item of processText(decoder.decode(value, { stream: true }))) yield item;
    }

    for (const item of processText(decoder.decode())) yield item;
    assertNotAborted(signal);

    if (phase !== 'after-array') {
      throw new Error('Incomplete or truncated top-level JSON array.');
    }
  } finally {
    if (signal?.aborted) {
      try {
        await reader.cancel(createAbortError());
      } catch {
        // The source may already be closed.
      }
    }
    reader.releaseLock();
  }
}
