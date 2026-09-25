# ChatGPT Export Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully local React/TypeScript application that imports ChatGPT export ZIP files, analyzes regular Chat usage, clearly separates observed/calculated/estimated metrics, persists analytics locally, and ships as both a PWA and downloadable offline distribution.

**Architecture:** A client-only pipeline streams `conversations.json` out of the ZIP into a bounded parser/normalizer/tokenizer/aggregator flow running in Web Workers. IndexedDB stores normalized analytics and checkpoints but not full conversation bodies by default; the React UI reads only derived data. The same source tree produces a GitHub Pages PWA and an offline release package, with no export-data network path.

**Tech Stack:** React, TypeScript, Vite, `@zip.js/zip.js`, `js-tiktoken/lite` with bundled local rank data, `idb`, `@tanstack/react-virtual`, Vitest, Testing Library, Playwright, `vite-plugin-pwa`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-25-chatgpt-export-profiler-design.md`

## Global Constraints

- Core processing is fully local; export data, message content, derived analytics, pricing overrides, and comparison data must never be transmitted externally.
- Formal browser targets are Chrome, Edge, Firefox, iPad Safari, and iPad Orion.
- Core functionality must not depend on File System Access API.
- Full conversation bodies are not persisted to IndexedDB by default.
- v1 UI languages are Japanese and English.
- Metrics must preserve provenance as `observed`, `calculated`, or `estimated`.
- Large exports must avoid whole-archive extraction and must avoid monolithic `JSON.parse()` of `conversations.json` on the large-file path.
- Unknown model/tool/schema values must remain visible and must not be silently coerced into known values.
- PWA runtime assets may use the network only for app delivery/update; imported data is never cached by the service worker.
- No third-party telemetry, tracking, runtime CDN, or external tokenizer fetch is allowed.
- Tests must use synthetic/sanitized fixtures only; no real user conversation data enters the repository.
- The implementation must remain usable with touch input and iPad portrait/landscape layouts.

## Review Focus

1. **A ZIP whose `conversations.json` contains braces, brackets, quotes, escaped quotes, and Unicode inside strings** must stream-split into the same objects as whole-file JSON parsing; Task 5 adds adversarial parser tests.
2. **A malformed conversation among valid conversations** must be recorded as recoverable data-quality damage without discarding valid neighbors; Task 3 adds mixed-validity fixture tests.
3. **An unknown model and an unknown tool type** must remain queryable as unknown/raw values instead of being mapped to a known model/tool; Tasks 2 and 3 pin this behavior.
4. **A resumed import with a different ZIP selected** must refuse checkpoint reuse until the source fingerprint matches; Task 7 adds mismatch tests.
5. **No analysis path may call `fetch`, XHR, `sendBeacon`, WebSocket, or a third-party URL**; Tasks 12 and 14 add CSP/network E2E assertions.

---

## File map

The plan creates these responsibility boundaries before feature work begins:

```text
src/
  app/
    App.tsx                         routing/shell only
    AppProviders.tsx                locale + analysis session providers
    navigation.ts                   navigation metadata
  analysis/
    domain.ts                       canonical shared types/provenance
    modelRegistry.ts                raw -> canonical model mapping
    normalize.ts                    export node -> normalized records
    toolDetection.ts                metadata -> normalized tool events
    tokenizers.ts                   tokenizer abstraction + lazy registry
    aggregate.ts                    deterministic analytics aggregation
    pricing.ts                      price lookup + cost calculations
    quality.ts                      issue collection/coverage calculations
    fingerprint.ts                  import fingerprint functions
  import/
    zipInspector.ts                 ZIP metadata/safety inspection
    jsonArrayStream.ts              incremental top-level JSON-array splitter
    conversationStream.ts           ZIP entry -> conversation object stream
    pipelineProtocol.ts             typed worker messages
  workers/
    import.worker.ts                ZIP/decode/normalize producer
    analysis.worker.ts              token/aggregate/storage consumer
  storage/
    db.ts                           IndexedDB schema/opening
    repositories.ts                 persistence API
    analyticsQueries.ts             bounded analytics read models
  data/
    modelAliases.ts                 built-in alias records
    pricing.v1.ts                   versioned built-in pricing data
  features/
    import/                         source selection/progress/recovery
    overview/                       summary cards
    timeline/                       timeline analytics
    models/                         model analytics
    conversations/                  virtualized conversation table/details
    cost/                           cost simulator
    tools/                          tool/web analytics
    comparison/                     Chat vs Work/Codex comparison
    data-quality/                   coverage/issues UI
    settings/                       locale/performance/pricing/storage UI
    export-results/                 JSON/CSV/Markdown result export
  i18n/
    index.ts
    ja.ts
    en.ts
  styles/
    globals.css
    tokens.css
  pwa/
    service-worker.ts

tests/
  fixtures/
  helpers/
  unit/
  integration/
  e2e/
  performance/
scripts/
  generate-large-fixture.mjs
  make-offline-package.mjs
  serve-offline.mjs
.github/workflows/
  ci.yml
  pages.yml
  release.yml
```

---

### Task 1: Bootstrap the tested application shell and core provenance types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/AppProviders.tsx`
- Create: `src/app/navigation.ts`
- Create: `src/analysis/domain.ts`
- Create: `src/i18n/index.ts`
- Create: `src/i18n/ja.ts`
- Create: `src/i18n/en.ts`
- Create: `src/styles/tokens.css`
- Create: `src/styles/globals.css`
- Create: `tests/unit/domain.test.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Produces: `MetricProvenance`, `AnalysisId`, `CanonicalModelId`, `NormalizedConversation`, `NormalizedMessage`, `AnalysisSummary` from `src/analysis/domain.ts`.
- Produces: `t(key)` and locale provider consumed by all later UI tasks.

- [ ] **Step 1: Create the project manifest and test/build scripts**

Use a Vite React TypeScript project and install only the initial dependencies required by this task plus dependencies named in the plan:

```json
{
  "name": "chatgpt-export-profiler",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

Install current stable compatible releases of React, React DOM, TypeScript, Vite, Vitest, Testing Library, Playwright, ESLint, `@zip.js/zip.js`, `js-tiktoken`, `idb`, `@tanstack/react-virtual`, `fake-indexeddb`, and `vite-plugin-pwa`. Commit the generated lockfile.

- [ ] **Step 2: Write the failing provenance/domain test**

```ts
import { describe, expect, it } from 'vitest';
import { provenanceLabel } from '../../src/analysis/domain';

describe('provenanceLabel', () => {
  it('keeps observed, calculated, and estimated distinct', () => {
    expect(provenanceLabel('observed')).toBe('observed');
    expect(provenanceLabel('calculated')).toBe('calculated');
    expect(provenanceLabel('estimated')).toBe('estimated');
  });
});
```

- [ ] **Step 3: Run the unit test and verify it fails**

Run: `npm test -- tests/unit/domain.test.ts`

Expected: FAIL because `src/analysis/domain.ts` does not exist.

- [ ] **Step 4: Add the canonical domain types**

Implement `src/analysis/domain.ts` with focused shared types. The minimum contract is:

```ts
export type MetricProvenance = 'observed' | 'calculated' | 'estimated';
export type AnalysisId = string;
export type CanonicalModelId = string;

export interface NormalizedMessage {
  conversationId: string;
  messageId: string;
  parentId?: string;
  role: string;
  createdAt?: number;
  updatedAt?: number;
  canonicalModelId?: CanonicalModelId;
  rawModelSlug?: string;
  text: string;
  toolEvents: NormalizedToolEvent[];
  attachmentCount: number;
  unknownMetadataKeys: string[];
}

export interface NormalizedToolEvent {
  kind: 'web-search' | 'file' | 'image' | 'python' | 'connector' | 'unknown';
  rawType: string;
}

export interface NormalizedConversation {
  id: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  messages: NormalizedMessage[];
}

export interface AnalysisSummary {
  analysisId: AnalysisId;
  conversations: number;
  messages: number;
  visibleTokens: number;
}

export function provenanceLabel(value: MetricProvenance): MetricProvenance {
  return value;
}
```

- [ ] **Step 5: Add Japanese/English locale plumbing and the app shell**

Implement `src/i18n/index.ts` with a small typed dictionary selector and populate initial navigation/import/privacy strings in `ja.ts` and `en.ts`. `App.tsx` renders the application name, privacy statement, and navigation shell without analysis features yet.

- [ ] **Step 6: Run unit, type, lint, build, and browser smoke checks**

Run:

```bash
npm test -- tests/unit/domain.test.ts
npm run typecheck
npm run lint
npm run build
npm run e2e -- tests/e2e/smoke.spec.ts
```

Expected: all PASS; smoke test confirms the title and local-analysis privacy text render in Chromium and WebKit projects.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts eslint.config.js index.html src tests playwright.config.ts
git commit -m "chore: bootstrap profiler application"
```

---

### Task 2: Model registry and versioned pricing engine

**Files:**
- Create: `src/data/modelAliases.ts`
- Create: `src/data/pricing.v1.ts`
- Create: `src/analysis/modelRegistry.ts`
- Create: `src/analysis/pricing.ts`
- Create: `tests/unit/modelRegistry.test.ts`
- Create: `tests/unit/pricing.test.ts`

**Interfaces:**
- Produces: `resolveModel(raw: string): ModelResolution`.
- Produces: `findPrice(modelId, timestamp, pricing): PricingRecord | undefined`.
- Produces: `calculateVisibleCost(inputTokens, outputTokens, record): number`.
- Produces: `calculateScenarioCost(usage, record, assumptions): CostRange`.

- [ ] **Step 1: Write failing tests for known aliases, unknown models, effective dates, and scenario math**

```ts
it('preserves an unknown raw model', () => {
  expect(resolveModel('future-model-x')).toEqual({
    canonicalId: undefined,
    raw: 'future-model-x',
    confidence: 'unknown'
  });
});

it('uses the price effective on the message date', () => {
  const record = findPrice('example-model', Date.parse('2026-06-01'), [
    { model: 'example-model', effectiveFrom: '2026-01-01', effectiveTo: '2026-04-30', inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2, currency: 'USD', datasetVersion: 1 },
    { model: 'example-model', effectiveFrom: '2026-05-01', effectiveTo: null, inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 4, currency: 'USD', datasetVersion: 1 }
  ]);
  expect(record?.inputPerMillion).toBe(2);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- tests/unit/modelRegistry.test.ts tests/unit/pricing.test.ts`

Expected: FAIL because registry/pricing modules are missing.

- [ ] **Step 3: Implement explicit model resolution**

`ModelResolution` must be:

```ts
export interface ModelResolution {
  canonicalId?: CanonicalModelId;
  raw: string;
  confidence: 'exact' | 'alias' | 'family' | 'unknown';
}
```

Resolution order is exact canonical ID, explicit alias, conservative family-prefix rule, unknown. Never map an unknown raw value merely because it resembles a nearby known model.

- [ ] **Step 4: Implement pricing types and pure cost functions**

Use:

```ts
export interface PricingRecord {
  model: CanonicalModelId;
  effectiveFrom: string;
  effectiveTo: string | null;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  currency: 'USD';
  datasetVersion: number;
  source?: string;
}

export interface CostAssumptions {
  cacheRatio: number;
  hiddenInputOverheadRatio: number;
  reasoningOutputOverheadRatio: number;
}
```

Reject ratios outside `0..1` and negative token counts. `calculateScenarioCost` returns lower/upper values plus the assumptions and marks the result as estimated at the view-model boundary.

- [ ] **Step 5: Add built-in alias/pricing data as data-only modules**

Use the current official OpenAI API pricing/model documentation at implementation time to populate the initial version. Every built-in price record includes an effective date and source metadata. Do not infer historical prices that cannot be sourced; leave unsupported historical periods without a price and surface them later as coverage gaps.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- tests/unit/modelRegistry.test.ts tests/unit/pricing.test.ts
npm run typecheck
git add src/data src/analysis/modelRegistry.ts src/analysis/pricing.ts tests/unit/modelRegistry.test.ts tests/unit/pricing.test.ts
git commit -m "feat: add model and pricing engines"
```

---

### Task 3: Data-quality collector, tool detection, and export-node normalizer

**Files:**
- Create: `src/analysis/quality.ts`
- Create: `src/analysis/toolDetection.ts`
- Create: `src/analysis/normalize.ts`
- Create: `tests/fixtures/minimal-conversations.json`
- Create: `tests/fixtures/mixed-validity-conversations.json`
- Create: `tests/fixtures/unknown-model-tool.json`
- Create: `tests/unit/normalize.test.ts`
- Create: `tests/unit/toolDetection.test.ts`
- Create: `tests/unit/quality.test.ts`

**Interfaces:**
- Consumes: `resolveModel()` from Task 2 and domain types from Task 1.
- Produces: `normalizeConversation(raw: unknown, quality: QualityCollector): NormalizedConversation | null`.
- Produces: `detectToolEvents(metadata: unknown): NormalizedToolEvent[]`.
- Produces: `QualityCollector` with `fatal`, `recoverable`, `warning`, `unknownSchema`, and coverage counters.

- [ ] **Step 1: Write fixtures that cover a valid tree, malformed node, unknown model, and unknown tool**

Keep fixture text synthetic, for example `"Synthetic message A"`; never paste a real export conversation.

- [ ] **Step 2: Write failing normalization tests**

Pin these behaviors:

```ts
it('keeps valid conversations when a neighboring conversation is malformed', () => {
  const quality = new QualityCollector();
  const results = loadMixedFixture().map(item => normalizeConversation(item, quality));
  expect(results.filter(Boolean)).toHaveLength(2);
  expect(quality.snapshot().recoverable).toBeGreaterThan(0);
});

it('preserves unknown model and tool raw values', () => {
  const quality = new QualityCollector();
  const conversation = normalizeConversation(loadUnknownFixture(), quality)!;
  expect(conversation.messages[0].rawModelSlug).toBe('future-model-x');
  expect(conversation.messages[0].canonicalModelId).toBeUndefined();
  expect(conversation.messages[0].toolEvents).toContainEqual({ kind: 'unknown', rawType: 'future_tool' });
});
```

- [ ] **Step 3: Verify tests fail**

Run: `npm test -- tests/unit/normalize.test.ts tests/unit/toolDetection.test.ts tests/unit/quality.test.ts`

Expected: FAIL because normalizer/quality/tool detector do not exist.

- [ ] **Step 4: Implement a schema-tolerant normalizer**

The normalizer must use type guards instead of unchecked casts. Traverse the export mapping/tree, preserve branch relationships through message IDs/parent IDs, concatenate only textual content parts into `text`, count attachment references, and record unrecognized metadata keys.

Do not throw for one malformed message. Add a recoverable issue and continue the conversation when possible; return `null` only when a conversation lacks a stable ID or a traversable message mapping.

- [ ] **Step 5: Implement conservative tool detection**

Use explicit raw-type/metadata-key rules for known categories. Return `{ kind: 'unknown', rawType }` for any unrecognized nonempty tool identifier.

- [ ] **Step 6: Implement coverage metrics**

`QualityCollector.snapshot()` returns counts plus ratios computed from actual attempted/identified values, including tokenization and model-identification denominators.

- [ ] **Step 7: Run tests and commit**

```bash
npm test -- tests/unit/normalize.test.ts tests/unit/toolDetection.test.ts tests/unit/quality.test.ts
npm run typecheck
git add src/analysis tests/fixtures tests/unit
git commit -m "feat: normalize export conversations"
```

---

### Task 4: Tokenizer registry and deterministic analytics aggregation

**Files:**
- Create: `src/analysis/tokenizers.ts`
- Create: `src/analysis/aggregate.ts`
- Create: `tests/unit/tokenizers.test.ts`
- Create: `tests/unit/aggregate.test.ts`

**Interfaces:**
- Consumes: normalized conversations, canonical/raw model information, pricing engine.
- Produces: `countVisibleTokens(message): Promise<TokenCountResult>`.
- Produces: `createAggregator()` with `acceptConversation()` and `finish()`.

- [ ] **Step 1: Write failing tokenizer tests using deterministic local text**

Use `js-tiktoken/lite` only with locally bundled rank modules. The test must confirm no network is needed and fallback confidence is recorded:

```ts
it('marks an unknown-model tokenizer mapping as fallback', async () => {
  const result = await countTextTokens('hello world', { encoding: 'o200k_base', confidence: 'fallback' });
  expect(result.count).toBeGreaterThan(0);
  expect(result.confidence).toBe('fallback');
});
```

- [ ] **Step 2: Write failing aggregation tests**

Test input/output role splitting, model grouping, peak-day calculation, hourly/day/week/month buckets, median message length, and an empty export.

- [ ] **Step 3: Verify tests fail**

Run: `npm test -- tests/unit/tokenizers.test.ts tests/unit/aggregate.test.ts`

- [ ] **Step 4: Implement lazy local tokenizer loading**

Use dynamic imports such as:

```ts
const rankLoaders = {
  o200k_base: () => import('js-tiktoken/ranks/o200k_base'),
  cl100k_base: () => import('js-tiktoken/ranks/cl100k_base')
} as const;
```

Construct `Tiktoken` from `js-tiktoken/lite` after the rank module resolves. Cache one encoder per encoding inside the analysis worker. No CDN fallback is permitted.

- [ ] **Step 5: Implement streaming-friendly aggregation**

The aggregator updates bounded counters/buckets per accepted conversation rather than retaining all message bodies. Conversation-level metrics retain only IDs, titles, model IDs, timestamps, counts, flags, and token totals.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- tests/unit/tokenizers.test.ts tests/unit/aggregate.test.ts
npm run typecheck
git add src/analysis/tokenizers.ts src/analysis/aggregate.ts tests/unit/tokenizers.test.ts tests/unit/aggregate.test.ts
git commit -m "feat: tokenize and aggregate chat usage"
```

---

### Task 5: Incremental JSON-array parser and ZIP safety inspection

**Files:**
- Create: `src/import/jsonArrayStream.ts`
- Create: `src/import/zipInspector.ts`
- Create: `src/import/conversationStream.ts`
- Create: `tests/unit/jsonArrayStream.test.ts`
- Create: `tests/unit/zipInspector.test.ts`
- Create: `tests/integration/conversationStream.test.ts`
- Create: `tests/helpers/makeZip.ts`

**Interfaces:**
- Produces: `splitTopLevelJsonArray(stream: ReadableStream<Uint8Array>): AsyncGenerator<string>`.
- Produces: `inspectExportZip(file: Blob): Promise<ZipInspection>`.
- Produces: `streamConversationObjects(file: Blob, signal: AbortSignal): AsyncGenerator<unknown>`.

- [ ] **Step 1: Write adversarial parser tests**

Use chunk boundaries in the middle of UTF-8 code points, escaped quotes, nested arrays/objects, and braces inside strings:

```ts
const input = JSON.stringify([
  { text: '} ] " 日本語' },
  { nested: { v: [1, 2, 3] } }
]);
const values = await collect(splitTopLevelJsonArray(chunkUtf8(input, [1, 2, 5, 3])));
expect(values.map(JSON.parse)).toEqual(JSON.parse(input));
```

Also test whitespace, empty array, abort, truncated object, and trailing garbage.

- [ ] **Step 2: Verify parser tests fail**

Run: `npm test -- tests/unit/jsonArrayStream.test.ts`

- [ ] **Step 3: Implement the top-level array state machine**

Track `started`, `finished`, `depth`, `inString`, `escaped`, and a per-object text buffer after UTF-8 decoding with `TextDecoder.decode(chunk, { stream: true })`. Emit one complete top-level value string when depth returns to zero. Reject non-array roots and structurally incomplete streams.

- [ ] **Step 4: Write ZIP inspection/safety tests**

Synthetic ZIP tests cover missing `conversations.json`, duplicate candidate entries, path traversal names such as `../conversations.json`, suspicious compression ratio, declared entry size above policy, and a valid normal export.

Define a concrete default policy in `zipInspector.ts`:

```ts
export const DEFAULT_ZIP_SAFETY = {
  maxEntries: 50_000,
  maxConversationBytes: 8 * 1024 * 1024 * 1024,
  maxCompressionRatio: 500
} as const;
```

A suspicious ratio is surfaced as a blocking safety result for automatic processing; the settings UI can later allow the user to raise the local policy explicitly.

- [ ] **Step 5: Implement streaming decompression with zip.js**

Open the archive with `ZipReader(new BlobReader(file))`, select exactly the validated `conversations.json` entry, create a `TransformStream<Uint8Array, Uint8Array>`, start `entry.getData(transform.writable)` concurrently, consume `transform.readable` through `splitTopLevelJsonArray`, and `JSON.parse` each emitted conversation string individually. Always close the ZipReader in `finally` and honor `AbortSignal`.

- [ ] **Step 6: Run parser/ZIP integration tests and commit**

```bash
npm test -- tests/unit/jsonArrayStream.test.ts tests/unit/zipInspector.test.ts tests/integration/conversationStream.test.ts
npm run typecheck
git add src/import tests/unit tests/integration tests/helpers
git commit -m "feat: stream conversations from export zip"
```

---

### Task 6: IndexedDB schema, analysis repositories, fingerprinting, and checkpoints

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/repositories.ts`
- Create: `src/analysis/fingerprint.ts`
- Create: `tests/unit/fingerprint.test.ts`
- Create: `tests/integration/storage.test.ts`

**Interfaces:**
- Produces: `openProfilerDb()`.
- Produces: `analysisRepository` methods `create`, `get`, `list`, `delete`.
- Produces: `metricsRepository` batch methods.
- Produces: `checkpointRepository` methods `save`, `load`, `clear`.
- Produces: `fingerprintImport(file, inspection): Promise<ImportFingerprint>`.

- [ ] **Step 1: Write failing fingerprint tests**

Same file bytes/metadata produce the same fingerprint; changed `conversations.json` content or relevant entry metadata changes it. The content hash samples or streams stable relevant bytes rather than loading an 8 GiB entry in memory.

- [ ] **Step 2: Write failing fake-IndexedDB integration tests**

Use `fake-indexeddb` under Vitest. Verify analysis metadata roundtrip, batched conversation metrics roundtrip, checkpoint save/load, deleting one analysis removes only its keyed records, and no raw message body property exists in persisted conversation metrics.

- [ ] **Step 3: Define the database schema**

Use `idb` with explicit database version `1` and stores from the spec. Key analysis-owned records by `[analysisId, localKey]` or indexes that allow efficient analysis deletion/query.

- [ ] **Step 4: Implement transactional batch APIs**

A batch write either commits a bounded batch or rolls it back. Expose no general-purpose `put(any)` API to UI code; workers/repositories own persistence semantics.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- tests/unit/fingerprint.test.ts tests/integration/storage.test.ts
npm run typecheck
git add src/storage src/analysis/fingerprint.ts tests/unit/fingerprint.test.ts tests/integration/storage.test.ts
git commit -m "feat: persist local analysis state"
```

---

### Task 7: Worker protocol, bounded pipeline, cancellation, and checkpoint recovery

**Files:**
- Create: `src/import/pipelineProtocol.ts`
- Create: `src/workers/import.worker.ts`
- Create: `src/workers/analysis.worker.ts`
- Create: `src/features/import/importController.ts`
- Create: `tests/integration/pipeline.test.ts`
- Create: `tests/integration/recovery.test.ts`

**Interfaces:**
- Produces typed worker messages `START_IMPORT`, `BATCH`, `BATCH_ACK`, `PROGRESS`, `WARNING`, `COMPLETE`, `CANCEL`, `FAIL`.
- Produces: `ImportController.start(file, options)`, `.cancel()`, `.resume(file, checkpoint)`.

- [ ] **Step 1: Write failing protocol/backpressure tests**

Test that the import producer never has more than `maxInFlightBatches` awaiting ACK. For `safe`, use 1; `standard`, 2; `fast`, 4. Results must be identical across profiles.

- [ ] **Step 2: Write failing recovery tests**

Pin the Review Focus mismatch case:

```ts
it('refuses a checkpoint when the reselected file fingerprint differs', async () => {
  await expect(controller.resume(differentFile, savedCheckpoint)).rejects.toMatchObject({
    code: 'FINGERPRINT_MISMATCH'
  });
});
```

Also test cancellation leaves a resumable checkpoint at the last committed batch.

- [ ] **Step 3: Implement typed protocol and import worker**

The import worker streams conversations, normalizes them, and posts bounded batches containing normalized records without retaining prior batches. It posts progress only when it has meaningful counts; do not invent a precise percentage before a reliable denominator exists.

- [ ] **Step 4: Implement analysis worker**

The analysis worker tokenizes, aggregates, writes metric batches to IndexedDB, updates data quality, then ACKs each batch. It stores checkpoints only after the corresponding data transaction commits.

- [ ] **Step 5: Implement controller cancellation and failure states**

Use `AbortController`, terminate workers after cooperative cancellation or fatal failure, and preserve the latest durable checkpoint. Fatal pipeline errors carry stable `code`, `stage`, and user-safe message keys.

- [ ] **Step 6: Run integration tests and commit**

```bash
npm test -- tests/integration/pipeline.test.ts tests/integration/recovery.test.ts
npm run typecheck
git add src/import/pipelineProtocol.ts src/workers src/features/import/importController.ts tests/integration
git commit -m "feat: orchestrate bounded analysis workers"
```

---

### Task 8: Import, progress, duplicate-analysis, and recovery UI

**Files:**
- Create: `src/features/import/ImportPage.tsx`
- Create: `src/features/import/ImportProgress.tsx`
- Create: `src/features/import/RecoveryPrompt.tsx`
- Create: `src/features/import/useImportSession.ts`
- Create: `tests/unit/importPage.test.tsx`
- Create: `tests/e2e/import-flow.spec.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `ImportController`, repository APIs.
- Produces: active `analysisId` navigation target for all analytics pages.

- [ ] **Step 1: Write failing component tests**

Verify idle file picker, local-only/no-API-key privacy copy, safety rejection, processing stage/count/elapsed/warnings, cancel action, existing-analysis choice (`open existing` / `reanalyze`), and recovery requiring file re-selection.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/importPage.test.tsx`

- [ ] **Step 3: Implement accessible file selection without File System Access API**

Use `<input type="file" accept=".zip,application/zip">`; drag/drop is a desktop enhancement but calls the same import path.

- [ ] **Step 4: Implement import-session state machine**

Use explicit states: `idle`, `inspecting`, `duplicate`, `running`, `cancelled`, `recoverable`, `failed`, `complete`. State transitions come from controller events, not arbitrary component booleans.

- [ ] **Step 5: Add E2E happy-path import**

Create a tiny synthetic ZIP fixture in the test setup, select it through Playwright, wait for completion, and assert navigation reaches Overview with expected synthetic totals.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- tests/unit/importPage.test.tsx
npm run e2e -- tests/e2e/import-flow.spec.ts
git add src/features/import src/app/App.tsx tests/unit/importPage.test.tsx tests/e2e/import-flow.spec.ts
git commit -m "feat: add export import workflow"
```

---

### Task 9: Analytics read model and Overview, Models, Timeline, Conversations pages

**Files:**
- Create: `src/storage/analyticsQueries.ts`
- Create: `src/features/overview/OverviewPage.tsx`
- Create: `src/features/models/ModelsPage.tsx`
- Create: `src/features/timeline/TimelinePage.tsx`
- Create: `src/features/conversations/ConversationsPage.tsx`
- Create: `src/features/conversations/ConversationDetails.tsx`
- Create: `src/features/conversations/ConversationTable.tsx`
- Create: `src/components/MetricBadge.tsx`
- Create: `src/components/DateRangeFilter.tsx`
- Create: `tests/unit/analyticsQueries.test.ts`
- Create: `tests/unit/metricBadge.test.tsx`
- Create: `tests/e2e/analytics-pages.spec.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/navigation.ts`

**Interfaces:**
- Produces query functions returning bounded view models rather than message bodies.
- Consumes `MetricProvenance` and displays it on every estimate/calculation card.

- [ ] **Step 1: Write failing analytics-query tests**

Verify date-range filtering, model filtering, sort order, peak-day result, pagination/windowing inputs, and all-time behavior on an empty analysis.

- [ ] **Step 2: Write failing provenance badge test**

```ts
render(<MetricBadge label="Estimated processing" value="12–18M" provenance="estimated" />);
expect(screen.getByText('estimated')).toBeVisible();
```

The badge exposes provenance text, not color alone.

- [ ] **Step 3: Implement repository read models**

Return only data needed by each page. Conversation table queries support sort/filter without loading message text and expose total row count for virtualization.

- [ ] **Step 4: Implement Overview and Models pages**

Overview includes totals, peak day, top model, largest conversation, and range selector. Models shows token/message/conversation/cost/first/last/raw-alias columns.

- [ ] **Step 5: Implement Timeline page**

Provide hour/day/week/month/year buckets and metric selector. Use bounded/preaggregated points. Implement the weekday/hour heatmap from aggregated data, not raw messages.

- [ ] **Step 6: Implement the virtualized Conversations table**

Use `@tanstack/react-virtual`; render only visible rows. Filters cover model/date/token range/web/files/tools. Details show derived metrics by default; raw text is unavailable unless it is still in the currently loaded source session and the user explicitly asks to reveal it.

- [ ] **Step 7: Run unit and E2E tests, then commit**

```bash
npm test -- tests/unit/analyticsQueries.test.ts tests/unit/metricBadge.test.tsx
npm run e2e -- tests/e2e/analytics-pages.spec.ts
git add src/storage/analyticsQueries.ts src/features/overview src/features/models src/features/timeline src/features/conversations src/components src/app tests
git commit -m "feat: add core analytics dashboards"
```

---

### Task 10: Cost, Tools/Web, Data Quality, Comparison, and Settings pages

**Files:**
- Create: `src/features/cost/CostPage.tsx`
- Create: `src/features/cost/CostScenarioEditor.tsx`
- Create: `src/features/tools/ToolsPage.tsx`
- Create: `src/features/data-quality/DataQualityPage.tsx`
- Create: `src/features/comparison/ComparisonPage.tsx`
- Create: `src/features/settings/SettingsPage.tsx`
- Create: `src/features/settings/PricingEditor.tsx`
- Create: `src/features/settings/StoragePanel.tsx`
- Create: `src/features/settings/PerformanceProfile.tsx`
- Create: `tests/unit/costPage.test.tsx`
- Create: `tests/unit/pricingEditor.test.tsx`
- Create: `tests/e2e/secondary-pages.spec.ts`
- Modify: `src/app/navigation.ts`

**Interfaces:**
- Consumes pure pricing/scenario functions from Task 2 and stored quality/tool data.
- Produces persisted user pricing overrides and estimation profiles separate from built-in data.

- [ ] **Step 1: Write failing UI tests for calculated vs estimated cost**

Verify visible-token cost renders as calculated, scenario values as estimated, unsupported historical price coverage as an explicit gap, and invalid ratios are rejected before calculation.

- [ ] **Step 2: Implement Cost page and scenario editor**

Expose model substitution, cache ratio, hidden input overhead, and reasoning output overhead. Store assumptions with every displayed scenario result and provide built-in presets without claiming they describe actual ChatGPT internals.

- [ ] **Step 3: Implement Tools/Web and Data Quality pages**

Tools includes unknown raw types. Data Quality lists severity, counts, coverage percentages, unknown models, and unknown schema keys with enough raw identifier text for future debugging but no full conversation body.

- [ ] **Step 4: Implement Comparison page**

Provide manual Work/Codex summary entry with provenance fixed to `reported` in a comparison-specific type. Show Chat calculated/estimated values alongside it, with a visible note that measurement semantics differ.

- [ ] **Step 5: Implement Settings**

Include locale, Safe/Standard/Fast/Auto performance profile, ZIP safety policy override, local pricing editor/history, model aliases, and storage usage/deletion controls. User pricing overrides are stored in their own IndexedDB records and never mutate the built-in module.

- [ ] **Step 6: Test and commit**

```bash
npm test -- tests/unit/costPage.test.tsx tests/unit/pricingEditor.test.tsx
npm run e2e -- tests/e2e/secondary-pages.spec.ts
git add src/features/cost src/features/tools src/features/data-quality src/features/comparison src/features/settings src/app/navigation.ts tests
git commit -m "feat: add cost quality tools and settings views"
```

---

### Task 11: Safe analytics export to JSON, CSV, and Markdown

**Files:**
- Create: `src/features/export-results/exportJson.ts`
- Create: `src/features/export-results/exportCsv.ts`
- Create: `src/features/export-results/exportMarkdown.ts`
- Create: `src/features/export-results/ExportResultsButton.tsx`
- Create: `tests/unit/exportResults.test.ts`
- Modify: `src/features/overview/OverviewPage.tsx`

**Interfaces:**
- Consumes analytics read models only.
- Produces downloadable `Blob` objects that exclude conversation bodies by construction.

- [ ] **Step 1: Write failing privacy-focused export tests**

Create an analytics fixture containing a synthetic title and a separate raw body sentinel string. Assert JSON/CSV/Markdown contain allowed metrics/title but never contain the raw-body sentinel.

- [ ] **Step 2: Implement a dedicated export DTO**

Define an `AnalyticsExport` type that has no `messageText`, `rawBody`, or raw export object fields. JSON export serializes only this DTO.

- [ ] **Step 3: Implement CSV and Markdown serializers**

Escape CSV formula injection by prefixing cells beginning with `=`, `+`, `-`, or `@` with a single quote. Escape Markdown table separators/newlines. Include provenance and pricing/scenario assumptions in the Markdown summary.

- [ ] **Step 4: Add the export action and test**

Run: `npm test -- tests/unit/exportResults.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/features/export-results src/features/overview/OverviewPage.tsx tests/unit/exportResults.test.ts
git commit -m "feat: export privacy-safe analytics reports"
```

---

### Task 12: PWA, offline distribution, CSP, and explicit network isolation

**Files:**
- Create: `src/pwa/service-worker.ts`
- Create: `public/manifest.webmanifest`
- Create: `scripts/make-offline-package.mjs`
- Create: `scripts/serve-offline.mjs`
- Create: `public/_headers.example`
- Create: `tests/e2e/offline.spec.ts`
- Create: `tests/e2e/network-isolation.spec.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `dist/` Pages/PWA build and `artifacts/ChatGPT-Export-Profiler-<version>-offline.zip`.

- [ ] **Step 1: Write a failing network-isolation E2E test**

Install a Playwright request listener during import and fail if an analysis interaction requests any origin other than the app origin. Also inject page shims for `navigator.sendBeacon` and `WebSocket` that throw if called, then complete a synthetic import.

- [ ] **Step 2: Configure the PWA for local app-shell assets only**

Use `vite-plugin-pwa` in `injectManifest` mode. Service worker precaches built assets and uses navigation/app-asset strategies only. It does not register routes for imported files, blobs, IndexedDB, export results, or external origins.

- [ ] **Step 3: Add restrictive CSP guidance and runtime-safe asset loading**

Ensure production code contains no external script/style/font/tokenizer URLs. `public/_headers.example` documents a host-header policy:

```text
Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

GitHub Pages does not provide arbitrary response-header configuration through repository files, so add the compatible `<meta http-equiv="Content-Security-Policy">` policy to `index.html` for Pages while retaining `_headers.example` for static hosts that support response headers.

- [ ] **Step 4: Build the offline package and add exact package scripts**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "make:offline": "node scripts/make-offline-package.mjs",
    "serve:offline": "node scripts/serve-offline.mjs"
  }
}
```

`make-offline-package.mjs` copies `dist/`, `scripts/serve-offline.mjs`, and an offline README into a versioned ZIP. `serve-offline.mjs` is a minimal Node static server bound to `127.0.0.1` only, sends no telemetry, and serves the build without Internet access. The formal iPad offline path remains an installed/cached PWA.

- [ ] **Step 5: Add offline E2E**

Load the app once, disable network, reload from service-worker cache, import the synthetic ZIP, and assert analytics still complete.

- [ ] **Step 6: Run tests/build and commit**

```bash
npm run build
npm run e2e -- tests/e2e/network-isolation.spec.ts tests/e2e/offline.spec.ts
npm run make:offline
git add src/pwa public scripts vite.config.ts package.json package-lock.json tests/e2e
git commit -m "feat: ship local-only pwa and offline build"
```

---

### Task 13: Large-fixture performance, iPad responsiveness, and storage-pressure behavior

**Files:**
- Create: `scripts/generate-large-fixture.mjs`
- Create: `tests/performance/import-performance.spec.ts`
- Create: `tests/e2e/ipad-layout.spec.ts`
- Create: `src/components/StoragePressureNotice.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/features/conversations/ConversationTable.tsx`
- Modify: `src/features/timeline/TimelinePage.tsx`

**Interfaces:**
- Produces deterministic synthetic exports at 1k, 10k, and 50k conversation scales.

- [ ] **Step 1: Create a deterministic large-export generator**

The script accepts `--conversations 1000|10000|50000 --output <path>` and creates synthetic messages with deterministic seeded content/model/tool variation. It never reads local ChatGPT data.

- [ ] **Step 2: Write performance assertions**

Use Playwright tracing/PerformanceObserver to fail when the page produces a main-thread long task above a conservative threshold during steady-state table scrolling and page navigation. Record import elapsed time as an artifact rather than enforcing a fragile absolute hardware-specific duration.

- [ ] **Step 3: Add iPad viewport/touch layout tests**

Test portrait and landscape viewport presets, sidebar collapse, import file picker visibility, virtualized table interaction, filter controls, and absence of horizontal page overflow.

- [ ] **Step 4: Handle quota/storage pressure explicitly**

Catch `QuotaExceededError` from repository batch writes, stop the pipeline at a durable checkpoint, and show `StoragePressureNotice` with actions to delete prior analyses or retry after freeing storage. Do not continue while silently dropping metrics.

- [ ] **Step 5: Run performance/layout tests and commit**

```bash
node scripts/generate-large-fixture.mjs --conversations 1000 --output tests/fixtures/generated-1k.zip
npm run e2e -- tests/e2e/ipad-layout.spec.ts
npx playwright test tests/performance/import-performance.spec.ts
git add scripts tests/performance tests/e2e/ipad-layout.spec.ts src/components/StoragePressureNotice.tsx src/styles/globals.css src/features
git commit -m "perf: harden large export and ipad behavior"
```

Do not commit generated large ZIPs; add generated fixture paths to `.gitignore`.

---

### Task 14: CI, Pages deployment, release packaging, documentation, and final acceptance suite

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.github/workflows/release.yml`
- Create: `.gitignore`
- Create: `README.md`
- Create: `docs/privacy.md`
- Create: `docs/data-accuracy.md`
- Create: `tests/e2e/security-content.spec.ts`
- Create: `tests/e2e/v1-acceptance.spec.ts`

**Interfaces:**
- Produces reproducible CI, GitHub Pages artifact, and release ZIP.

- [ ] **Step 1: Add CI gates**

`ci.yml` runs on pull requests and pushes to `main`:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run e2e
```

Cache only npm/Playwright dependencies, never user/generated analysis data.

- [ ] **Step 2: Add Pages workflow**

Build from the repository, upload only `dist/`, deploy via GitHub Pages Actions, and use relative Vite asset paths so `/ChatGPT-Export-Profiler/` works without source changes.

- [ ] **Step 3: Add tagged release workflow**

On `v*` tags, run the full quality gate, build the PWA, run `npm run make:offline`, then attach the offline ZIP to the GitHub Release.

- [ ] **Step 4: Add hostile-content security E2E**

Import a synthetic conversation whose title/body contains `<script>window.__xss=1</script>`, `javascript:` links, Markdown HTML, and CSV formula prefixes. Assert no script executes, raw HTML is rendered as text where shown, unsafe URL actions are unavailable, and exported CSV is neutralized.

- [ ] **Step 5: Add one v1 acceptance test that walks the full product**

The test imports a synthetic multi-model/tool ZIP, verifies Overview, Timeline, Models, Conversations, Cost, Tools/Web, Data Quality, Comparison, Settings, pricing override persistence, JSON/CSV/Markdown export, analysis reload from IndexedDB, and local-only network behavior.

- [ ] **Step 6: Write user/developer documentation**

`README.md` covers purpose, local-only architecture, PWA/offline usage, browser support, development commands, and the critical distinction between observed/calculated/estimated metrics. `docs/privacy.md` describes what is persisted. `docs/data-accuracy.md` documents the limits of export-derived token/cost reconstruction.

- [ ] **Step 7: Run the full verification matrix**

Run:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
npm run make:offline
git status --short
```

Expected: every command succeeds and `git status --short` contains only intentional generated artifacts ignored by `.gitignore`.

- [ ] **Step 8: Perform real-device release checks before declaring v1 complete**

On iPad Safari and iPad Orion, verify: install/open PWA, select ZIP, complete a medium synthetic import, switch portrait/landscape, inspect all primary pages, background and return during analysis, exercise recovery, use offline mode after prior installation, export a report, and delete an analysis. Record results in a GitHub issue or release checklist; unresolved blockers prevent v1.0.

- [ ] **Step 9: Commit**

```bash
git add .github .gitignore README.md docs tests/e2e/security-content.spec.ts tests/e2e/v1-acceptance.spec.ts
git commit -m "ci: complete v1 delivery pipeline"
```

---

## Execution order and handoff

Implement tasks strictly in numeric order because later tasks rely on interfaces and persisted schemas established earlier. Each task uses TDD as written, commits independently, and is reviewed before proceeding when using the subagent-driven execution mode.

Before implementation begins in the next GPT project conversation:

1. Read `docs/superpowers/specs/2026-09-25-chatgpt-export-profiler-design.md`.
2. Read this plan in full.
3. Inspect the current repository and recent commits rather than assuming no work has started.
4. Use `superpowers:using-git-worktrees` if the execution environment supports an isolated worktree.
5. Use `superpowers:subagent-driven-development` for task-by-task implementation unless the project conversation explicitly selects native execution.
6. Do not revise the privacy boundary, provenance semantics, storage policy, or v1 completion criteria without first updating the design specification.

## Plan self-review results

- Spec coverage: all design sections map to Tasks 1–14; no design requirement is intentionally deferred beyond v1.
- Placeholder scan: the plan contains no unfinished markers or generic substitute instructions in place of implementation steps.
- Type consistency: shared IDs/domain/provenance are introduced in Task 1; model/pricing contracts in Task 2; all later tasks consume those names consistently.
- Review Focus coverage: parser adversarial input is Task 5; malformed-neighbor recovery and unknown model/tool are Task 3; fingerprint mismatch is Task 7; external-network rejection is Tasks 12 and 14.
