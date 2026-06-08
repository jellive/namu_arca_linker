import {
  CSS_CLASS_PANEL,
  CSS_CLASS_PANEL_TOGGLE,
  CSS_CLASS_PANEL_ROW,
  CSS_CLASS_PANEL_BADGE,
  STORAGE_KEY_HUB_COLLAPSED,
} from "../constants/config";
import {
  createLinksContainer,
  activeSites,
  refreshActiveSites,
} from "./manipulation";
import { extractCurrentKeywords } from "./discovery";
import { computeTrends } from "./trends";
import type { TrendBadge } from "./trends";
import type { KeywordState } from "../types/common";
import type { TargetSite } from "../lib/storage";

const BADGE_TEXT: Record<TrendBadge, string> = {
  up: "▲",
  down: "▼",
  new: "NEW",
  same: "",
};

export interface PanelParts {
  panel: HTMLDivElement;
  body: HTMLDivElement;
  toggle: HTMLButtonElement;
}

export function buildPanel(): PanelParts {
  const panel = document.createElement("div");
  panel.className = CSS_CLASS_PANEL;

  const header = document.createElement("div");
  header.className = `${CSS_CLASS_PANEL}-header`;
  header.textContent = "🔥 실검 허브";

  const body = document.createElement("div");
  body.className = `${CSS_CLASS_PANEL}-body`;

  panel.appendChild(header);
  panel.appendChild(body);

  const toggle = document.createElement("button");
  toggle.className = CSS_CLASS_PANEL_TOGGLE;
  toggle.type = "button";
  toggle.textContent = "🔥";
  toggle.title = "실검 허브 열기/닫기";

  return { panel, body, toggle };
}

export function renderRows(
  body: HTMLElement,
  keywords: KeywordState,
  trends: Map<string, TrendBadge>,
  sites: TargetSite[],
): void {
  body.innerHTML = "";
  if (keywords.size === 0) {
    const empty = document.createElement("div");
    empty.className = `${CSS_CLASS_PANEL}-empty`;
    empty.textContent = "실시간 검색어 없음";
    body.appendChild(empty);
    return;
  }
  for (const [rank, keyword] of keywords) {
    const row = document.createElement("div");
    row.className = CSS_CLASS_PANEL_ROW;

    const rankEl = document.createElement("span");
    rankEl.className = `${CSS_CLASS_PANEL}-rank`;
    rankEl.textContent = String(rank);

    const badge = document.createElement("span");
    const trend = trends.get(keyword) ?? "same";
    badge.className = `${CSS_CLASS_PANEL_BADGE} ${CSS_CLASS_PANEL_BADGE}-${trend}`;
    badge.textContent = BADGE_TEXT[trend];

    const kw = document.createElement("span");
    kw.className = `${CSS_CLASS_PANEL}-kw`;
    kw.textContent = keyword;

    row.append(rankEl, badge, kw);
    row.appendChild(createLinksContainer(keyword, sites));
    body.appendChild(row);
  }
}

let mounted = false;
let parts: PanelParts | null = null;
let prevKeywords: KeywordState = new Map();

export function __resetPanelForTest(): void {
  mounted = false;
  parts = null;
  prevKeywords = new Map();
}

function getCollapsed(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY_HUB_COLLAPSED]: false }, (v) =>
      resolve(Boolean(v[STORAGE_KEY_HUB_COLLAPSED])),
    );
  });
}

function setCollapsed(collapsed: boolean): void {
  chrome.storage.local.set({ [STORAGE_KEY_HUB_COLLAPSED]: collapsed });
}

function applyCollapsed(collapsed: boolean): void {
  if (!parts) return;
  parts.panel.style.display = collapsed ? "none" : "";
}

export async function mountPanel(): Promise<void> {
  if (mounted || document.querySelector(`.${CSS_CLASS_PANEL}`)) {
    mounted = true;
    return;
  }
  parts = buildPanel();
  parts.toggle.addEventListener("click", () => {
    const nowHidden = parts!.panel.style.display !== "none";
    applyCollapsed(nowHidden);
    setCollapsed(nowHidden);
  });
  document.body.appendChild(parts.panel);
  document.body.appendChild(parts.toggle);
  mounted = true;
  applyCollapsed(await getCollapsed());
  await updatePanel();
}

export async function updatePanel(): Promise<void> {
  if (!parts) return;
  await refreshActiveSites();
  const current = extractCurrentKeywords();
  const trends = computeTrends(current, prevKeywords);
  renderRows(parts.body, current, trends, activeSites);
  prevKeywords = current;
}
