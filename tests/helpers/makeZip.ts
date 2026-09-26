import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

export interface SyntheticZipEntry {
  name: string;
  text: string;
  level?: number;
}

function replaceAllBytes(bytes: Uint8Array, from: Uint8Array, to: Uint8Array): void {
  if (from.length !== to.length) throw new Error('Synthetic ZIP filename replacement must preserve byte length.');
  outer: for (let offset = 0; offset <= bytes.length - from.length; offset += 1) {
    for (let index = 0; index < from.length; index += 1) {
      if (bytes[offset + index] !== from[index]) continue outer;
    }
    bytes.set(to, offset);
    offset += from.length - 1;
  }
}

export async function makeZip(entries: SyntheticZipEntry[]): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer);
  const seen = new Map<string, number>();
  const replacements: Array<{ placeholder: string; original: string }> = [];

  for (const entry of entries) {
    const occurrence = seen.get(entry.name) ?? 0;
    seen.set(entry.name, occurrence + 1);

    let filename = entry.name;
    if (occurrence > 0) {
      if (!/^[\x20-\x7e]+$/.test(entry.name) || occurrence >= entry.name.length) {
        throw new Error('Duplicate-name synthetic ZIP fixtures require short ASCII filenames.');
      }
      filename = `${'_'.repeat(occurrence)}${entry.name.slice(occurrence)}`;
      replacements.push({ placeholder: filename, original: entry.name });
    }

    await zip.add(filename, new TextReader(entry.text), entry.level === undefined ? undefined : { level: entry.level });
  }

  const blob = await zip.close();
  if (replacements.length === 0) return blob;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const encoder = new TextEncoder();
  for (const replacement of replacements) {
    replaceAllBytes(bytes, encoder.encode(replacement.placeholder), encoder.encode(replacement.original));
  }
  return new Blob([bytes], { type: 'application/zip' });
}
