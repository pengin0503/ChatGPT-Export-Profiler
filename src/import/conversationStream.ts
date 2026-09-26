import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { splitTopLevelJsonArray } from './jsonArrayStream';
import { inspectExportZip, type ZipEntrySummary, type ZipInspection, type ZipSafetyPolicy } from './zipInspector';

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

function selectedConversationEntries(inspection: ZipInspection): ZipEntrySummary[] {
  if (inspection.conversationEntries && inspection.conversationEntries.length > 0) {
    return inspection.conversationEntries;
  }
  return inspection.conversationEntry ? [inspection.conversationEntry] : [];
}

export async function* streamConversationObjects(
  file: Blob,
  signal: AbortSignal,
  zipSafetyPolicy?: ZipSafetyPolicy
): AsyncGenerator<unknown> {
  if (signal.aborted) throw abortError();
  const inspection = await inspectExportZip(file, zipSafetyPolicy);
  const selected = selectedConversationEntries(inspection);
  if (!inspection.ok || selected.length === 0) throw new ExportZipSafetyError(inspection);
  if (signal.aborted) throw abortError();

  // This stream already runs inside the dedicated import worker in production.
  // Keeping zip.js inline here avoids spawning a nested codec worker whose URL can
  // be unavailable after bundling, while decompression still stays off the UI thread.
  const zipReader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  let extraction: Promise<unknown> | undefined;
  try {
    const entries = await zipReader.getEntries({ filenameValidation: 'tolerant' });

    for (const selectedEntry of selected) {
      if (signal.aborted) throw abortError();
      const candidates = entries.filter((entry) => !entry.directory && entry.filename === selectedEntry.filename);
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
      extraction = undefined;
    }
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
