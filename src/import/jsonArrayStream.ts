export const MAX_CONVERSATION_VALUE_BYTES = 32 * 1024 * 1024;

export class ConversationSizeLimitError extends Error {
  readonly code = 'CONVERSATION_TOO_LARGE';

  constructor() {
    super('A single conversation exceeds the local parsing size limit.');
    this.name = 'ConversationSizeLimitError';
  }
}

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
  signal?: AbortSignal,
  maxValueBytes = MAX_CONVERSATION_VALUE_BYTES
): AsyncGenerator<string> {
  if (!Number.isSafeInteger(maxValueBytes) || maxValueBytes <= 0) throw new RangeError('Invalid JSON value size limit.');
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let phase: 'before-array' | 'between-values' | 'in-value' | 'after-array' = 'before-array';
  let finished = false;
  let completedNormally = false;
  const parts: string[] = [];
  let pending: string[] = [];
  let valueBytes = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;

  function append(char: string): void {
    const codePoint = char.codePointAt(0)!;
    valueBytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (valueBytes > maxValueBytes) throw new ConversationSizeLimitError();
    pending.push(char);
    // Flatten small chunks so per-character string nodes do not outgrow the byte limit.
    if (pending.length === 4096) {
      parts.push(pending.join(''));
      pending = [];
    }
  }

  function takeValue(): string {
    if (pending.length > 0) parts.push(pending.join(''));
    const value = parts.join('').trim();
    parts.length = 0;
    pending = [];
    valueBytes = 0;
    if (!value) throw new Error('Incomplete JSON array value.');
    return value;
  }

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
          finished = true;
          continue;
        }
        if (char === ',') throw new Error('Unexpected comma in top-level JSON array.');

        phase = 'in-value';
        append(char);
        depth = char === '{' || char === '[' ? 1 : 0;
        inString = char === '"';
        escaped = false;
        continue;
      }

      if (inString) {
        append(char);
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
        append(char);
        continue;
      }

      if (char === '{' || char === '[') {
        depth += 1;
        append(char);
        continue;
      }

      if (char === '}' || char === ']') {
        if (depth > 0) {
          depth -= 1;
          append(char);
          continue;
        }
        if (char === ']') {
          emitted.push(takeValue());
          phase = 'after-array';
          finished = true;
          continue;
        }
        throw new Error('Unexpected closing brace in top-level JSON value.');
      }

      if (depth === 0 && char === ',') {
        emitted.push(takeValue());
        phase = 'between-values';
        continue;
      }

      append(char);
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

    if (!finished) {
      throw new Error('Incomplete or truncated top-level JSON array.');
    }
    completedNormally = true;
  } finally {
    if (!completedNormally) {
      try {
        await reader.cancel(signal?.aborted ? createAbortError() : new Error('JSON array iteration stopped before completion.'));
      } catch {
        // The source may already be closed or errored.
      }
    }
    reader.releaseLock();
  }
}
