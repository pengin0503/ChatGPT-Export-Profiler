# PR #2 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #2 merge-ready by restoring all automated quality gates and addressing every current non-outdated Codex P1/P2 review finding without weakening the local-only/privacy guarantees.

**Architecture:** Keep the current local-first worker/IndexedDB design. Fix correctness at the earliest durable boundary: parsing cancellation in stream code, normalization/aggregation consistency before persistence, analysis-scoped lifecycle cleanup in repositories/controllers, and UI/export behavior on top of effective persisted data. Prefer bounded collections and indexed/cursor-backed reads for large exports.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, IndexedDB/idb, Web Workers, fflate, TanStack Virtual, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-25-chatgpt-export-profiler-design.md`

## Global Constraints

- ChatGPT export ZIPs and raw message bodies remain local to the browser and are never uploaded by application code.
- Original ZIP/raw bodies are not persisted in IndexedDB.
- Existing observed/calculated/estimated provenance semantics remain intact.
- Japanese and English remain supported UI locales; user-facing strings must be externalized.
- PWA/offline distribution remains functional under GitHub Pages and the standalone offline ZIP.
- Large-export behavior must remain bounded and the synthetic 1k performance gate must pass.
- Physical iPad Safari/Orion release validation remains a separate final release gate; automated WebKit/iPad tests do not replace it.

## Review Focus

- Malformed/truncated JSON must fail promptly without leaving decompression blocked.
- Date ranges and peak-day/model cards must describe messages inside the selected period, including millisecond timestamps.
- Resumed/reanalyzed imports must not mix alias maps, lose checkpoints, or let stale recovery discovery replace active work.
- Large/repetitive schema anomalies and exports must remain bounded in memory/time, including export paging and 50k-conversation navigation.
- Export-controlled strings must remain inert in CSV/Markdown and malformed identifiers/timestamps must not abort a whole analysis.

---

### Task 1: Restore the CI floor

**Files:**
- Modify: `scripts/offline-package-version.mjs`
- Modify: `src/features/cost/CostPage.tsx`
- Modify: `src/features/export-results/exportMarkdown.ts`
- Test: `tests/unit/exportResults.test.ts`
- Test/Create: targeted package-version test under `tests/unit/`

**Interfaces:**
- Consumes: current release tag/version helper and Markdown serializer.
- Produces: syntactically valid release helper and serializer output matching the existing `$lower–$upper` contract.

- [ ] Add/confirm failing tests for release-tag validation and Markdown scenario currency markers.
- [ ] Verify the tests/CI fail for the intended reasons.
- [ ] Remove the escaped-template-literal syntax corruption, remove the unused Cost variable, and emit `$` on both scenario bounds.
- [ ] Verify unit tests, lint, typecheck and build pass before continuing.

### Task 2: Bound and harden normalization/aggregation

**Files:**
- Modify: `src/analysis/quality.ts`
- Modify: `src/analysis/normalize.ts`
- Modify: `src/analysis/aggregate.ts`
- Modify: `src/workers/analysis.worker.ts`
- Modify: `src/workers/import.worker.ts`
- Test: `tests/unit/quality.test.ts`
- Test: `tests/unit/normalize.test.ts`
- Test: `tests/unit/aggregate.test.ts`
- Test: relevant worker/integration tests

**Interfaces:**
- Produces: bounded issue details with exact counters, complete model/tokenization coverage, recoverable invalid timestamp/content handling, consistent duplicate-ID policy, and model attribution for model-less input turns.

- [ ] Add failing tests for capped issue details while counters keep increasing, missing-model attempts, unsupported content reporting, invalid timestamp bucketing, turn-model attribution, final tokenization coverage, duplicate conversation IDs, and unknown conversation-level keys.
- [ ] Verify RED.
- [ ] Implement minimal fixes in the collector/normalizer/aggregator/workers.
- [ ] Verify unit/integration suite GREEN.

### Task 3: Make import lifecycle cancellation/recovery consistent

**Files:**
- Modify: `src/import/jsonArrayStream.ts`
- Modify: `src/features/import/importController.ts`
- Modify: `src/features/import/useImportSession.ts`
- Modify: checkpoint/domain types/repositories as required to persist the import-time alias map.
- Test: `tests/unit/jsonArrayStream.test.ts`
- Test: `tests/unit/importController.test.ts`
- Test: import-session/integration tests

**Interfaces:**
- Produces: abnormal parser exit cancels its reader; startup cancellation invalidates pending startup; terminal failures persist `failed`; checkpoint resume pins aliases; wrong-ZIP retry keeps recovery; stale discovery cannot replace active state; newest completed reanalysis is selected.

- [ ] Add failing lifecycle/race tests.
- [ ] Verify RED.
- [ ] Implement cancellation generation/abort guards, durable failure state, checkpoint alias persistence, recovery-state guards and newest-match selection.
- [ ] Verify all import unit/integration tests GREEN.

### Task 4: Correct ranged analytics and large-conversation access

**Files:**
- Modify: `src/storage/analyticsQueries.ts`
- Modify: analytics metric/storage types as required for message-granular ranged totals.
- Modify: `src/features/overview/OverviewPage.tsx`
- Modify: `src/features/conversations/ConversationsPage.tsx`
- Modify: `src/features/conversations/ConversationTable.tsx`
- Test: `tests/unit/analyticsQueries.test.ts`
- Test: Overview/Conversations component tests and E2E iPad layout tests

**Interfaces:**
- Produces: second/millisecond-normalized period queries, peak day from timeline buckets, range-consistent top model, access to every conversation beyond 10k, horizontally reachable narrow-screen columns.

- [ ] Add failing tests for a conversation spanning the range boundary, millisecond timestamps, peak-day distribution, range-specific top model, >10k paging and narrow viewport access.
- [ ] Verify RED.
- [ ] Implement range queries from message/timeline/model-period aggregates rather than a conversation's first timestamp; add paged/cursor loading and horizontal reachability.
- [ ] Verify unit/component/E2E tests GREEN.

### Task 5: Make pricing, reporting and export safe/consistent

**Files:**
- Modify: `src/analysis/pricing.ts` and pricing-query helpers as needed
- Modify: `src/features/models/ModelsPage.tsx`
- Modify: `src/features/cost/CostPage.tsx`
- Modify: `src/features/export-results/ExportResultsButton.tsx`
- Modify: `src/features/export-results/exportCsv.ts`
- Modify: `src/features/export-results/exportMarkdown.ts`
- Test: pricing/cost/export unit tests

**Interfaces:**
- Produces: effective local overrides everywhere, persisted scenario restoration, pricing-period-aware totals, cost/scenario data in exports, spreadsheet-formula neutralization after leading controls, inert Markdown content, and non-quadratic conversation export reads.

- [ ] Add failing pricing/export safety and performance-shape tests.
- [ ] Verify RED.
- [ ] Implement effective-pricing loading, persisted cost profile restoration/export, safe serializers and one-pass/cursor-backed export collection.
- [ ] Verify tests GREEN.

### Task 6: Complete deletion, localization and PWA behavior

**Files:**
- Modify: `src/storage/repositories.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/features/data-quality/DataQualityPage.tsx`
- Modify: `src/features/import/ImportPage.tsx`
- Modify: analytics pages containing hard-coded English strings
- Modify: locale dictionaries
- Modify: `public/manifest.webmanifest`
- Create: installable PWA icon assets under `public/`
- Test: storage/component/localization/PWA tests

**Interfaces:**
- Produces: deletion removes analysis-scoped profiles, active imports are protected from deletion, local alias targets are not mislabeled unknown, failure details are translated, Japanese analytics strings are externalized, and the manifest references valid install icons.

- [ ] Add failing deletion/localization/manifest/alias tests.
- [ ] Verify RED.
- [ ] Implement repository/UI/dictionary/manifest fixes and add icons.
- [ ] Verify tests/build/E2E GREEN.

### Task 7: Whole-branch verification and review closure

**Files:**
- Modify only files required by findings from the final verification/review pass.
- Update: PR #2 review threads and PR body verification status.

- [ ] Run/confirm `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, full E2E, synthetic fixture generation and performance regression via GitHub Actions.
- [ ] Re-read all non-outdated unresolved Codex threads against the resulting head; do not resolve a thread unless the code/tests address it.
- [ ] Request a fresh Codex review on the final head.
- [ ] Apply at most one final RED→GREEN correction pass for any Critical/Important findings.
- [ ] Resolve addressed threads and update PR verification notes. Leave physical iPad Safari/Orion validation explicitly open as the release-only gate.
