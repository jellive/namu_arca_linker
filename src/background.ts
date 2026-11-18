import { LOG_PREFIX } from "./constants/config";
import {
  fetchArticlePreview,
  fetchNamuhotnowArticles,
  matchThread,
  type FetchOptions,
  type ThreadMatch,
} from "./lib/arca-api";

export interface MatchThreadsResponse {
  matches: Record<string, ThreadMatch | null>;
}

/** Fetch articles once and match every keyword against them. */
export async function handleMatchThreads(
  keywords: string[],
  opts?: FetchOptions,
): Promise<MatchThreadsResponse> {
  // Null prototype: a keyword such as "__proto__" must become its own entry
  // instead of rewriting the object's prototype.
  const matches: Record<string, ThreadMatch | null> = Object.create(null);
  if (keywords.length === 0) return { matches };
  const articles = await (opts
    ? fetchNamuhotnowArticles(undefined, opts)
    : fetchNamuhotnowArticles());
  for (const kw of keywords) {
    matches[kw] = matchThread(kw, articles);
  }
  return { matches };
}

/** Article ids become a URL path segment: positive safe integers only. */
function isArticleId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

// arca app API gates on the official-app User-Agent. fetch() cannot set
// User-Agent from a service worker, so rewrite it via declarativeNetRequest.
const ARCA_UA = "net.umanle.arca.android.playstore/0.9.83";
const ARCA_UA_URL_FILTERS = [
  "||arca.live/api/app/list/channel/namuhotnow",
  "||arca.live/api/app/view/article/namuhotnow/",
];
function registerArcaUaRule(): void {
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: ARCA_UA_URL_FILTERS.map((_, i) => i + 1),
    addRules: ARCA_UA_URL_FILTERS.map((urlFilter, i) => ({
      id: i + 1,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "user-agent",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: ARCA_UA,
          },
        ],
      },
      condition: {
        urlFilter,
        resourceTypes: [
          "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
        ],
      },
    })),
  });
}
chrome.runtime.onInstalled.addListener(registerArcaUaRule);
chrome.runtime.onStartup.addListener(registerArcaUaRule);

/**
 * The popup's ON/OFF flag (default ON). Read here so that OFF stops arca.live
 * lookups even when a stale content-script listener still asks — CHANGELOG
 * promises no lookups while OFF. An unreadable setting keeps today's behavior.
 */
function isEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ enabled: true }, (local) => {
      if (chrome.runtime.lastError || !local) {
        resolve(true);
        return;
      }
      resolve(Boolean(local["enabled"]));
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Under the default "spanning" incognito mode one worker serves incognito
  // and regular tabs; incognito answers must not touch the shared caches.
  const shared: FetchOptions | undefined =
    sender?.tab?.incognito === true ? { bypassCache: true } : undefined;
  if (
    msg &&
    msg.type === "matchThreads" &&
    Array.isArray((msg as { keywords?: unknown }).keywords)
  ) {
    // Non-string or empty entries are dropped rather than failing the batch.
    const keywords = (msg as { keywords: unknown[] }).keywords.filter(
      (k): k is string => typeof k === "string" && k !== "",
    );
    isEnabled()
      .then((on) =>
        on
          ? handleMatchThreads(keywords, shared)
          : { matches: Object.create(null) },
      )
      .then(sendResponse)
      .catch((e) => {
        console.warn(`${LOG_PREFIX} matchThreads 처리 실패`, e);
        sendResponse({ matches: {} });
      });
    return true; // async sendResponse — keep the channel open
  }
  if (
    msg &&
    msg.type === "articlePreview" &&
    isArticleId((msg as { id?: unknown }).id)
  ) {
    const id = (msg as { id: number }).id;
    isEnabled()
      .then((on) =>
        on
          ? shared
            ? fetchArticlePreview(id, shared)
            : fetchArticlePreview(id)
          : null,
      )
      .then((text) => sendResponse({ text }))
      .catch((e) => {
        console.warn(`${LOG_PREFIX} articlePreview 처리 실패`, e);
        sendResponse({ text: null });
      });
    return true;
  }
  return false;
});

console.log(`${LOG_PREFIX} service worker 준비됨`);
