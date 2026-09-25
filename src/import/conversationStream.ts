import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { splitTopLevelJsonArray } from './jsonArrayStream';
import { inspectExportZip, type ZipInspection } from './zipInspector';

export class ExportZipSafetyError extends Error {
  readonly code = 'ZIP_SAFETY_BLOCKED' as const;

  constructor(readonly inspection: ZipInspection) {
    super('The export ZIP failed local safety inspection.');
    this.name = 'ExportZipSafetyError';
  }
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export async function* streamConversationObjects(file: Blob, signal: AbortSignal): AsyncGenerator<unknown> {
  if (signal.aborted) throw abortError();
  const inspection = await inspectExportZip(file);
  if (!inspection.ok || !inspection.conversationEntry) throw new ExportZipSafetyError(inspection);
  if (signal.aborted) throw abortError();

  const zipReader = new ZipReader(new BlobReader(file));
  let extraction: Promise<unknown> | undefined;
  try {
    const entries = await zipReader.getEntries({ filenameValidation: 'tolerant' });
    const candidates = entries.filter((entry) => !entry.directory && entry.filename === inspection.conversationEntry?.filename);
    const candidate = candidates[0];
    if (candidates.length !== 1 || !candidate || !('getData' in candidate)) {
      throw new ExportZipSafetyError(inspection);
    }

    const transform = new TransformStream<Uint8Array, Uint8Array>();
    extraction = candidate.getData(transform.writable, { signal });

    for await (const value of splitTopLevelJsonArray(transform.readable, signal)) {
      if (signal.aborted) throw abortError();
      yield JSON.parse(value) as unknown;
    }
    await extraction;
  } finally {
    if (extraction) {
      try {
        await extraction;
      } catch {
        // Preserve the primary parser/abort error when one is already propagating.
      }
    }
    await zipReader.close();
  }
}
