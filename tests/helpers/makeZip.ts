import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

export interface SyntheticZipEntry {
  name: string;
  text: string;
  level?: number;
}

export async function makeZip(entries: SyntheticZipEntry[]): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer);
  for (const entry of entries) {
    await zip.add(entry.name, new TextReader(entry.text), entry.level === undefined ? undefined : { level: entry.level });
  }
  await zip.close();
  return writer.getData();
}
