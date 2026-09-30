// @vitest-environment node
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { QualityCollector } from '../../src/analysis/quality';

describe('quality diagnostic memory', () => {
  it('retains bounded memory after many unique synthetic schema keys', () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const quality = new QualityCollector();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let index = 0; index < 20_000; index += 1) {
      const key = decoder.decode(encoder.encode('synthetic-' + index + ':' + 'x'.repeat(2048)));
      quality.addUnknownSchema(key);
    }
    gc();
    const retainedBytes = process.memoryUsage().heapUsed - before;
    const snapshot = quality.snapshot();
    expect(snapshot.unknownSchema).toBe(20_000);
    expect(snapshot.issues).toHaveLength(200);
    expect(snapshot.unknownSchemaKeys).toHaveLength(200);
    expect(retainedBytes).toBeLessThan(4 * 1024 * 1024);
  });
});
