# Data accuracy and interpretation

ChatGPT Export Profiler reconstructs analytics from data visible in a ChatGPT export. It does not have access to OpenAI's internal request logs, billing ledger, hidden prompts, hidden reasoning, cache accounting, or model-side telemetry. Results must be interpreted according to provenance.

## Provenance classes

### Observed

Observed values come directly from records present in the export or from direct counts of those records. Examples include the number of imported conversation records and metadata values explicitly present in an exported object.

Observed does not mean that the export is a complete representation of every server-side event. It means the profiler did not need to invent the displayed value beyond reading/counting export-visible records.

### Calculated

Calculated values are deterministic transformations of export-visible data. Examples include:

- locally tokenized visible text;
- message/conversation totals grouped by model;
- timeline buckets derived from export timestamps;
- peak/largest-conversation metrics;
- tool/web classifications derived from known metadata patterns;
- API-equivalent cost calculated from export-visible input/output tokens and the selected local pricing history.

A calculated value can be internally reproducible while still differing from an internal service metric whose input set or tokenizer semantics are different.

### Estimated

Estimated values require assumptions that the export cannot establish. Cost scenarios and the illustrative processing-token range are examples. Estimated output should not be presented as an invoice, billing record, or exact reconstruction of hidden token usage.

## Export container compatibility

The logical conversation payload may be represented either by a single `conversations.json` entry or by numbered `conversations-<n>.json` shards. The importer treats validated shards as one logical conversation stream and applies conversation-size safety limits to their combined uncompressed size.

For sharded exports, the importer rejects duplicate shard indices and gaps in the observed numeric shard sequence. For the currently observed manifestless numbered format, shard zero must also be present. If a recognized `export_manifest.json` declares the logical conversations shard set, the declared count and ordered shard filenames are treated as the authority and must match the physical conversation shards; this allows a future manifest to declare a different numbering convention without guessing it from filenames alone. Future/unrecognized manifest structures are not assigned guessed semantics.

The profiler does not require conversation shards to be rewritten or uploaded elsewhere. ZIP inspection, decompression, manifest consistency checks, parsing, and analysis remain local to the application.

Each individual conversation JSON value is limited to 32 MiB of UTF-8 source data before it is parsed. This limit is separate from the archive-wide logical payload limit and applies under every performance profile. Oversized values stop the import with a size-limit message rather than attempting to materialize an unbounded object. The parser flattens small text chunks while buffering a value to avoid retaining a string node for every character.

## Token counts

Token counts are reconstructed locally from text available in the export and the profiler's local tokenizer/model mapping. Important limitations include:

- exported text may omit hidden system/developer instructions, tool serialization, reasoning tokens, or other server-side context;
- recognized reasoning containers are not treated as visible message body text and are excluded from visible-token calculations;
- the exact production tokenizer or tokenizer revision may differ from the local mapping;
- cache reads/writes and other provider-side accounting dimensions cannot be inferred reliably from ordinary visible text;
- unknown model IDs may use fallback tokenization with lower confidence;
- attachments or non-text content may not have a directly reconstructable token equivalent.

Data Quality distinguishes tokenizer confidence as `exact`, `family`, and `fallback`. Only exact/family mappings count toward tokenizer-identification coverage; fallback token counts remain calculated visible-token values but are reported separately instead of being presented as confidently identified tokenization.

For these reasons, a locally calculated visible-token count can be useful for relative analysis while differing materially from API usage/billing tokens.

## Model identity

Model identity is reconstructed from export metadata when available. The profiler preserves raw aliases and can apply local user-defined alias mappings. Unknown or future model identifiers are retained rather than silently rewritten to a known model.

An alias mapping changes local categorization; it does not prove which exact backend model/version served a historical request.

## Tool and web signals

Tool/Web views classify export metadata into known categories and preserve unknown raw types where possible. They indicate signals found in the export, not a complete execution trace or a billing-grade tool-call ledger.

Analysis schema v3 also retains export-visible web-search and tool-event counts in time buckets so Timeline can display those metrics without re-reading source conversations.

A message can therefore have an observed/export-visible tool signal while details of internal execution remain unavailable.

## Conversation structure and malformed data

Exports can contain branches, missing parents, malformed nodes, unknown content types, missing timestamps, and future schema fields. The parser/normalizer is designed to recover usable neighboring records where safe and to report data-quality issues instead of treating every anomaly as fatal.

Consequences:

- malformed records can be skipped or partially represented;
- totals can be lower than the raw number of malformed objects in the ZIP;
- unknown schema keys are surfaced in Data Quality so schema drift is visible;
- structural unknowns are recorded as generalized field paths and value types, not as the source values themselves;
- known image-part structural metadata such as dimensions, MIME type, byte size, metadata container, and fovea field is recognized as schema without persisting those source values into analytics records;
- quality/coverage indicators should be consulted before drawing conclusions from a partial export.

## Time-based metrics

Timeline calculations use timestamps available in the export. Weekday/hour summaries are normalized to UTC in the current implementation. Missing/invalid timestamps cannot contribute to dated buckets.

Analysis schema v3 retains per-day/per-model input/output token splits inside time buckets and conversation-day aggregates. This lets API-equivalent cost respect historical effective dates and multi-model conversations instead of applying a single current price to an entire bucket.

## Cost reconstruction

The Cost page separates two concepts:

1. **Visible-token API-equivalent calculation** — applies a pricing dataset to locally reconstructed visible-token categories where the required model/pricing information is available.
2. **Scenario estimate** — applies user-visible assumptions such as cache ratio and hidden-input/reasoning overhead.

Neither is an OpenAI invoice. Historical prices can change over time, model aliases can be ambiguous, and the export may not include provider-side input/output/cache/reasoning accounting needed for exact billing reconstruction.

Conversation and Timeline cost views use the same locally stored pricing history. If required per-model/day detail or a matching effective price is unavailable, the UI reports a coverage gap rather than presenting a partially calculated value as complete.

Local pricing overrides are stored separately from the built-in pricing dataset so user assumptions do not mutate the shipped baseline.

## Comparison with reported ChatGPT/Work/Codex totals

User-entered reported totals are stored/displayed as a separate provenance category. A reported total may have a different population, time window, tokenizer, request boundary, hidden-token policy, or billing semantics from export-derived values.

A difference between two totals is therefore evidence of a measurement difference, not by itself evidence that either source is incorrect.

## Import identity and recovery

Import identity uses a local SHA-256 fingerprint over bounded samples plus export-container metadata. Fingerprint version 3 excludes filesystem `lastModified` from the primary content identity so copying or re-downloading identical bytes does not by itself make the export appear unrelated. The sampler covers multiple evenly spaced regions of larger files while remaining bounded.

For migration compatibility, the application can also compute the previous fingerprint form locally and use it to recognize analyses/checkpoints created with an older fingerprint format. A paused checkpoint is resumed only when its stored analysis-schema, analyzer, and tokenizer versions match the current semantics; otherwise the application requires a fresh import rather than mixing incompatible metrics in one analysis. Fingerprints are recovery/duplicate-detection aids rather than cryptographic proof that every byte of a large archive is identical.

## Versioning and reproducibility

Each local analysis record stores application, analyzer, analysis-schema, tokenizer, and pricing-dataset version fields. These values are centralized in the application source rather than being independently hard-coded at import call sites. When parser/normalization/tokenizer semantics change, the corresponding analysis provenance version is advanced so old and new local analyses are distinguishable.

Analysis schema/analyzer version 3 adds pricing-aware per-model daily usage within conversation and timeline aggregates. Older completed analyses remain readable where their stored fields are sufficient, but a fresh import is required to obtain v3-only metrics or resume an incomplete older analysis.

Analysis schema/analyzer version 4 also stores per-model daily `otherTokens`. Top-model ranking uses all visible tokens (input, output, and other roles) consistently for all-time and dated ranges. Only valid dated messages contribute to a date range. Older completed analyses remain readable, but require a fresh import for complete v4 period ranking; incomplete older checkpoints cannot be resumed with the new semantics. Other-role tokens are not charged as API input/output tokens.

When comparing results across application versions, treat changes in parser, normalization, tokenizer mapping, or pricing data as potential causes of metric differences.

## Analytics export privacy and memory behavior

Privacy-safe analytics exports include only supported analytics read models rather than raw source objects. Full conversation bodies are never included. Conversation titles are omitted by default because titles themselves can contain private information; the export UI requires an explicit opt-in to include them.

Interactive JSON/CSV/Markdown downloads read conversation metrics through an IndexedDB cursor and serialize them in bounded string chunks. The final download Blob necessarily occupies space proportional to the output file, but the application avoids simultaneously materializing a second full array of conversation records and export DTOs.

For reproducibility, retain the application version and any local model/pricing overrides used for the analysis alongside the exported analytics report.
