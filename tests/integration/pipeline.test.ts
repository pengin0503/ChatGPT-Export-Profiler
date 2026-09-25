// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_PROFILES,
  runBoundedBatchProducer,
  type PerformanceProfileName
} from '../../src/import/pipelineProtocol';

async function* values(count: number): AsyncGenerator<number> {
  for (let value = 0; value < count; value += 1) yield value;
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe('bounded pipeline producer', () => {
  for (const profile of ['safe', 'standard', 'fast'] as const satisfies readonly PerformanceProfileName[]) {
    it(`${profile} never exceeds its in-flight batch window`, async () => {
      let inFlight = 0;
      let maxSeen = 0;
      const output: number[] = [];
      const maxInFlightBatches = PERFORMANCE_PROFILES[profile].maxInFlightBatches;

      await runBoundedBatchProducer(values(24), {
        batchSize: 2,
        maxInFlightBatches,
        sendBatch: async (batch) => {
          inFlight += 1;
          maxSeen = Math.max(maxSeen, inFlight);
          output.push(...batch);
          await sleep(3);
          inFlight -= 1;
        }
      });

      expect(maxSeen).toBeLessThanOrEqual(maxInFlightBatches);
      expect(maxSeen).toBe(maxInFlightBatches);
      expect(output).toEqual(Array.from({ length: 24 }, (_, index) => index));
    });
  }

  it('produces identical analytical input across performance profiles', async () => {
    const results: number[][] = [];
    for (const profile of ['safe', 'standard', 'fast'] as const satisfies readonly PerformanceProfileName[]) {
      const output: number[] = [];
      await runBoundedBatchProducer(values(17), {
        batchSize: 3,
        maxInFlightBatches: PERFORMANCE_PROFILES[profile].maxInFlightBatches,
        sendBatch: async (batch) => {
          output.push(...batch);
          await sleep(1);
        }
      });
      results.push(output);
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });
});
