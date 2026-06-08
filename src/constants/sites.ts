import type { TargetSite } from "../lib/storage";

export const DEFAULT_TARGET_SITES: TargetSite[] = [
  {
    name: "아카라이브 (나무위키 핫나우)",
    label: "아카",
    url: "https://arca.live/b/namuhotnow?target=all&keyword={keyword}",
  },
  {
    name: "네이버 검색",
    label: "네이버",
    url: "https://search.naver.com/search.naver?query={keyword}",
  },
  {
    name: "구글 검색",
    label: "구글",
    url: "https://www.google.com/search?q={keyword}",
  },
  {
    name: "X (실시간)",
    label: "X",
    url: "https://x.com/search?q={keyword}&f=live",
  },
  {
    name: "DCInside 검색",
    label: "DC",
    url: "https://search.dcinside.com/combine/q/{keyword}",
  },
];
