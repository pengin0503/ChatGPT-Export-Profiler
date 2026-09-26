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
- tool/web classifications derived from known metadata patterns.

A calculated value can be internally reproducible while still differing from an internal service metric whose input set or tokenizer semantics are different.

### Estimated

Estimated values require assumptions that the export cannot establish. Cost scenarios are the principal example. Estimated output should not be presented as an invoice, billing record, or exact reconstruction of hidden token usage.

## Token counts

Token counts are reconstructed locally from text available in the export and the profiler's local tokenizer/model mapping. Important limitations include:

- exported text may omit hidden system/developer instructions, tool serialization, reasoning tokens, or other server-side context;
- the exact production tokenizer or tokenizer revision may differ from the local mapping;
- cache reads/writes and other provider-side accounting dimensions cannot be inferred reliably from ordinary visible text;
- unknown model IDs may use fallback tokenization with lower confidence;
- attachments or non-text content may not have a directly reconstructable token equivalent.

For these reasons, a locally calculated visible-token count can be useful for relative analysis while differing materially from API usage/billing tokens.

## Model identity

Model identity is reconstructed from export metadata when available. The profiler preserves raw aliases and can apply local user-defined alias mappings. Unknown or future model identifiers are retained rather than silently rewritten to a known model.

An alias mapping changes local categorization; it does not prove which exact backend model/version served a historical request.

## Tool and web signals

Tool/Web views classify export metadata into known categories and preserve unknown raw types where possible. They indicate signals found in the export, not a complete execution trace or a billing-grade tool-call ledger.

A message can therefore have an observed/export-visible tool signal while details of internal execution remain unavailable.

## Conversation structure and malformed data

Exports can contain branches, missing parents, malformed nodes, unknown content types, missing timestamps, and future schema fields. The parser/normalizer is designed to recover usable neighboring records where safe and to report data-quality issues instead of treating every anomaly as fatal.

Consequences:

- malformed records can be skipped or partially represented;
- totals can be lower than the raw number of malformed objects in the ZIP;
- unknown schema keys are surfaced in Data Quality so schema drift is visible;
- quality/coverage indicators should be consulted before drawing conclusions from a partial export.

## Time-based metrics

Timeline calculations use timestamps available in the export. Weekday/hour summaries are normalized to UTC in the current implementation. Missing/invalid timestamps cannot contribute to dated buckets.

## Cost reconstruction

The Cost page separates two concepts:

1. **Visible-token API-equivalent calculation** — applies a pricing dataset to locally reconstructed visible-token categories where the required model/pricing information is available.
2. **Scenario estimate** — applies user-visible assumptions such as cache ratio and hidden-input/reasoning overhead.

Neither is an OpenAI invoice. Historical prices can change over time, model aliases can be ambiguous, and the export may not include provider-side input/output/cache/reasoning accounting needed for exact billing reconstruction.

Local pricing overrides are stored separately from the built-in pricing dataset so user assumptions do not mutate the shipped baseline.

## Comparison with reported ChatGPT/Work/Codex totals

User-entered reported totals are stored/displayed as a separate provenance category. A reported total may have a different population, time window, tokenizer, request boundary, hidden-token policy, or billing semantics from export-derived values.

A difference between two totals is therefore evidence of a measurement difference, not by itself evidence that either source is incorrect.

## Versioning and reproducibility

Each local analysis record stores analyzer/schema/tokenizer/pricing dataset version fields. When comparing results across application versions, treat changes in parser, normalization, tokenizer mapping, or pricing data as potential causes of metric differences.

Privacy-safe analytics exports include only the supported analytics DTO rather than raw source objects. For reproducibility, retain the application version and any local model/pricing overrides used for the analysis alongside the exported analytics report.
