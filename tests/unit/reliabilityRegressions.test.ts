// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import minimal from '../fixtures/minimal-conversations.json';
import { normalizeConversation } from '../../src/analysis/normalize';
import { QualityCollector } from '../../src/analysis/quality';

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('reliability regressions', () => {
  it('reports unknown structural fields as generalized typed paths without recording their values', () => {
    const quality = new QualityCollector();
    const raw = structuredClone(minimal) as unknown as Record<string, unknown>;
    const mapping = raw.mapping as Record<string, Record<string, unknown>>;
    const node = mapping['assistant-node'];
    const message = node.message as Record<string, unknown>;
    const author = message.author as Record<string, unknown>;
    const content = message.content as Record<string, unknown>;
    const parts = content.parts as unknown[];

    node.synthetic_node_field = 42;
    message.synthetic_message_field = true;
    author.synthetic_author_field = 'do-not-record-this-value';
    content.synthetic_content_field = { private: 'do-not-record-this-value' };
    parts.push({ text: 'Synthetic visible text', synthetic_part_field: 'do-not-record-this-value' });

    normalizeConversation(raw, quality);
    const keys = quality.snapshot().unknownSchemaKeys;

    expect(keys).toContain('mapping.node.synthetic_node_field:number');
    expect(keys).toContain('message.synthetic_message_field:boolean');
    expect(keys).toContain('message.author.synthetic_author_field:string');
    expect(keys).toContain('message.content.synthetic_content_field:object');
    expect(keys).toContain('message.content.parts[].synthetic_part_field:string');
    expect(keys.join('\n')).not.toContain('do-not-record-this-value');
  });

  it('uses a bounded cursor scan for conversation table pagination instead of getAllFromIndex', () => {
    const source = readRepoFile('src/storage/analyticsQueries.ts');
    const queryStart = source.indexOf('export async function queryConversationMetrics');
    const queryEnd = source.indexOf('export async function listAllConversationMetrics');
    const querySource = source.slice(queryStart, queryEnd);

    expect(querySource).toContain('scanConversationPage');
    expect(querySource).not.toContain('listConversationRows');
    expect(source).toContain('openCursor');
  });

  it('keeps release candidates tag-driven and immutable', () => {
    const workflow = readRepoFile('.github/workflows/release.yml');
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).not.toContain('[release-rc]');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).not.toMatch(/push:\s*\n\s*branches:/);
  });

  it('removes the obsolete implementation-only workflow', () => {
    expect(existsSync(join(process.cwd(), '.github/workflows/implementation-check.yml'))).toBe(false);
  });

  it('centralizes analysis provenance versions instead of hard-coding them in the import controller', () => {
    const controller = readRepoFile('src/features/import/importController.ts');
    const versions = readRepoFile('src/version.ts');

    expect(controller).toContain("from '../../version'");
    expect(controller).not.toContain("appVersion: '0.1.0'");
    expect(versions).toContain('ANALYZER_VERSION');
    expect(versions).toContain('TOKENIZER_VERSION');
    expect(versions).toContain('ANALYSIS_SCHEMA_VERSION');
  });
});
