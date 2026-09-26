import type { ZipInspection } from '../import/zipInspector';

const SAMPLE_BYTES = 64 * 1024;
const LEGACY_SAMPLE_COUNT = 3;
const CONTENT_SAMPLE_COUNT = 8;

interface FingerprintConversationEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface ImportFingerprint {
  hash: string;
  /** Previous v1/v2 fingerprint, used only to resume or recognize analyses created before v3. */
  legacyHash?: string;
  algorithm: 'SHA-256';
  fileSize: number;
  lastModified?: number;
  entryCount: number;
  conversationEntry?: FingerprintConversationEntry;
  conversationEntries?: FingerprintConversationEntry[];
  sampledBytes: number;
}

interface BlobWithModified extends Blob {
  lastModified?: number;
}

interface Sample {
  offset: number;
  bytes: Uint8Array;
}

function sampleOffsets(size: number, sampleCount: number): number[] {
  if (size <= SAMPLE_BYTES * sampleCount) return [0];
  const maxOffset = size - SAMPLE_BYTES;
  return Array.from({ length: sampleCount }, (_, index) =>
    Math.floor((maxOffset * index) / Math.max(1, sampleCount - 1))
  );
}

async function readSamples(file: Blob, sampleCount: number): Promise<Sample[]> {
  if (file.size <= SAMPLE_BYTES * sampleCount) {
    return [{ offset: 0, bytes: new Uint8Array(await file.arrayBuffer()) }];
  }

  return Promise.all(
    sampleOffsets(file.size, sampleCount).map(async (offset) => ({
      offset,
      bytes: new Uint8Array(await file.slice(offset, offset + SAMPLE_BYTES).arrayBuffer())
    }))
  );
}

function concatenate(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function digestMetadataAndSamples(metadata: Record<string, unknown>, samples: Sample[]): Promise<string> {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const digestInput = concatenate([metadataBytes, ...samples.map((sample) => sample.bytes)]);
  return toHex(await crypto.subtle.digest('SHA-256', digestInput));
}

function copyConversationEntry(entry: FingerprintConversationEntry): FingerprintConversationEntry {
  return {
    filename: entry.filename,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize
  };
}

export async function fingerprintImport(file: Blob, inspection: ZipInspection): Promise<ImportFingerprint> {
  const source = file as BlobWithModified;
  const samples = await readSamples(file, CONTENT_SAMPLE_COUNT);
  const legacySamples = await readSamples(file, LEGACY_SAMPLE_COUNT);
  const conversationEntry = inspection.conversationEntry
    ? copyConversationEntry(inspection.conversationEntry)
    : undefined;
  const conversationEntries = !conversationEntry && inspection.conversationEntries?.length
    ? inspection.conversationEntries.map(copyConversationEntry)
    : undefined;

  const contentMetadata = {
    version: 3,
    fileSize: file.size,
    entryCount: inspection.entryCount,
    conversationEntry: conversationEntry ?? null,
    conversationEntries: conversationEntries ?? null,
    samples: samples.map((sample) => ({ offset: sample.offset, length: sample.bytes.byteLength }))
  };

  // Reproduce the previous algorithm exactly so paused imports and completed analyses
  // created before v3 remain recognizable after upgrading.
  const legacyMetadata = conversationEntries
    ? {
        version: 2,
        fileSize: file.size,
        lastModified: typeof source.lastModified === 'number' ? source.lastModified : null,
        entryCount: inspection.entryCount,
        conversationEntries,
        samples: legacySamples.map((sample) => ({ offset: sample.offset, length: sample.bytes.byteLength }))
      }
    : {
        version: 1,
        fileSize: file.size,
        lastModified: typeof source.lastModified === 'number' ? source.lastModified : null,
        entryCount: inspection.entryCount,
        conversationEntry: conversationEntry ?? null,
        samples: legacySamples.map((sample) => ({ offset: sample.offset, length: sample.bytes.byteLength }))
      };

  const [hash, legacyHash] = await Promise.all([
    digestMetadataAndSamples(contentMetadata, samples),
    digestMetadataAndSamples(legacyMetadata, legacySamples)
  ]);

  return {
    hash,
    legacyHash,
    algorithm: 'SHA-256',
    fileSize: file.size,
    lastModified: typeof source.lastModified === 'number' ? source.lastModified : undefined,
    entryCount: inspection.entryCount,
    conversationEntry,
    conversationEntries,
    sampledBytes: samples.reduce((sum, sample) => sum + sample.bytes.byteLength, 0)
  };
}
