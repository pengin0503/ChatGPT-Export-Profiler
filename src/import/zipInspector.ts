import { BlobReader, ZipReader } from '@zip.js/zip.js';

export const DEFAULT_ZIP_SAFETY = {
  maxEntries: 50_000,
  maxConversationBytes: 8 * 1024 * 1024 * 1024,
  maxCompressionRatio: 500
} as const;

export interface ZipSafetyPolicy {
  maxEntries: number;
  maxConversationBytes: number;
  maxCompressionRatio: number;
}

export type ZipBlockingCode =
  | 'TOO_MANY_ENTRIES'
  | 'MISSING_CONVERSATIONS'
  | 'DUPLICATE_CONVERSATIONS'
  | 'UNSAFE_ENTRY_PATH'
  | 'CONVERSATIONS_TOO_LARGE'
  | 'SUSPICIOUS_COMPRESSION_RATIO'
  | 'INVALID_ZIP';

export interface ZipBlockingIssue {
  code: ZipBlockingCode;
  detail?: string;
}

export interface ZipEntrySummary {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface ZipInspection {
  ok: boolean;
  entryCount: number;
  conversationEntry?: ZipEntrySummary;
  blockingIssues: ZipBlockingIssue[];
}

function isUnsafeEntryPath(filename: string): boolean {
  if (filename.includes('\0')) return true;
  const normalized = filename.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.startsWith('//') || /^[A-Za-z]:\//.test(normalized)) return true;
  return normalized.split('/').some((part) => part === '..');
}

function compressionRatio(uncompressedSize: number, compressedSize: number): number {
  if (uncompressedSize === 0) return 0;
  return uncompressedSize / Math.max(1, compressedSize);
}

export async function inspectExportZip(
  file: Blob,
  policy: ZipSafetyPolicy = DEFAULT_ZIP_SAFETY
): Promise<ZipInspection> {
  const blockingIssues: ZipBlockingIssue[] = [];
  const zipReader = new ZipReader(new BlobReader(file));

  try {
    const entries = await zipReader.getEntries({ filenameValidation: 'tolerant' });
    if (entries.length > policy.maxEntries) {
      blockingIssues.push({ code: 'TOO_MANY_ENTRIES', detail: String(entries.length) });
    }

    const candidates = entries.filter((entry) => !entry.directory && entry.filename === 'conversations.json');
    for (const entry of entries) {
      if (isUnsafeEntryPath(entry.filename)) {
        blockingIssues.push({ code: 'UNSAFE_ENTRY_PATH', detail: entry.filename });
      }
      if (!entry.directory && compressionRatio(entry.uncompressedSize, entry.compressedSize) > policy.maxCompressionRatio) {
        blockingIssues.push({ code: 'SUSPICIOUS_COMPRESSION_RATIO', detail: entry.filename });
      }
    }

    if (candidates.length === 0) blockingIssues.push({ code: 'MISSING_CONVERSATIONS' });
    if (candidates.length > 1) blockingIssues.push({ code: 'DUPLICATE_CONVERSATIONS' });

    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (candidate && candidate.uncompressedSize > policy.maxConversationBytes) {
      blockingIssues.push({ code: 'CONVERSATIONS_TOO_LARGE', detail: String(candidate.uncompressedSize) });
    }

    return {
      ok: blockingIssues.length === 0,
      entryCount: entries.length,
      conversationEntry: candidate
        ? {
            filename: candidate.filename,
            compressedSize: candidate.compressedSize,
            uncompressedSize: candidate.uncompressedSize
          }
        : undefined,
      blockingIssues
    };
  } catch (error) {
    return {
      ok: false,
      entryCount: 0,
      blockingIssues: [{ code: 'INVALID_ZIP', detail: error instanceof Error ? error.message : 'Unknown ZIP error' }]
    };
  } finally {
    await zipReader.close();
  }
}
