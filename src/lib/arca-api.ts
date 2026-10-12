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
  createdAt?: string;
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
    createdAt: a.createdAt,
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

const ARCA_VIEW_BASE = "https://arca.live/api/app/view/article/namuhotnow";
const PREVIEW_MAX_CHARS = 140;
const SPOILER_NOTICE = "스포일러 주의 글입니다.";
const _previewCache = new Map<number, string>();

/** Test helper: clear the in-memory preview cache. */
export function _resetPreviewCache(): void {
  _previewCache.clear();
}

const ENTITIES = new Map([
  ["nbsp", " "],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["amp", "&"],
]);

// Tags that end a line of text; every other tag is inline and leaves no gap
// ("아<b>카라</b>이브" must stay one word).
const BLOCK_TAGS = new Set(
  "p div br li ul ol tr td th table h1 h2 h3 h4 h5 h6 blockquote pre hr figure figcaption img".split(
    " ",
  ),
);

/** Plain text of an article body: tags dropped, entities decoded, one line. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      // embedded media carries fallback text ("Your browser does not support…")
      /<(video|audio|iframe|object|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(
      // quoted attribute values may contain ">"
      /<\/?([a-z][a-z0-9]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
      (_tag, name: string) => (BLOCK_TAGS.has(name.toLowerCase()) ? " " : ""),
    )
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
      if (ref[0] !== "#") return ENTITIES.get(ref.toLowerCase()) ?? whole;
      const hex = ref[1] === "x" || ref[1] === "X";
      const code = parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= PREVIEW_MAX_CHARS) return text;
  return chars.slice(0, PREVIEW_MAX_CHARS).join("").trimEnd() + "…";
}

/**
 * Opening lines of a 실검챈 article body (where the "why is this trending"
 * explanation lives — titles are only keyword lists). Returns null on any
 * failure; failures are not cached so the next hover retries.
 */
export async function fetchArticlePreview(id: number): Promise<string | null> {
  const cached = _previewCache.get(id);
  if (cached !== undefined) return cached;
  try {
    const token = await getDeviceToken();
    const res = await fetch(`${ARCA_VIEW_BASE}/${id}`, {
      headers: { "x-device-token": token },
    });
    if (!res.ok) throw new Error(`arca API ${res.status}`);
    const data = (await res.json()) as {
      content?: string;
      isSpoilerAlert?: boolean;
    };
    const text = data.isSpoilerAlert
      ? SPOILER_NOTICE
      : excerpt(htmlToText(data.content ?? ""));
    _previewCache.set(id, text);
    return text;
  } catch (e) {
    console.warn(`${LOG_PREFIX} arca 글 미리보기 실패`, e);
    return null;
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
