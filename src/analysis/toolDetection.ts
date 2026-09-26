import type { NormalizedToolEvent } from './domain';

type ToolKind = NormalizedToolEvent['kind'];

const TOOL_KIND_BY_RAW: Readonly<Record<string, ToolKind>> = {
  web: 'web-search',
  search: 'web-search',
  browser: 'web-search',
  web_search: 'web-search',
  'web-search': 'web-search',
  file: 'file',
  file_search: 'file',
  myfiles_browser: 'file',
  image: 'image',
  image_gen: 'image',
  dalle: 'image',
  python: 'python',
  python_user_visible: 'python',
  code_interpreter: 'python',
  connector: 'connector',
  plugin: 'connector',
  mcp: 'connector'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectIdentifiers(metadata: Record<string, unknown>): string[] {
  const identifiers: string[] = [];
  for (const key of ['tool_name', 'tool_type', 'recipient', 'tool'] as const) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) identifiers.push(value.trim());
  }

  const invoked = metadata.invoked_plugin;
  if (isRecord(invoked)) {
    for (const key of ['type', 'name'] as const) {
      const value = invoked[key];
      if (typeof value === 'string' && value.trim()) identifiers.push(value.trim());
    }
  }
  return identifiers;
}

export function detectToolEvents(metadata: unknown): NormalizedToolEvent[] {
  if (!isRecord(metadata)) return [];

  const seen = new Set<string>();
  const events: NormalizedToolEvent[] = [];
  for (const rawType of collectIdentifiers(metadata)) {
    if (seen.has(rawType)) continue;
    seen.add(rawType);
    const kind = TOOL_KIND_BY_RAW[rawType.toLowerCase()] ?? 'unknown';
    events.push({ kind, rawType });
  }
  return events;
}
