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
  /** Legacy single-file export entry, retained for compatibility with existing callers. */
  conversationEntry?: ZipEntrySummary;
  /** Physical entries that together make up the logical conversations payload. */
  conversationEntries?: ZipEntrySummary[];
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

function shardIndex(filename: string): number | undefined {
  const match = /^conversations-(\d+)\.json$/.exec(filename);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

function summarizeEntry(entry: { filename: string; compressedSize: number; uncompressedSize: number }): ZipEntrySummary {
  return {
    filename: entry.filename,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize
  };
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

    const monolithicCandidates = entries.filter(
      (entry) => !entry.directory && entry.filename === 'conversations.json'
    );
    const shardCandidates = entries
      .map((entry) => ({ entry, index: entry.directory ? undefined : shardIndex(entry.filename) }))
      .filter((candidate): candidate is { entry: (typeof entries)[number]; index: number } => candidate.index !== undefined)
      .sort((left, right) => left.index - right.index || left.entry.filename.localeCompare(right.entry.filename));

    for (const entry of entries) {
      if (isUnsafeEntryPath(entry.filename)) {
        blockingIssues.push({ code: 'UNSAFE_ENTRY_PATH', detail: entry.filename });
      }
      if (!entry.directory && compressionRatio(entry.uncompressedSize, entry.compressedSize) > policy.maxCompressionRatio) {
        blockingIssues.push({ code: 'SUSPICIOUS_COMPRESSION_RATIO', detail: entry.filename });
      }
    }

    const duplicateShardName = new Set(shardCandidates.map(({ entry }) => entry.filename)).size !== shardCandidates.length;
    const duplicateShardIndex = new Set(shardCandidates.map(({ index }) => index)).size !== shardCandidates.length;
    const ambiguousConversationPayload =
      monolithicCandidates.length > 1 ||
      (monolithicCandidates.length > 0 && shardCandidates.length > 0) ||
      duplicateShardName ||
      duplicateShardIndex;

    if (monolithicCandidates.length === 0 && shardCandidates.length === 0) {
      blockingIssues.push({ code: 'MISSING_CONVERSATIONS' });
    }
    if (ambiguousConversationPayload) {
      blockingIssues.push({ code: 'DUPLICATE_CONVERSATIONS' });
    }

    const selectedEntries = ambiguousConversationPayload
      ? []
      : monolithicCandidates.length === 1
        ? monolithicCandidates
        : shardCandidates.map(({ entry }) => entry);
    const totalConversationBytes = selectedEntries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    if (selectedEntries.length > 0 && totalConversationBytes > policy.maxConversationBytes) {
      blockingIssues.push({ code: 'CONVERSATIONS_TOO_LARGE', detail: String(totalConversationBytes) });
    }

    const conversationEntries = selectedEntries.map(summarizeEntry);
    const conversationEntry = monolithicCandidates.length === 1 && !ambiguousConversationPayload
      ? summarizeEntry(monolithicCandidates[0])
      : undefined;

    return {
      ok: blockingIssues.length === 0,
      entryCount: entries.length,
      conversationEntry,
      conversationEntries,
      blockingIssues
    };
  } catch (error) {
    return {
      ok: false,
      entryCount: 0,
      conversationEntries: [],
      blockingIssues: [{ code: 'INVALID_ZIP', detail: error instanceof Error ? error.message : 'Unknown ZIP error' }]
    };
  } finally {
    await zipReader.close();
  }
}
