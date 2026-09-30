export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Import was cancelled.');
  error.name = 'AbortError';
  throw error;
}
