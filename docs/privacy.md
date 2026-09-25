# Privacy and local data handling

ChatGPT Export Profiler is designed to analyze a ChatGPT export inside the user's browser. The privacy boundary is part of the product architecture, not an optional mode.

## What the application reads

When the user selects a ZIP, the application inspects the archive locally and reads `conversations.json` through browser-side parsing/worker code. ZIP safety checks reject suspicious paths, duplicate/missing conversation entries, excessive size, and suspicious compression ratios according to the active local policy.

The selected archive is not sent to an analysis API by the application.

## What is not persisted

The application does not intentionally persist:

- the original ChatGPT export ZIP;
- extracted ZIP files;
- raw conversation JSON objects;
- raw message bodies or full message text;
- file/blob contents from the export;
- browser analytics or telemetry destined for an external service.

The service worker caches only build/application-shell assets. Imported ZIPs, Blob URLs, IndexedDB records, generated analytics exports, and external origins are excluded from service-worker routing.

## What can be persisted locally

IndexedDB database `chatgpt-export-profiler` stores local analysis state. Depending on the imported export and features used, persisted records can include:

- analysis identifiers, export fingerprint, timestamps, status, and analyzer/schema/tokenizer/pricing dataset versions;
- conversation metric rows, including conversation ID, title, first/last timestamp, message/token counts, model IDs, and boolean web/file/tool signals;
- model aggregates and raw model aliases;
- timeline aggregates;
- tool classifications and raw tool-type identifiers;
- data-quality counts, coverage information, issue codes, and unknown schema **field names**;
- durable import checkpoints used for cancellation/recovery and storage-pressure retry;
- locally entered comparison/cost profiles where applicable;
- local pricing history/overrides;
- model-alias, performance, locale, and ZIP-safety settings.

Conversation titles are therefore local persisted user-derived data even though raw message bodies are not persisted. Treat the browser profile containing the IndexedDB database as sensitive.

## Analytics export

The JSON/CSV/Markdown export feature builds a dedicated analytics DTO. It contains derived analytics such as overview totals, model summaries, and conversation titles/metrics. It is intentionally separated from raw import objects and does not export raw message bodies.

CSV fields beginning with `=`, `+`, `-`, or `@` are prefixed before serialization to reduce spreadsheet-formula injection risk. Markdown and JSON are serialized as data, not executable HTML.

Once an analytics file is downloaded, it is outside the application's storage boundary. The user is responsible for where that downloaded file is saved or shared.

## Network isolation

Production runtime behavior is intended to remain on the app origin. Automated tests fail if an import interaction requests an origin other than the app origin and also guard against `sendBeacon`/WebSocket use during the isolation test.

The repository's Pages/PWA build uses local bundled assets. It does not rely on remote fonts, tokenizers, scripts, or analytics services at runtime.

## Deleting local analysis data

Settings exposes storage management for deleting a current or prior analysis. Analysis deletion removes the analysis record and the analysis-owned conversation, metric, model, timeline, tool, quality, and checkpoint records in one local IndexedDB transaction.

When an import is paused because browser quota is exhausted, that paused analysis/checkpoint is protected from the "prior analyses" deletion list so the user can free space by deleting other analyses and then retry.

Application-wide settings and pricing-history records are separate from an analysis and are not implicitly removed when one analysis is deleted.

To remove all application data, users can additionally clear site data for the application's origin using browser storage/site settings.

## Development-data rule

Real ChatGPT exports must never be committed to this repository or used as fixtures. Tests and performance workloads use fully synthetic exports. If a real export is used privately to validate schema compatibility, only field names/types/structure and synthetic reproductions of edge cases may influence committed development artifacts.
