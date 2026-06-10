import { LOG_PREFIX } from "./constants/config";
import {
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
function registerArcaUaRule(): void {
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
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
          urlFilter: "||arca.live/api/app/list/channel/namuhotnow",
          resourceTypes: [
            "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
          ],
        },
      },
    ],
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
  return false;
});

console.log(`${LOG_PREFIX} service worker 준비됨`);
