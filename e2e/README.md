# E2E — namu_arca_linker

Drives the actual built extension against the live `namu.wiki` main page and asserts that the `왜?` arca link is injected and clickable.

## Prerequisites

Playwright is **not** in `package.json` yet. Install it once:

```sh
npm install -D @playwright/test@^1.47
npx playwright install chromium
```

## Run

```sh
npm run build                                # produce dist/content.js
EXTENSION_DIST_PATH=$(pwd) npx playwright test e2e/extension.spec.ts
```

`EXTENSION_DIST_PATH` must point to the **repo root** (where `manifest.json` lives), not `dist/`. The manifest references `dist/content.js` and `styles.css` relative to the extension root, so loading `dist/` directly would fail.

When `EXTENSION_DIST_PATH` is unset, the spec auto-skips — safe to leave in CI.

## Why persistent context + headed

- MV3 service workers cannot register inside ephemeral incognito profiles. Playwright's `chromium.launchPersistentContext()` is required.
- Chromium does **not** support MV3 extensions in headless mode (as of Playwright 1.47). The spec runs `headless: false`. For CI, wrap with `xvfb-run -a` on Linux.

## Known limitations

- Asserts against the **main page's realtime trending sidebar** — the realtime keyword anchors (`a[href^="/Go?q="]`) only render on `https://namu.wiki/`, not on `/w/<title>` article pages.
- Hits live `namu.wiki` and `arca.live` — flaky if either is down or if namu.wiki removes the realtime widget. No mocking by design (the whole point is to validate selectors against real markup).
- Realtime keyword list is dynamic; the spec asserts **count > 0** and validates the first injected anchor's contract rather than a specific keyword.
- Service worker registration sometimes lags behind the first navigation; the spec uses `waitForSelector` + auto-retrying locators to absorb this.

## Status (2026-04-22)

The spec ran cleanly **end-to-end with manual Chrome (extension loaded
via `chrome://extensions` "Load unpacked")** but consistently fails the
two injection assertions when launched through Playwright's
`launchPersistentContext`. The third "no uncaught errors" check passes,
which suggests the extension's content script is loaded but its
`chrome.storage.local.get` returns no value in Playwright's fresh
profile, so `init()` short-circuits before injecting anchors. A
follow-up could either pre-seed the user-data-dir with `enabled: true`
or wait for the storage default `{ enabled: true }` to settle. Until
then, run the spec manually after toggling the extension on once.
