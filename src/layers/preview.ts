import { LOG_PREFIX } from "../constants/config";
import type { ThreadMatch } from "../lib/arca-api";

export const PREVIEW_ID = "arca-preview";
const GAP_PX = 6;
const SIDE_GAP_PX = 12;
const GUTTER_PX = 8;

interface PreviewResponse {
  text?: string | null; // null: the lookup failed, ask again next time
}

// The 실검 widget clips its rows (overflow: hidden under a transformed <ul>),
// so one tooltip lives on <body> and is moved to whichever link is hovered.
let tip: HTMLElement | null = null;
let currentAnchor: HTMLElement | null = null;
const bodyCache = new Map<number, string>();

/** Test helper: drop the tooltip element and the fetched-text cache. */
export function _resetPreview(): void {
  tip = null;
  currentAnchor = null;
  bodyCache.clear();
}

/** "45분 전" style age of an ISO timestamp; "" when it cannot be read. */
export function formatAge(iso: string | undefined, now: number): string {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function part(name: string): HTMLElement {
  return tip!.querySelector<HTMLElement>(`.arca-preview-${name}`)!;
}

function ensureTip(): HTMLElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.id = PREVIEW_ID;
  tip.className = "arca-preview";
  tip.setAttribute("role", "tooltip");
  for (const name of ["meta", "title", "body"]) {
    const el = document.createElement("div");
    el.className = `arca-preview-${name}`;
    tip.appendChild(el);
  }
  document.body.appendChild(tip);
  window.addEventListener("scroll", hidePreview, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePreview();
  });
  return tip;
}

// Beside the keyword row when there is room (left first: the widget sits in
// the right sidebar), so the other keywords stay readable; under the link
// otherwise.
function place(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const row = (anchor.closest("li") ?? anchor).getBoundingClientRect();
  const width = tip!.offsetWidth;
  const height = tip!.offsetHeight;
  const maxLeft = window.innerWidth - width - GUTTER_PX;

  let left = row.left - width - SIDE_GAP_PX;
  if (left < GUTTER_PX) left = row.right + SIDE_GAP_PX;
  let top: number;
  if (left >= GUTTER_PX && left <= maxLeft) {
    top = Math.max(
      GUTTER_PX,
      Math.min(rect.top, window.innerHeight - height - GUTTER_PX),
    );
  } else {
    left = Math.max(GUTTER_PX, Math.min(rect.right - width, maxLeft));
    top = rect.bottom + GAP_PX;
    if (top + height > window.innerHeight - GUTTER_PX) {
      top = rect.top - height - GAP_PX;
    }
  }
  tip!.style.left = `${left}px`;
  tip!.style.top = `${top}px`;
}

function setBody(text: string): void {
  const body = part("body");
  body.textContent = text;
  body.hidden = text === "";
}

async function loadBody(anchor: HTMLElement, id: number): Promise<void> {
  let text = "";
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "articlePreview",
      id,
    })) as PreviewResponse | undefined;
    if (typeof res?.text === "string") {
      text = res.text;
      bodyCache.set(id, text);
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX} 미리보기 불러오기 실패`, e);
  }
  // Pointer left, or another link took over — possibly one for the same
  // article (the 실검 list repeats its first row), so compare the link.
  if (currentAnchor !== anchor) return;
  setBody(bodyCache.get(id) ?? text);
  place(anchor);
}

function showPreview(anchor: HTMLElement, match: ThreadMatch): void {
  ensureTip();
  currentAnchor = anchor;
  part("meta").textContent = [
    match.category,
    typeof match.commentCount === "number" ? `댓글 ${match.commentCount}` : "",
    formatAge(match.createdAt, Date.now()),
  ]
    .filter(Boolean)
    .join(" · ");
  part("title").textContent = match.title;

  const cached = bodyCache.get(match.id);
  setBody(cached ?? "불러오는 중…");
  tip!.setAttribute("data-open", "");
  place(anchor);
  if (cached === undefined) void loadBody(anchor, match.id);
}

export function hidePreview(): void {
  currentAnchor = null;
  tip?.removeAttribute("data-open");
}

/** Close the tooltip if its link was removed (no mouseleave fires for that). */
export function hidePreviewIfDetached(): void {
  if (currentAnchor && !currentAnchor.isConnected) hidePreview();
}

/** Show the matched 실검챈 post (title, meta, body excerpt) on hover/focus. */
export function attachPreview(
  link: HTMLAnchorElement,
  match: ThreadMatch,
): void {
  link.removeAttribute("title"); // the native tooltip would double up
  link.setAttribute("aria-describedby", PREVIEW_ID);
  const show = () => showPreview(link, match);
  link.addEventListener("mouseenter", show);
  link.addEventListener("focus", show);
  link.addEventListener("mouseleave", hidePreview);
  link.addEventListener("blur", hidePreview);
}
