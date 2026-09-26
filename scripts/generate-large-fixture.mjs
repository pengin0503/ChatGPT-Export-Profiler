import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

const ALLOWED_COUNTS = new Set([1000, 10000, 50000]);
const MODELS = ['gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-luna', 'synthetic-unknown-model'];
const TOOLS = ['web', 'python', 'file_search', 'connector', 'synthetic_unknown_tool'];
const FIXED_ZIP_DATE = new Date('2000-01-01T00:00:00.000Z');

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}.`);
    args.set(key, value);
  }
  const conversations = Number(args.get('--conversations'));
  const output = args.get('--output');
  if (!ALLOWED_COUNTS.has(conversations)) {
    throw new Error('--conversations must be one of 1000, 10000, or 50000.');
  }
  if (!output) throw new Error('--output is required.');
  return { conversations, output: resolve(output) };
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function makeConversation(index, rng) {
  const id = `synthetic-${index.toString().padStart(6, '0')}`;
  const base = 1_700_000_000 + index * 137;
  const model = MODELS[Math.floor(rng() * MODELS.length)];
  const tool = index % 5 === 0 ? TOOLS[Math.floor(rng() * TOOLS.length)] : undefined;
  const userNode = `${id}-user`;
  const assistantNode = `${id}-assistant`;
  const assistantMetadata = {
    model_slug: model,
    ...(tool ? { tool_name: tool } : {}),
    ...(index % 17 === 0 ? { synthetic_unknown_metadata: { version: 1, marker: 'fixture-only' } } : {})
  };

  return {
    id,
    title: `Synthetic conversation ${index}`,
    create_time: base,
    update_time: base + 30,
    mapping: {
      [userNode]: {
        id: userNode,
        parent: null,
        children: [assistantNode],
        message: {
          id: `${id}-message-user`,
          author: { role: 'user' },
          create_time: base,
          content: { content_type: 'text', parts: [`Synthetic user prompt ${index}. Deterministic fixture content only.`] },
          metadata: { model_slug: model }
        }
      },
      [assistantNode]: {
        id: assistantNode,
        parent: userNode,
        children: [],
        message: {
          id: `${id}-message-assistant`,
          author: { role: 'assistant' },
          create_time: base + 30,
          content: { content_type: 'text', parts: [`Synthetic assistant response ${index}. Model bucket ${model}.`] },
          metadata: assistantMetadata
        }
      }
    },
    ...(index % 29 === 0 ? { synthetic_unknown_conversation_field: ['fixture-only', index % 3] } : {})
  };
}

async function main() {
  const { conversations, output } = parseArgs(process.argv.slice(2));
  const rng = createRng(0x00c0ffee);
  const payload = new Array(conversations);
  for (let index = 0; index < conversations; index += 1) payload[index] = makeConversation(index, rng);

  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer);
  await zip.add('conversations.json', new TextReader(JSON.stringify(payload)), {
    level: 1,
    lastModDate: FIXED_ZIP_DATE
  });
  const blob = await zip.close();
  const bytes = new Uint8Array(await blob.arrayBuffer());

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  process.stdout.write(`Generated ${conversations} fully synthetic conversations at ${output} (${bytes.byteLength} bytes).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
