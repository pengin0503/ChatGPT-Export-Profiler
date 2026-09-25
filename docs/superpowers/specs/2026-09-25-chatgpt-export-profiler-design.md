# ChatGPT Export Profiler — Design Specification

Date: 2026-09-25
Status: Approved for planning
Repository: `pengin0503/ChatGPT-Export-Profiler`

## 1. Purpose

ChatGPT Export Profiler is a fully local web application for analyzing ChatGPT data-export ZIP files and reconstructing usage analytics for regular Chat usage.

The product is intended to provide analytics similar in spirit to Work/Codex Personal Analytics while remaining explicit about the limits of exported Chat data. It must distinguish values directly present in the export from values calculated from visible content and values that can only be estimated.

The application must not upload conversation data, message content, attachments, statistics, or pricing inputs to an external service.

## 2. Primary goals

The v1 product must:

- Import a ChatGPT data-export ZIP directly in the browser.
- Parse large exports without loading the full archive or full `conversations.json` into memory at once where feasible.
- Normalize export records into a stable internal schema.
- Calculate visible token counts by message, conversation, model, and time period.
- Detect model identifiers, tool metadata, web-search metadata, files, attachments, branches, malformed nodes, and unknown schema elements when present.
- Calculate API-price equivalents using an offline, versioned pricing history.
- Support user-editable pricing entries without overwriting built-in data.
- Provide bounded cost-estimation scenarios for data that is not directly observable, such as hidden context, reasoning overhead, and cache ratios.
- Compare regular Chat analytics with manually entered or later-imported Work/Codex usage summaries.
- Persist normalized analytics locally with IndexedDB.
- Export analysis results as JSON, CSV, and Markdown summaries, excluding raw conversation content by default.
- Operate as a PWA and as a downloadable offline distribution.
- Support Japanese and English.
- Support Chrome, Edge, Firefox, iPad Safari, and iPad Orion as formal targets.

## 3. Non-goals

v1 will not:

- Claim to reconstruct OpenAI's exact server-side token usage for Chat.
- Claim to know hidden system prompts, internal context, hidden reasoning tokens, or cached-input counts unless those are explicitly present in a future export format.
- Upload exports to a backend for processing.
- Require an OpenAI API key.
- Depend on File System Access API for core functionality.
- Treat direct `file://` execution as the primary offline distribution path.
- Persist full conversation text in IndexedDB by default.
- Include telemetry or third-party analytics.

## 4. Data provenance model

Every metric exposed by the application must carry a provenance classification.

### 4.1 Observed

Directly present in the ChatGPT export, for example:

- conversation identifiers
- titles
- message roles
- timestamps
- message content
- model identifiers or slugs when present
- branch structure
- file and attachment metadata
- web-search or tool metadata
- raw metadata keys

### 4.2 Calculated

Derived deterministically from observed export data, for example:

- visible token counts
- message, conversation, model, and time-period aggregates
- averages and medians
- visible-token API-equivalent cost
- tool usage totals
- top conversations and peak periods

### 4.3 Estimated

Requires assumptions not present in the export, for example:

- hidden/system-context overhead
- reasoning overhead
- cache ratios
- estimated total processing volume
- estimated API-equivalent ranges under selected assumptions

UI presentation must never make estimated values visually indistinguishable from observed or calculated values.

## 5. Product architecture

The application will use a modular client-only architecture.

```text
ChatGPT Export ZIP
        |
        v
ZIP Inspector / Import Worker
        |
        v
Streaming / Incremental Parser
        |
        v
Schema Normalizer
        |
        +------> Data Quality Collector
        |
        v
Token + Metadata Analyzer
        |
        v
Aggregator
        |
        +------> Cost Engine
        |
        v
IndexedDB Analytics Store
        |
        v
React Dashboard
```

### 5.1 Technology baseline

- React
- TypeScript
- Vite
- Web Workers
- IndexedDB
- PWA / Service Worker
- Vitest
- Testing Library
- Playwright

Library selection for ZIP streaming, incremental JSON parsing, charts, virtualization, and tokenization should be finalized during implementation only after checking browser compatibility and bundle/memory impact.

### 5.2 Module boundaries

The analysis engine must remain UI-independent so that future CLI or alternative frontends can reuse it.

Suggested repository layout:

```text
src/
  app/
  components/
  features/
    import/
    overview/
    timeline/
    models/
    conversations/
    cost/
    tools/
    comparison/
    data-quality/
    settings/
  analysis/
    schema/
    normalize/
    tokens/
    aggregate/
    pricing/
    quality/
  workers/
  storage/
  data/
  i18n/
  types/
tests/
  fixtures/
  unit/
  integration/
  e2e/
```

## 6. Import and parsing design

### 6.1 ZIP handling

The importer must avoid extracting the entire archive into memory.

Preferred flow:

```text
File / Blob
  -> inspect ZIP directory
  -> identify relevant entries
  -> stream/decompress selected entries
  -> parse conversations incrementally
  -> normalize/analyze in batches
  -> persist metrics/checkpoints
```

A Blob/stream-capable ZIP library such as `@zip.js/zip.js` is a leading candidate. Implementation must not rely on an all-in-memory JSZip-style workflow for large files.

### 6.2 Incremental JSON parsing

For large exports, `conversations.json` must not be passed through one monolithic `JSON.parse()` operation.

The preferred model is to emit one conversation or a bounded batch at a time from an incremental parser. Small exports may use a faster whole-file path if memory thresholds permit. The user-facing workflow remains identical.

### 6.3 Worker topology

Initial design uses two main workers:

1. Import worker
   - ZIP inspection
   - streaming decompression
   - incremental JSON parsing
   - schema validation
   - normalization

2. Analysis worker
   - tokenization
   - aggregation
   - pricing
   - secondary statistics

Worker count must not automatically scale to CPU-core count on iPad. Parallelism is a tunable performance characteristic, not a correctness requirement.

### 6.4 Backpressure

The importer must not enqueue unbounded normalized records. Producer/consumer flow must use bounded queues or batch acknowledgements so that import speed cannot overwhelm tokenization or IndexedDB writes.

## 7. Internal normalized schema

The normalizer maps changing OpenAI export structures into a canonical internal model.

Representative normalized message fields:

```ts
interface NormalizedMessage {
  conversationId: string;
  messageId: string;
  parentId?: string;
  role: string;
  createdAt?: number;
  updatedAt?: number;
  canonicalModelId?: string;
  rawModelSlug?: string;
  contentParts: NormalizedContentPart[];
  toolEvents: NormalizedToolEvent[];
  attachmentRefs: NormalizedAttachmentRef[];
  unknownMetadataKeys: string[];
}
```

Unknown fields should not silently disappear. The normalizer must retain sufficient raw identifiers to support later parser improvements without pretending unsupported fields are understood.

## 8. Model canonicalization

Export model labels may differ across product generations. The analyzer must maintain:

- original/raw model value
- canonical model ID
- alias table
- mapping confidence/status

Users may override aliases locally when an automatic mapping is incorrect.

Unknown models remain visible instead of being grouped into an arbitrary known model.

## 9. Tokenization

### 9.1 Lazy loading

Tokenizer data must load only when needed. The app should first detect which model families are present, then initialize the minimal required encoders.

### 9.2 Confidence

Token results must store mapping confidence, for example:

- exact tokenizer mapping
- family-level mapping
- estimated/fallback mapping

A token count based on a fallback encoder remains a calculated value but must expose the tokenizer approximation in data-quality details.

### 9.3 Scope

Visible-token accounting includes export-visible textual content according to documented rules. Hidden server-side context is not included in calculated token totals and belongs only in estimation scenarios.

## 10. Analytics features

### 10.1 Overview

The overview provides:

- total visible tokens
- estimated processing-token range
- total conversations
- total messages
- visible-token API-equivalent cost
- most-used model
- peak usage day
- largest conversation

Supported time filters:

- 7 days
- 30 days
- 90 days
- 1 year
- all time
- custom range

### 10.2 Timeline

Aggregation levels:

- hour
- day
- week
- month
- year

Selectable metrics:

- tokens
- messages
- conversations
- API-equivalent cost
- web searches
- tool usage

The UI may show model-stacked views and weekday/time-of-day heatmaps.

### 10.3 Models

Per canonical model:

- visible tokens
- user input tokens
- assistant output tokens
- message count
- conversation count
- share of total usage
- API-equivalent cost
- first-seen date
- last-seen date
- raw aliases observed

### 10.4 Conversations

Virtualized table columns should include:

- title
- date/range
- model(s)
- message count
- token count
- API-equivalent cost
- web/tool/file indicators

Sortable by:

- total tokens
- input tokens
- output tokens
- cost
- message count
- duration
- newest
- oldest

Filters include model, date, token range, web search, files, and tool usage.

Full raw conversation text is not shown by default. A details view may reveal export text only on explicit user action.

### 10.5 Cost

Cost analysis includes at least:

1. Visible-token cost
2. Estimated-processing cost
3. Cached-workload estimate

Cost simulation must allow model substitution and user-selected assumptions such as cache percentage, hidden-input overhead, and reasoning overhead.

### 10.6 Tools / Web

When detectable from export metadata, classify and aggregate:

- web search
- files and attachments
- image-related events
- Python/data-analysis events
- connector/plugin events
- unknown tool events

Unknown tool types are preserved and reported rather than dropped.

### 10.7 Data Quality

The Data Quality page communicates the reliability and coverage of the analysis.

Example metrics:

- conversations processed
- conversations fully parsed
- partial metadata records
- unknown models
- invalid dates
- unknown message formats
- tokenization coverage
- model-identification coverage

Quality issues are classified as:

- fatal
- recoverable
- warning
- unknown schema

A malformed individual conversation should not abort the entire import unless continuing would produce globally unreliable results.

### 10.8 Comparison

Regular Chat analytics may be compared with Work/Codex summary values that are manually entered or later imported from a supported format.

Comparison must retain provenance, for example:

- Chat: calculated/estimated
- Work: reported

The UI must not imply that the two measurement systems have identical semantics.

## 11. Pricing engine

### 11.1 Built-in pricing history

Pricing records are versioned data, not hard-coded UI logic.

Representative record:

```json
{
  "model": "gpt-5.6-sol",
  "effectiveFrom": "2026-09-01",
  "effectiveTo": null,
  "currency": "USD",
  "inputPerMillion": 4,
  "cachedInputPerMillion": 0.4,
  "outputPerMillion": 20,
  "source": "OpenAI pricing page",
  "datasetVersion": 1
}
```

### 11.2 User overrides

Users can:

- add models
- add aliases
- add effective-date pricing periods
- edit prices
- create custom pricing profiles
- restore built-in defaults

User data is stored separately from built-in pricing so app updates do not overwrite local customizations.

### 11.3 Estimation profiles

Built-in scenario profiles may include conservative, standard, high-cache, and no-cache configurations, but their labels must not imply factual knowledge of actual ChatGPT server behavior.

Users can create their own profiles.

## 12. IndexedDB storage

Suggested logical stores:

- `analyses`
- `conversations`
- `conversationMetrics`
- `modelMetrics`
- `timelineMetrics`
- `toolMetrics`
- `costProfiles`
- `pricingHistory`
- `dataQuality`
- `settings`
- `checkpoints`

Full conversation bodies are not persisted by default.

### 12.1 Version separation

Persist separately:

- app version
- internal schema version
- analyzer version
- tokenizer version
- pricing dataset version

This enables selective reprocessing. A UI-only update should not force a full reimport. A tokenizer update should ideally trigger only token-dependent recomputation.

## 13. Import identity and caching

Each analysis stores an import fingerprint derived from stable available properties such as:

- file size
- lastModified
- relevant ZIP entry metadata
- content fingerprint/hash
- export schema signature

If the same export is selected again, the app may offer:

- open existing result
- reanalyze

## 14. Checkpointing and recovery

Pipeline stages:

1. ZIP inspection
2. export detection
3. conversation parsing
4. normalization
5. tokenization
6. aggregation
7. cost calculation
8. index creation
9. complete

Checkpoint progress periodically.

If a browser crash, background eviction, or memory-pressure termination occurs:

- resume directly if the remaining stages no longer require the original ZIP
- otherwise prompt the user to reselect the source ZIP
- verify the fingerprint before continuing

The product must not promise automatic source-file persistence on iPad where the browser cannot guarantee it.

## 15. Performance profiles

Provide:

- Safe: small batches, low parallelism, iPad-oriented
- Standard: balanced default
- Fast: larger batches / more parallelism for desktop
- Auto: default mode choosing conservative settings based on runtime capabilities

These profiles may affect speed and memory use only, never analytical results.

## 16. UI and responsive behavior

Primary navigation:

```text
Overview
Timeline
Models
Conversations
Cost
Tools / Web
Comparison
Data Quality
Settings
```

Desktop uses a persistent/collapsible side navigation.

iPad layout adapts to portrait and landscape, preserving all functionality. Wide tables use virtualization and responsive detail views instead of forcing unusable dense desktop layouts.

### 16.1 Import screen

The import screen must clearly state:

- analysis is local
- data is not uploaded
- no API key is required

### 16.2 Progress UI

Show:

- current stage
- processed/total counts when known
- progress percentage when meaningful
- elapsed time
- warning count
- cancellation state

Do not display fake exact progress if total work is unknown.

### 16.3 Internationalization

v1 officially supports:

- Japanese
- English

UI strings must live outside component logic. Browser language provides the initial default; users can override it.

## 17. Data visualization

Use chart types according to the metric:

- line charts
- stacked bars
- limited donut/pie usage
- heatmaps
- distributions
- rankings

Large timelines must downsample or use preaggregated buckets rather than rendering every raw point.

Charts must have text/table alternatives for key statistics and accessibility.

## 18. Security and privacy

### 18.1 No export-data network path

The analysis engine does not call external APIs.

The PWA may use the network only to obtain/update application assets. It does not send export contents or analytics.

### 18.2 Service worker scope

Cache only application assets such as:

- HTML
- JavaScript
- CSS
- tokenizer resources
- built-in pricing data

Do not cache imported conversation data through the service worker.

### 18.3 CSP and dependencies

Production builds should use a restrictive Content Security Policy where deployment permits.

Do not include:

- third-party analytics
- tracking beacons
- externally hosted runtime scripts
- third-party CDNs required for operation

### 18.4 XSS handling

Treat exported content as untrusted input.

- rely on React text escaping
- avoid `dangerouslySetInnerHTML`
- disable raw HTML in any Markdown rendering
- validate URL schemes

### 18.5 ZIP safety

Protect against:

- ZIP bombs / extreme compression ratios
- unreasonable entry sizes
- path traversal
- malformed entries

Do not automatically execute or broadly extract ZIP attachments.

## 19. Distribution

### 19.1 PWA / GitHub Pages

Primary path:

`https://pengin0503.github.io/ChatGPT-Export-Profiler/`

Expected features:

- installable PWA
- standalone display
- app-shell offline cache
- update notification
- manifest
- service worker

### 19.2 Offline downloadable package

GitHub Releases provides a package such as:

`ChatGPT-Export-Profiler-v1.0.0-offline.zip`

Primary offline execution uses a local HTTP server on desktop so Workers, modules, and service-worker-compatible behavior are not constrained by `file://` security restrictions.

iPad uses the installed/cached PWA path as the formal offline mechanism.

## 20. Exporting profiler results

Support:

- JSON
- CSV
- Markdown summary

Default exports contain normalized analytics and omit full conversation text.

Any future option that exports raw text must be explicit and clearly marked as sensitive.

## 21. Testing strategy

### 21.1 Unit tests

Cover:

- schema normalization
- model canonicalization
- tokenizer mapping
- aggregation
- pricing engine
- date bucketing
- tool detection
- data-quality scoring
- import fingerprint logic

### 21.2 Fixture tests

Synthetic/anonymized fixtures:

- minimal export
- multi-model export
- branched conversation
- missing model
- tool calls
- web search
- malformed node
- large generated export
- unknown schema

No real user conversation content is committed to the repository.

### 21.3 Regression tests

When OpenAI export-format changes are discovered, add sanitized fixtures that reproduce the structure.

### 21.4 Browser E2E

Playwright coverage:

- Chromium
- Firefox
- WebKit

Real-device checks before release:

- iPad Safari
- iPad Orion

### 21.5 Performance tests

Generate synthetic datasets at multiple scales such as:

- 1,000 conversations
- 10,000 conversations
- 50,000 conversations

Measure:

- import duration
- UI responsiveness
- available memory indicators where possible
- IndexedDB size
- rendering performance

Long main-thread blocking is treated as a regression.

## 22. CI/CD

GitHub Actions should run:

- typecheck
- lint
- unit tests
- build
- E2E smoke tests

Release workflows should generate:

- PWA build
- offline build/archive

GitHub Pages deployment should be reproducible from repository state.

## 23. v1.0 completion criteria

v1.0 is complete only when all of the following are met:

1. Import ChatGPT export ZIP directly.
2. Normalize conversations.
3. Calculate visible token counts.
4. Produce model analytics.
5. Produce timeline analytics.
6. Rank and inspect conversations.
7. Calculate API-price equivalents.
8. Edit historical pricing data locally.
9. Aggregate detectable web/tool metadata.
10. Display Data Quality metrics.
11. Export JSON, CSV, and Markdown summaries.
12. Persist analysis results in IndexedDB.
13. Reuse existing analysis for a matching import.
14. Avoid prolonged UI blocking during large imports under supported browsers.
15. Operate as a PWA.
16. Operate through the downloadable offline distribution.
17. Provide Japanese and English UI.
18. Send no conversation/export content externally.
19. Pass automated test suites.
20. Pass basic desktop-browser and iPad Safari/Orion compatibility checks.

## 24. Implementation handoff rule

The design and implementation plan are the source of truth for future project chats.

Implementation should begin in a subsequent project conversation by reading this specification and the implementation plan from GitHub. If implementation discovers a requirement that materially changes architecture, data semantics, privacy guarantees, or v1 scope, update the design document before proceeding with that architectural change.
