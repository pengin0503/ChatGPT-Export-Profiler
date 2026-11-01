# ChatGPT Export Profiler

[日本語](README.md) | **English**

A browser application for analyzing a ChatGPT export ZIP locally. Explore conversations, models, time patterns, tools, data quality and assumption-based costs, and export aggregated results as JSON, CSV or Markdown.

## Privacy and accuracy

The selected ZIP is processed in the browser and is not uploaded by the application to an analysis service. The original ZIP and message bodies are not stored in IndexedDB. Derived data such as conversation titles, timestamps, models, aggregates and settings may be stored locally. See [privacy](docs/privacy.md) for storage and deletion details.

The application distinguishes values observed in the export, calculated values and assumption-based estimates. Token counts and API-equivalent costs do not replace OpenAI billing or internal telemetry. See [data accuracy](docs/data-accuracy.md).

## Usage

Install Node.js 22 or later and npm, then run these commands in the repository folder:

```bash
npm ci
npm run dev
```

Open the displayed local address in a browser and select a ChatGPT export ZIP. Use `npm run build` for a production build and `npm run preview` to preview it.

## Offline use

In supported browsers, a production PWA loaded from a compatible secure origin can be installed and cached for later offline use. `npm run make:offline` creates a ZIP containing the app and a small Node server that binds only to `127.0.0.1`. Automated tests alone do not guarantee operation on physical iPad Safari or Orion.
