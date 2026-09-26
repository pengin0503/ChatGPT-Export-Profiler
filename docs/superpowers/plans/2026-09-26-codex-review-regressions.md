# Codex Review Regressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the still-valid, worthwhile Codex review findings on PR #2 without regressing large-export performance, local-only privacy, or iPad/PWA usability.

**Architecture:** Keep the existing IndexedDB read-model architecture. Make range analytics use persisted day-level aggregates instead of assigning whole conversations to their first timestamp; centralize full-conversation reads so exports sort once; reuse pricing history and local settings everywhere they affect displayed analytics; harden text exports; and repair UI/PWA integration defects with minimal structural change.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, fake-indexeddb, IndexedDB/idb, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-25-chatgpt-export-profiler-design.md`

## Global Constraints

- Analysis remains local-only; no export-data network path.
- v1 supports both Japanese and English; UI strings must live outside component logic.
- Treat exported content as untrusted input; raw HTML must not become active markup.
- Primary distribution remains an installable standalone PWA with offline app-shell behavior.
- Large tables remain virtualized/responsive and 50k-conversation datasets must remain usable.

## Review Focus

- Conversations spanning multiple days must contribute only selected-range usage to ranged totals and top-model selection.
- Millisecond and second timestamps must compare correctly against the same range.
- Local pricing/model-alias overrides must affect every page that displays those derived results.
- CSV/Markdown exports must remain inert when titles begin with controls, spreadsheet formula markers, HTML, or Markdown links.
- Import/recovery analyses must not be deletable while active or checkpoint-protected.

---

### Task 1: Range analytics and large-result access

**Files:**
- Modify: `src/analysis/aggregate.ts`
- Modify: `src/storage/db.ts`
- Modify: `src/storage/analyticsQueries.ts`
- Modify: `src/components/DateRangeFilter.tsx`
- Modify: `src/features/overview/OverviewPage.tsx`
- Modify: `src/features/conversations/ConversationsPage.tsx`
- Modify: `src/features/export-results/ExportResultsButton.tsx`
- Test: `tests/unit/analyticsQueries.test.ts`
- Test: `tests/unit/exportResults.test.ts`

**Interfaces:**
- Produces: conversation day-level aggregates and `listAllConversationMetrics(analysisId)`.
- Produces: ranged top-model lookup based on persisted daily model usage.

- [ ] Add failing tests for cross-day range projection, millisecond timestamps, peak-day derivation, ranged top model, >10k accessibility, and single-pass export reads.
- [ ] Run CI and confirm the new tests fail for the reviewed defects.
- [ ] Persist/query day-level conversation usage; normalize timestamp units; derive peak/range metrics from daily data; expose all rows once for export; remove the 10k UI cap.
- [ ] Run unit/full CI and confirm green.

### Task 2: Pricing, scenario persistence, storage lifecycle, and data quality

**Files:**
- Modify: `src/features/models/ModelsPage.tsx`
- Modify: `src/features/cost/CostPage.tsx`
- Modify: `src/storage/repositories.ts`
- Modify: `src/features/data-quality/DataQualityPage.tsx`
- Test: `tests/unit/costPage.test.tsx`
- Create/Modify: focused storage/models/data-quality unit tests as needed.

**Interfaces:**
- Consumes: existing `loadPricingRecords()` and model `usageByDay`.
- Produces: restored per-analysis scenario state and complete analysis deletion.

- [ ] Add failing tests for local pricing overrides on Models, scenario restoration, scoped profile/settings deletion, and custom alias targets not being flagged unknown.
- [ ] Run CI and confirm failures.
- [ ] Implement the minimum fixes using existing pricing/settings stores.
- [ ] Run unit/full CI and confirm green.

### Task 3: Export hardening and import-state safety

**Files:**
- Modify: `src/features/export-results/exportCsv.ts`
- Modify: `src/features/export-results/exportMarkdown.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/features/import/ImportPage.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ja.ts`
- Test: `tests/unit/exportResults.test.ts`
- Test: `tests/unit/importPage.test.tsx`
- Create/Modify: App protection regression test.

**Interfaces:**
- Produces: inert CSV/Markdown cells for attacker-controlled export strings.
- Produces: translated import failure details and protection for running/recoverable analysis IDs.

- [ ] Add failing tests for control-prefixed CSV formulas, active HTML/links in Markdown, translated failure details, and protected active import IDs.
- [ ] Run CI and confirm failures.
- [ ] Implement sanitization, i18n keys, and active-analysis protection.
- [ ] Run unit/full CI and confirm green.

### Task 4: Localization, responsive conversation table, and PWA installability

**Files:**
- Modify: `src/features/overview/OverviewPage.tsx`
- Modify: analytics pages/components that still hard-code user-facing copy.
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ja.ts`
- Modify: `src/styles/analytics.css`
- Modify: `public/manifest.webmanifest`
- Create: `public/icons/app-icon-192.svg`
- Create: `public/icons/app-icon-512.svg`
- Create/Modify: localization/manifest regression tests.

**Interfaces:**
- Produces: Japanese/English externalized analytics copy, horizontally reachable narrow-screen conversation columns, and manifest-declared install icons.

- [ ] Add failing tests for Overview Japanese copy, narrow-table overflow rule, and manifest icon entries/files.
- [ ] Run CI and confirm failures.
- [ ] Externalize reviewed UI strings, enable outer horizontal scrolling, and add 192/512 install icons.
- [ ] Run unit/full CI and confirm green.

### Task 5: Final verification and review-thread hygiene

**Files:**
- No production changes unless verification exposes a regression.

- [ ] Run the repository's unit tests, typecheck, lint, build, and available CI workflow.
- [ ] Re-read the remaining Codex threads against the final HEAD and resolve only threads whose issue is actually fixed or was already fixed before this plan.
- [ ] Self-review the final diff because no independent subagent is available in this harness.
