# ChatGPT Export Profiler — Private Repository Delivery Amendment

Date: 2026-09-27
Status: Approved by explicit project instruction
Repository: `pengin0503/ChatGPT-Export-Profiler`

## 1. Scope

This amendment supersedes the GitHub Pages delivery assumptions in:

- `docs/superpowers/specs/2026-09-25-chatgpt-export-profiler-design.md`, especially section 19.1 and the Pages clause in section 22;
- any corresponding GitHub Pages deployment steps in the historical implementation plan.

All privacy, local-processing, PWA capability, browser-support, release verification, and synthetic-fixture requirements remain in force unless explicitly changed here.

## 2. Repository visibility and hosting

`pengin0503/ChatGPT-Export-Profiler` remains a **private repository**.

GitHub Pages is not available for this repository under the project's current hosting/account constraints and is therefore **not a supported deployment target or completion criterion**.

The repository must not contain or run a Pages deployment workflow while this constraint remains in force. A failed or absent Pages deployment must not block CI, release readiness, or v1 completion.

Publicizing the repository or changing its hosting/network policy requires a new explicit user instruction.

## 3. Distribution

Repository-backed distribution uses:

1. immutable GitHub Releases;
2. the validated versioned offline ZIP generated from the release workflow;
3. source/build instructions for local development and verification.

Release artifacts may contain only built application assets and synthetic test/support assets. They must not contain real ChatGPT exports, derived private fixtures, debug dumps, secrets, API keys, or user-identifying data.

## 4. PWA status

PWA/service-worker support remains a product capability, but the repository itself does not provide a hosted PWA origin.

PWA and physical iPad Safari/Orion validation that require a secure origin must use a user-provided, explicitly approved secure static host or other approved secure origin. Introducing a new hosted provider, backend, telemetry service, CDN, or runtime network dependency requires explicit user approval.

The application privacy boundary is unchanged: imported ChatGPT exports are processed in the browser and are not sent to the hosting origin, a backend, telemetry, analytics, an external tokenizer, or another external service by application runtime code.

## 5. CI/CD consequences

Required repository workflows are:

- normal CI for typecheck, lint, unit/integration tests, build, E2E, and the standard synthetic performance regression;
- scheduled/manual synthetic scale verification;
- tag-driven immutable GitHub Release creation with release-level verification and a 10k synthetic performance gate.

A GitHub Pages workflow is intentionally absent.

## 6. v1 completion interpretation

The existing v1 requirement to operate as a PWA means that the built application and service worker must function correctly when served from a compatible approved secure origin. It does **not** require this private GitHub repository to publish a GitHub Pages site.

The downloadable offline distribution remains a formal v1 delivery path.
