/**
 * E2E spec for the namu_arca_linker Chrome extension.
 *
 * Verifies that, on a real namu.wiki main page, the extension injects an
 * `<a class="arca-link">왜?</a>` next to each realtime trending keyword and
 * that clicking it opens the corresponding arca.live search in a new tab.
 *
 * Skipped automatically when EXTENSION_DIST_PATH is unset, so this file is
 * safe to live in the suite even before Playwright is installed.
 *
 * Run:
 *   npm run build
 *   EXTENSION_DIST_PATH=$(pwd) npx playwright test e2e/extension.spec.ts
 *
 * NOTE: EXTENSION_DIST_PATH must point to the REPO ROOT (where manifest.json
 * lives), NOT the dist/ folder — manifest.json references "dist/content.js"
 * and "styles.css" relative to the extension root.
 */

import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const EXTENSION_PATH = process.env["EXTENSION_DIST_PATH"];
const NAMU_WIKI_URL = "https://namu.wiki/";

// Skip the entire file when the extension hasn't been built / pointed at.
test.skip(
  !EXTENSION_PATH,
  "Set EXTENSION_DIST_PATH to the repo root (containing manifest.json) to run extension E2E tests.",
);

test.describe("namu_arca_linker content script", () => {
  let context: BrowserContext;
  let page: Page;
  const pageErrors: Error[] = [];
  const failedRequests: { url: string; failure: string | null }[] = [];

  test.beforeAll(async () => {
    if (!EXTENSION_PATH) return;

    // Sanity: manifest.json must exist at the given path.
    const manifestPath = path.join(EXTENSION_PATH, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `EXTENSION_DIST_PATH=${EXTENSION_PATH} does not contain manifest.json. ` +
          `Point it at the repo root, not the dist/ folder.`,
      );
    }

    // MV3 service workers REQUIRE persistent context — they cannot run in
    // ephemeral incognito browsers. headless mode is also unsupported for
    // MV3 extensions in Chromium today; use headless: false.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nal-pw-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    // Use the existing about:blank page rather than opening a new one to
    // avoid racing the service worker registration.
    page = context.pages()[0] ?? (await context.newPage());

    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("requestfailed", (req) =>
      failedRequests.push({
        url: req.url(),
        failure: req.failure()?.errorText ?? null,
      }),
    );
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("injects an arca-link next to realtime keywords on namu.wiki main page", async () => {
    test.setTimeout(60_000);

    // namu.wiki redirects `/` → `/w/나무위키:대문`. The content script is
    // injected AFTER each navigation, but the persistent context's first page
    // (`about:blank`) sometimes races the service-worker registration.
    // Reload once after the realtime keywords appear so the script gets a
    // clean shot at the final URL.
    const response = await page.goto(NAMU_WIKI_URL, {
      waitUntil: "load",
    });
    expect(response, "navigation response should exist").not.toBeNull();
    expect(response!.status(), "main page should return 2xx").toBeLessThan(400);

    await page.waitForSelector('a[href^="/Go?q="]', { timeout: 20_000 });
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector('a[href^="/Go?q="]', { timeout: 20_000 });

    // The content script processes them on document_end + a small delay; wait
    // for at least one injected `.arca-link` element. Locator auto-retries.
    const arcaLinks = page.locator("a.arca-link");
    await expect(arcaLinks.first()).toBeVisible({ timeout: 20_000 });

    const count = await arcaLinks.count();
    expect(count, "at least one arca-link should be injected").toBeGreaterThan(
      0,
    );

    // Verify the injected anchor matches the contract from src/layers/manipulation.ts.
    const first = arcaLinks.first();
    await expect(first).toHaveText("왜?");
    await expect(first).toHaveAttribute("target", "_blank");
    await expect(first).toHaveAttribute("rel", /noopener/);

    const href = await first.getAttribute("href");
    expect(href, "href must be set").not.toBeNull();
    const parsed = new URL(href!);
    expect(parsed.host).toBe("arca.live");
    expect(parsed.pathname).toBe("/b/namuhotnow");
    expect(parsed.searchParams.get("target")).toBe("all");
    expect(parsed.searchParams.get("keyword")).toBeTruthy();
  });

  test("clicking the arca-link opens arca.live in a new tab", async () => {
    test.setTimeout(45_000);

    // Re-discover (page may have re-rendered between tests).
    const arcaLink = page.locator("a.arca-link").first();
    await expect(arcaLink).toBeVisible({ timeout: 15_000 });

    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15_000 }),
      arcaLink.click(),
    ]);

    await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 });
    expect(new URL(popup.url()).host).toBe("arca.live");

    await popup.close();
  });

  test("no uncaught page errors and no failed requests during navigation", async () => {
    // Filter out unrelated third-party requestfailed noise (ad/analytics
    // domains often fail on namu.wiki). Only fail if the failures touch
    // namu.wiki, arca.live, or the extension itself.
    const relevantFailures = failedRequests.filter((f) => {
      try {
        const host = new URL(f.url).host;
        return (
          host.endsWith("namu.wiki") ||
          host.endsWith("arca.live") ||
          f.url.startsWith("chrome-extension://")
        );
      } catch {
        return false;
      }
    });

    expect(
      pageErrors,
      `uncaught errors: ${pageErrors.map((e) => e.message).join(" | ")}`,
    ).toEqual([]);
    expect(
      relevantFailures,
      `relevant network failures: ${JSON.stringify(relevantFailures, null, 2)}`,
    ).toEqual([]);
  });
});
