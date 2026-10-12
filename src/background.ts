import { LOG_PREFIX } from "./constants/config";
import {
  fetchArticlePreview,
  fetchNamuhotnowArticles,
  matchThread,
  type ThreadMatch,
} from "./lib/arca-api";

export interface MatchThreadsResponse {
  matches: Record<string, ThreadMatch | null>;
}

/** Fetch articles once and match every keyword against them. */
export async function handleMatchThreads(
  keywords: string[],
): Promise<MatchThreadsResponse> {
  const articles = await fetchNamuhotnowArticles();
  const matches: Record<string, ThreadMatch | null> = {};
  for (const kw of keywords) {
    matches[kw] = matchThread(kw, articles);
  }
  return { matches };
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (
    msg &&
    msg.type === "matchThreads" &&
    Array.isArray((msg as { keywords?: unknown }).keywords)
  ) {
    handleMatchThreads((msg as { keywords: string[] }).keywords)
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
    Number.isInteger((msg as { id?: unknown }).id)
  ) {
    fetchArticlePreview((msg as { id: number }).id)
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
