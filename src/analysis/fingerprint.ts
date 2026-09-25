import type { ZipInspection } from '../import/zipInspector';

const SAMPLE_BYTES = 64 * 1024;

export interface ImportFingerprint {
  hash: string;
  algorithm: 'SHA-256';
  fileSize: number;
  lastModified?: number;
  entryCount: number;
  conversationEntry?: {
    filename: string;
    compressedSize: number;
    uncompressedSize: number;
  };
  sampledBytes: number;
}

interface BlobWithModified extends Blob {
  lastModified?: number;
}

interface Sample {
  offset: number;
  bytes: Uint8Array;
}

function sampleOffsets(size: number): number[] {
  if (size <= SAMPLE_BYTES * 3) return [0];
  const middle = Math.floor((size - SAMPLE_BYTES) / 2);
  return [0, middle, size - SAMPLE_BYTES];
}

async function readSamples(file: Blob): Promise<Sample[]> {
  if (file.size <= SAMPLE_BYTES * 3) {
    return [{ offset: 0, bytes: new Uint8Array(await file.arrayBuffer()) }];
  }

  return Promise.all(
    sampleOffsets(file.size).map(async (offset) => ({
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

export async function fingerprintImport(file: Blob, inspection: ZipInspection): Promise<ImportFingerprint> {
  const source = file as BlobWithModified;
  const samples = await readSamples(file);
  const conversationEntry = inspection.conversationEntry
    ? {
        filename: inspection.conversationEntry.filename,
        compressedSize: inspection.conversationEntry.compressedSize,
        uncompressedSize: inspection.conversationEntry.uncompressedSize
      }
    : undefined;

  const metadata = {
    version: 1,
    fileSize: file.size,
    lastModified: typeof source.lastModified === 'number' ? source.lastModified : null,
    entryCount: inspection.entryCount,
    conversationEntry: conversationEntry ?? null,
    samples: samples.map((sample) => ({ offset: sample.offset, length: sample.bytes.byteLength }))
  };

  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const digestInput = concatenate([metadataBytes, ...samples.map((sample) => sample.bytes)]);
  const digest = await crypto.subtle.digest('SHA-256', digestInput);

  return {
    hash: toHex(digest),
    algorithm: 'SHA-256',
    fileSize: file.size,
    lastModified: typeof source.lastModified === 'number' ? source.lastModified : undefined,
    entryCount: inspection.entryCount,
    conversationEntry,
    sampledBytes: samples.reduce((sum, sample) => sum + sample.bytes.byteLength, 0)
  };
}
