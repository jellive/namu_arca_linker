import { LOG_PREFIX } from "../constants/config";

const DEVICE_TOKEN_KEY = "arcaDeviceToken";
const TOKEN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateRandomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_CHARS[bytes[i]! % TOKEN_CHARS.length];
  }
  return out;
}

/**
 * Returns a stable per-install random device token for the arca app API
 * `x-device-token` header. Generated once and persisted to storage.local.
 * The token is NOT registered with arca — any random 64-char string works.
 */
export interface ArcaArticle {
  id: number;
  title: string;
  categoryDisplayName?: string;
  createdAt: string;
  commentCount?: number;
}

export interface ThreadMatch {
  id: number;
  title: string;
  commentCount?: number;
  category?: string;
}

function stripHighlight(title: string): string {
  return title.replace(/<\/?b[^>]*>/g, "");
}

function toMatch(a: ArcaArticle): ThreadMatch {
  return {
    id: a.id,
    title: stripHighlight(a.title),
    commentCount: a.commentCount,
    category: a.categoryDisplayName,
  };
}

/**
 * Match a namu realtime keyword to a 실검챈 article.
 * 1) exact title match (case-insensitive), then 2) substring (after <b> strip).
 */
export function matchThread(
  keyword: string,
  articles: ArcaArticle[],
): ThreadMatch | null {
  const kw = keyword.toLowerCase();
  for (const a of articles) {
    if (stripHighlight(a.title).toLowerCase() === kw) return toMatch(a);
  }
  for (const a of articles) {
    if (stripHighlight(a.title).toLowerCase().includes(kw)) return toMatch(a);
  }
  return null;
}

const ARCA_API_BASE = "https://arca.live/api/app/list/channel/namuhotnow";
const CACHE_TTL_MS = 3 * 60 * 1000;

interface ArcaCache {
  articles: ArcaArticle[];
  fetchedAt: number;
}
let _cache: ArcaCache | null = null;

/** Test helper: clear the in-memory article cache. */
export function _resetArcaCache(): void {
  _cache = null;
}

async function fetchPage(
  token: string,
  before?: string,
  limit = 50,
): Promise<ArcaArticle[]> {
  // NOTE: User-Agent is a forbidden fetch header in a service worker. If the
  // spike (Task 1) showed the API rejects browser UAs, Task 10 adds a
  // declarativeNetRequest rule to spoof it; we never set it here.
  let url = `${ARCA_API_BASE}?limit=${limit}`;
  if (before) url += `&before=${encodeURIComponent(before)}&offset=1`;
  const res = await fetch(url, {
    headers: { "x-device-token": token },
  });
  if (!res.ok) throw new Error(`arca API ${res.status}`);
  const data = (await res.json()) as { articles?: ArcaArticle[] };
  return data.articles ?? [];
}

/**
 * Fetch 실검챈 recent articles (pages 1~2 merged), cached ~3min.
 * Returns [] on any failure so callers fall back to search links.
 */
export async function fetchNamuhotnowArticles(
  limit = 50,
): Promise<ArcaArticle[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.articles;
  }
  try {
    const token = await getDeviceToken();
    const page1 = await fetchPage(token, undefined, limit);
    let merged = page1;
    const last = page1[page1.length - 1];
    if (last) {
      const page2 = await fetchPage(token, last.createdAt, limit);
      const seen = new Set(page1.map((a) => a.id));
      merged = page1.concat(page2.filter((a) => !seen.has(a.id)));
    }
    _cache = { articles: merged, fetchedAt: Date.now() };
    return merged;
  } catch (e) {
    console.warn(`${LOG_PREFIX} arca API fetch 실패 — 검색 폴백`, e);
    return [];
  }
}

export function getDeviceToken(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [DEVICE_TOKEN_KEY]: undefined }, (data) => {
      const existing = data[DEVICE_TOKEN_KEY] as string | undefined;
      if (existing) {
        resolve(existing);
        return;
      }
      const token = generateRandomToken(64);
      chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: token }, () => {
        if (chrome.runtime?.lastError) {
          console.warn(
            `${LOG_PREFIX} device-token 저장 실패 —`,
            chrome.runtime.lastError.message,
          );
        }
        resolve(token);
      });
    });
  });
}
