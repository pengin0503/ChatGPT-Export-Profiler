import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const distRoot = resolve(repositoryRoot, 'dist');
const artifactsRoot = resolve(repositoryRoot, 'artifacts');

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }

  return files;
}

const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
const version = String(packageJson.version ?? '0.0.0');
const outputPath = resolve(artifactsRoot, `ChatGPT-Export-Profiler-${version}-offline.zip`);
const distFiles = await collectFiles(distRoot);

await mkdir(artifactsRoot, { recursive: true });

const writer = new BlobWriter('application/zip');
const zip = new ZipWriter(writer);

for (const absolutePath of distFiles) {
  const pathInDist = relative(distRoot, absolutePath).split(sep).join('/');
  const bytes = await readFile(absolutePath);
  await zip.add(`dist/${pathInDist}`, new Uint8ArrayReader(new Uint8Array(bytes)));
}

const serverSource = await readFile(resolve(scriptDirectory, 'serve-offline.mjs'), 'utf8');
await zip.add('serve-offline.mjs', new TextReader(serverSource));
await zip.add(
  'README.txt',
  new TextReader([
    'ChatGPT Export Profiler — offline package',
    '',
    'Requirements: Node.js 22 or newer.',
    '1. Extract this ZIP to a local directory.',
    '2. Run: node serve-offline.mjs',
    '3. Open the printed http://127.0.0.1 URL in a browser.',
    '',
    'The bundled server binds to 127.0.0.1 only and sends no telemetry.',
    'For iPad offline use, install/open the PWA once while online and use its cached app shell afterward.',
    ''
  ].join('\n'))
);

const archive = await zip.close();
await writeFile(outputPath, new Uint8Array(await archive.arrayBuffer()));
console.log(`Created ${outputPath}`);
