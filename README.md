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

The Vite build uses relative asset paths so the same `dist/` can be served from a subpath or packaged for local/offline use without a repository-specific hosted URL.

## PWA and offline package

A production build registers a local application-shell service worker when served from a compatible secure origin. After the PWA has been loaded and installed/cached, supported browsers can reopen the application without network access.


A standalone offline package can be built:

```bash
npm run make:offline
```

The generated ZIP contains the built application plus a minimal Node static server. After extracting it, run the included server script; it binds to `127.0.0.1` only and does not add telemetry.

## Browser coverage

Automated E2E coverage runs against Chromium, Firefox, and WebKit. The suite also exercises iPad portrait/landscape viewports, touch-capable layouts, offline/PWA behavior, hostile synthetic content, and the complete v1 product flow.

Automated WebKit/iPad viewport tests do **not** replace release testing on physical iPad Safari and iPad Orion. The v1 release checklist requires real-device verification before v1.0 is declared complete. Because this private repository does not publish Pages, physical-device PWA checks require a separately provided approved secure origin.

## 日本語

ChatGPT Export Profilerは、ChatGPTのエクスポートZIPをブラウザ内で分析し、会話・モデル・時間帯・ツールの利用状況や推定コストを確認するアプリです。選択したZIPを分析サービスへアップロードせず、ブラウザ内で処理します。元のZIPやメッセージ本文はIndexedDBに保存しませんが、会話タイトル、日時、モデル名、集計値や設定などの派生データはローカルに保存される場合があります。保存・削除の詳細は[プライバシー](docs/privacy.md)を参照してください。

表示値はエクスポートから直接確認できた値、算出値、仮定に基づく推定値を区別します。トークンやAPI換算費用は公式の請求額ではありません。[データ精度](docs/data-accuracy.md)も参照してください。

ZIPを読み込むと、概要、モデル、時間帯、会話、費用、ツール、データ品質を確認し、集計結果をJSON・CSV・Markdownで出力できます。ローカル実行にはNode.js 22以上とnpmが必要です。

```bash
npm ci
npm run dev
```

オフラインパッケージや対応ブラウザのPWAを利用する方法は下記の英語説明を参照してください。
