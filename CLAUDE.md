# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**나무위키 실검 아카라이브 링커** — Chrome Extension (Manifest V3) that adds arca.live links next to namu.wiki real-time search keywords.

## Tech Stack

- **TypeScript + Vite** (build)
- **Manifest V3** with `storage` permission only
- **Vitest** (unit), **Playwright** (e2e), **Stryker** (mutation testing)

## Commands

```bash
npm run dev                # dev build with watch
npm run build              # production build
npm test                   # vitest
npm run test:mutation      # Stryker
npm run lint               # eslint
npm run format             # prettier
npm run deploy             # build + upload + publish to Chrome Web Store
```

## Source Layout

- `src/content.ts` — content script injected into namu.wiki pages
- `src/popup.ts`, `src/options.ts` — extension UI
- `src/layers/` — DOM manipulation layers
- `src/lib/` — shared utilities
- `src/types/` — shared types
- `src/constants/sites.ts` — target site definitions

## Notes

- Manifest V3 service worker model — no persistent background page
- Coverage maintained via Vitest + Stryker (~97% lines per 2026-04 audit)
