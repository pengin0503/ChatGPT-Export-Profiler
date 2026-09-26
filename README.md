# ChatGPT Export Profiler

ChatGPT Export Profiler is a local-first browser application for inspecting a ChatGPT data export ZIP without uploading the archive to an analysis service. It turns export metadata and message structure into navigable analytics for conversations, models, time distribution, tools/web signals, data quality, and reconstructed cost scenarios.

## Privacy model

The application is designed around a local-only analysis boundary:

- The selected ChatGPT export ZIP is read in the browser and is not uploaded by the application.
- Import parsing and aggregation run in browser workers.
- The original ZIP and raw message bodies are not persisted in IndexedDB.
- Derived local records can include conversation titles, timestamps, model identifiers, token counts, tool classifications, quality findings, checkpoints, settings, and pricing overrides.
- The PWA service worker caches the application shell only. It does not cache imported ZIPs, Blob URLs, IndexedDB records, analytics exports, or external origins.
- Production runtime code is expected to make no external analysis/telemetry requests. The E2E suite enforces the network-isolation boundary during import.

See [docs/privacy.md](docs/privacy.md) for the persisted-data inventory and deletion behavior.

## Metric provenance

The UI distinguishes three provenance classes:

- **observed** — directly present in the export or counted from directly observed records.
- **calculated** — deterministically reconstructed from export-visible data, such as local token counts and aggregations.
- **estimated** — depends on assumptions that the export cannot prove, especially API-equivalent or scenario cost reconstruction.

These categories are not interchangeable. In particular, local token and cost values are not a replacement for OpenAI billing or internal server telemetry. See [docs/data-accuracy.md](docs/data-accuracy.md).

## Main views

After importing an export ZIP, the application exposes:

- Overview totals and privacy-safe JSON/CSV/Markdown analytics export
- Model usage and raw alias visibility
- Timeline buckets and weekday/hour summaries
- Virtualized conversation metrics with filters
- API-equivalent and assumption-driven cost views
- Tool/Web classifications
- Data-quality coverage and unknown-schema findings
- Comparison against user-entered reported totals
- Local settings, pricing overrides, model aliases, performance profile, ZIP safety policy, and storage deletion controls

## Running locally

Requirements: Node.js 22+ and npm.

```bash
npm ci
npm run dev
```

For the production build:

```bash
npm run build
npm run preview
```

The Vite build uses relative asset paths so the same `dist/` works under the repository GitHub Pages subpath.

## PWA and offline package

A production build registers a local application-shell service worker. After the PWA has been loaded and installed/cached, supported browsers can reopen the application without network access.

A standalone offline package can also be built:

```bash
npm run make:offline
```

The generated ZIP contains the built application plus a minimal Node static server. After extracting it, run the included server script; it binds to `127.0.0.1` only and does not add telemetry.

## Development and verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run e2e
```

Large synthetic fixtures are generated deterministically and are never sourced from a real ChatGPT export:

```bash
npm run make:fixture:1k
npm run make:fixture:10k
npm run make:fixture:50k
npm run test:performance
```

Generated large ZIPs are ignored by Git. The repository must never contain a real user export or extracted real conversation data.

## Browser coverage

Automated E2E coverage runs against Chromium, Firefox, and WebKit. The suite also exercises iPad portrait/landscape viewports, touch-capable layouts, offline/PWA behavior, hostile synthetic content, and the complete v1 product flow.

Automated WebKit/iPad viewport tests do **not** replace release testing on physical iPad Safari and iPad Orion. The v1 release checklist requires real-device verification before v1.0 is declared complete.

## CI and delivery

- `.github/workflows/ci.yml` runs the main quality gates on pushes and pull requests targeting `main`.
- `.github/workflows/pages.yml` deploys only the exact `main` commit whose CI workflow completed successfully. GitHub Pages must be enabled once in repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow intentionally does not try to create/enable the Pages site with `GITHUB_TOKEN`, because that operation requires repository-administration permission not granted to the normal Actions token.
- `.github/workflows/release.yml` runs the release quality gate for `v*` tags and attaches the versioned offline ZIP to the GitHub Release.

CI and test fixtures are synthetic. User exports, generated analysis databases, and local browser data are not CI artifacts.
