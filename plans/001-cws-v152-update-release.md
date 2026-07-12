# Plan 001: Cut v1.5.2 and publish the update to the (already live) Chrome Web Store listing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1d55017..HEAD -- package.json manifest.json CHANGELOG.md STORE_LISTING.md content.js content.js.bak`
> If any of these changed since this plan was written, compare the
> "Current state" facts against the live repo before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (repo work) / operator gate at publish
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `1d55017`, 2026-07-12

## Why this matters

The extension **is live** on the Chrome Web Store: v1.5.1, published
2026-06-12, item ID `fhmagpkcdpcnmbihkgdcmabidcmdmpgl` (42 users, 5.0★).
But the repo has drifted from the store in both directions:

- Unshipped fixes sit in `CHANGELOG.md [Unreleased]` (empty-catch logging,
  `chrome.runtime.lastError` checks, save-failure UI), plus dependency patches
  merged after the 1.5.1 upload.
- The **live listing copy still describes the old v1.1-era "왜?" 링크
  behavior**, while the published binary (1.5.1) actually ships 💬 토론글
  직링크 / 🔎 검색 smart links and multi-site quick links — users install
  based on a description of a feature set two versions old.
- Repo docs are stale: `CHANGELOG.md` latest released section is 1.2.0;
  `STORE_LISTING.md` references version 1.2.0.
- This machine has no CWS credentials (`npm run deploy:status` fails:
  `Option "extensionId" is required`) — the `.env` per `WEBSTORE_CLI_SETUP.md`
  was never set up here (or was lost), so the one-command deploy pipeline is
  currently unusable locally.

This plan cuts a clean v1.5.2, backfills the changelog, refreshes the listing
copy, and hands the operator a short publish checklist (CLI credentials setup
OR manual dashboard upload).

## Current state

- `package.json` version `1.5.1`, `manifest.json` version `1.5.1` — they match,
  and `scripts/build-release.mjs` **exits 1 if they ever differ**. Zip contents
  (per build-release.mjs comment): `manifest.json`, `dist/`, `icons/`,
  `styles.css` at archive root → `release/namu_arca_linker-v{version}.zip`,
  hard limit 10 MB.
- Store state (checked 2026-07-12): published version **1.5.1** — identical to
  the repo version, so the only publishable delta is what lands in this plan's
  v1.5.2.
- `manifest.json` (MV3): `host_permissions: ["https://namu.wiki/*", "https://arca.live/*"]`,
  `permissions: ["storage", "declarativeNetRequest"]`, background service
  worker `dist/background.js`, content script `dist/content.js` on
  `https://namu.wiki/*`, popup + options pages. This permission set **already
  passed CWS review** for 1.5.1 — do not change it.
- `CHANGELOG.md` is stale: latest released section is `[1.2.0] - 2025-12-01`;
  an `[Unreleased]` section holds three small fixes. Versions
  1.3.0 / 1.4.0 / 1.5.0 / 1.5.1 shipped without changelog entries.
  Version-bump commits to anchor the backfill: `f6cd408` (1.3.0, multi-site
  quick links), `aa3e0c3` (1.4.0, hub panel — **later removed again** in
  `485c26c`/`46d7d7e`), `15ab526` (1.5.0, namu 2.0 Phase 1: background SW +
  arca app API smart links + declarativeNetRequest UA spoof), 1.5.1 (find with
  `git log --oneline --all -p -- package.json | grep -B8 '1.5.1'` — likely the
  dependabot/lint sweep around `a530949`).
- `STORE_LISTING.md` — copy-paste-ready store listing, but stale:
  - Lines 5–6 and 207 reference version `1.2.0` and
    `release/namu_arca_linker-v1.2.0.zip`.
  - The permissions-justification section (~line 74) mentions ONLY the
    `namu.wiki` host permission — predates `arca.live`, `storage`,
    `declarativeNetRequest`.
  - The description (~line 56) describes the old "왜?" 링크 behavior.
- `PRIVACY.md` exists (added `9e774f7` for CWS).
- Legacy git-tracked files to remove (all superseded by `src/` + `dist/`;
  manifest references `dist/content.js`, NOT the root `content.js`):
  `content.js` (18 KB, pre-TypeScript), `content.js.bak`,
  `.eslintrc.cjs.bak-2026-05-27` (eslint 9 flat config landed in `291fd09`).
- No git tags exist in this repo. Commit style: conventional commits
  (`feat(panel): ...`, `fix(deps): ...`, `chore: bump to 1.5.0 ...`).
- `WEBSTORE_CLI_SETUP.md` documents the `.env` needed by
  `deploy:upload`/`deploy:publish`/`deploy:status`: `EXTENSION_ID`
  (= `fhmagpkcdpcnmbihkgdcmabidcmdmpgl`, public, safe to write), `CLIENT_ID`,
  `CLIENT_SECRET`, `REFRESH_TOKEN` (Google OAuth — operator-only secrets).

## Commands you will need

| Purpose        | Command            | Expected on success                          |
|----------------|--------------------|----------------------------------------------|
| Install        | `npm install`      | exit 0                                       |
| Tests          | `npm run test:run` | all pass                                     |
| Lint           | `npm run lint`     | exit 0                                       |
| Build + zip    | `npm run release`  | `release/namu_arca_linker-v1.5.2.zip` (<10MB) |

## Scope

**In scope** (the only files you should modify/create/delete):
- `CHANGELOG.md`
- `package.json` + `manifest.json` (version bump only)
- `STORE_LISTING.md`
- Delete: `content.js`, `content.js.bak`, `.eslintrc.cjs.bak-2026-05-27` (git rm)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- Anything under `src/`, `dist/`, `scripts/`, `.github/` — this is a release
  hygiene + publish plan, zero behavior change.
- `manifest.json` permissions — the current set passed review; changing it
  re-triggers permission review.
- `.env` / CWS API credentials — operator-only (Step 7).
- `PRIVACY.md` — content is current; only link to it.

## Git workflow

- Branch: work directly on `main` is acceptable for this repo (solo project,
  release commits land on main), or `advisor/001-cws-v152` if unsure.
- Conventional commits. Suggested split: `docs(changelog): backfill 1.3.0–1.5.1`,
  `chore: remove legacy pre-TypeScript artifacts`,
  `docs(store): refresh listing copy for 1.5.x feature set`,
  `chore: release v1.5.2`.
- Tag the release commit `v1.5.2` (first tag in this repo — fine).
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Backfill CHANGELOG and cut v1.5.2

- Add sections `[1.3.0]`, `[1.4.0]`, `[1.5.0]`, `[1.5.1]` with dates taken
  from `git log --format="%h %ad %s" --date=short` at the version-bump commits
  listed in "Current state". Keep entries short (3–6 bullets each), Korean,
  matching the existing 1.1/1.2 style. For 1.4.0, note the hub panel was added
  and then removed again in 1.5.0 (`485c26c`) — don't advertise a removed
  feature as current.
- Rename `[Unreleased]` → `[1.5.2] - <today's date>` and keep its three Fixed
  bullets; add the dependency patches since 1.5.1 (`a530949`, `bb49e1e` era)
  as a Changed/Security bullet; add a fresh empty `[Unreleased]` on top.

**Verify**: `grep -n "## \[1\." CHANGELOG.md` → shows 1.5.2, 1.5.1, 1.5.0, 1.4.0, 1.3.0, 1.2.0, 1.1.0 (+ older)

### Step 2: Remove legacy artifacts

`git rm content.js content.js.bak .eslintrc.cjs.bak-2026-05-27`

**Verify**: `git status` shows the three deletions and nothing else unexpected;
`grep -n "content.js" manifest.json` still shows only `dist/content.js`.

### Step 3: Bump version to 1.5.2

Set `"version": "1.5.2"` in BOTH `package.json` and `manifest.json`.

**Verify**: `node -e "console.log(require('./package.json').version === require('./manifest.json').version)"` → `true`

### Step 4: Refresh STORE_LISTING.md (source of truth for the dashboard copy)

- Replace all `1.2.0` version/zip references with `1.5.2`
  (`release/namu_arca_linker-v1.5.2.zip`).
- Update the feature description (~line 56) to the current behavior: 실검
  키워드 옆 💬(매칭된 실검챈 토론글 직링크) / 🔎(검색) 스마트 링크, 멀티
  사이트 퀵링크, 실시간 검색어 변경 자동 추적. Remove/adjust copy describing
  the removed right-dock panel or the old single "왜?" 링크 if present.
- Rewrite the permissions-justification section to cover the CURRENT manifest:
  - `namu.wiki` host: 실검 링크 주입 (기존 문구 유지)
  - `arca.live` host: 백그라운드 서비스 워커가 실검챈(namuhotnow) 게시글
    목록을 조회해 검색어와 매칭하기 위해 필요
  - `storage`: 사용자 옵션(대상 사이트 목록, 토글 상태) 저장
  - `declarativeNetRequest`: arca.live API 요청에 앱 User-Agent를 지정하기
    위한 요청 헤더 수정 (namu.wiki/arca.live 요청에만 적용, 추적 없음)
- Confirm a privacy-policy URL line exists pointing at PRIVACY.md
  (`https://github.com/jellive/namu_arca_linker/blob/main/PRIVACY.md` —
  verify the path against `git remote -v` first).

**Verify**: `grep -n "1\.2\.0" STORE_LISTING.md` → no matches (CHANGELOG's
historical 1.2.0 section stays — expected).

### Step 5: Build the submittable zip

`npm run release` (runs test:run + lint + build + zip).

**Verify**: exit 0 and `unzip -l release/namu_arca_linker-v1.5.2.zip` shows
`manifest.json`, `dist/`, `icons/`, `styles.css` and does NOT contain root
`content.js` or any `.bak`.

### Step 6: Commit + tag

Commit the changes (split per Git workflow above), then `git tag v1.5.2`.

**Verify**: `git log --oneline -4` shows the release commits; `git tag` → `v1.5.2`

### Step 7: Publish the update — OPERATOR CHECKLIST (report, don't do)

The executor CANNOT do this step (needs Google account credentials); output it
as a checklist for the operator. Two routes — A is one-time setup that makes
every future release one command:

**Route A — restore the CLI pipeline (recommended):**
1. `WEBSTORE_CLI_SETUP.md`의 절차대로 `.env` 구성:
   `EXTENSION_ID=fhmagpkcdpcnmbihkgdcmabidcmdmpgl` + Google Cloud OAuth
   `CLIENT_ID`/`CLIENT_SECRET`/`REFRESH_TOKEN` (문서의 2–4단계).
2. `npm run deploy:status` → PUBLISHED에 1.5.1이 보이면 자격증명 OK.
3. `npm run deploy:upload && npm run deploy:publish`.
4. 심사 통과 후 `npm run deploy:status`로 1.5.2 게시 확인.

**Route B — manual dashboard upload (no setup):**
1. https://chrome.google.com/webstore/devconsole → 기존 항목(나무위키 실검
   아카라이브 링커) → 패키지 탭 → `release/namu_arca_linker-v1.5.2.zip` 업로드.
2. 제출 → 심사(보통 1–3일).

**Either route, additionally (one-time):** 대시보드 스토어 등록정보의 상세
설명이 아직 v1.1 시절 "왜?" 링크 문구임 — Step 4에서 갱신한
`STORE_LISTING.md` 설명으로 교체하고, 스크린샷이 현재 UI(💬/🔎 링크)와
다르면 재촬영해서 교체 (스테일 스크린샷은 리젝 사유).

## Done criteria

- [ ] `npm run release` exits 0 and produces `release/namu_arca_linker-v1.5.2.zip`
- [ ] `package.json` and `manifest.json` both say `1.5.2`
- [ ] CHANGELOG has 1.3.0–1.5.2 sections; no `[Unreleased]` content left behind
- [ ] `git ls-files | grep -E "^content\.js|\.bak"` → no matches
- [ ] `grep -n "1\.2\.0" STORE_LISTING.md` → no matches
- [ ] Commit(s) + `v1.5.2` tag exist; operator checklist (Step 7) reported verbatim
- [ ] `plans/README.md` status row updated

## STOP conditions

- `npm run test:run` or `npm run lint` fails before you changed anything
  (pre-existing breakage — not this plan's job to fix).
- `npm run release` fails twice after a reasonable fix attempt.
- The store's published version is no longer 1.5.1 (someone shipped meanwhile)
  — re-check the delta before cutting 1.5.2.
- The zip exceeds 10 MB — something is wrong with the build output; do not
  submit.
- Any step seems to require editing files under `src/` or manifest
  permissions — out of scope.

## Maintenance notes

- Once Route A's `.env` exists, future releases are `npm run deploy` (release
  + upload + publish in one). Keep `.env` out of git (already ignored) and
  never rsync/copy it anywhere.
- The arca.live app-API usage (User-Agent spoof via declarativeNetRequest)
  already passed review in 1.5.1, but the **listing text** never explained it;
  the Step 4 justification wording future-proofs re-reviews.
- Screenshot capture needs a moment when 나무위키 실검 has neutral keywords —
  see the checklist already in STORE_LISTING.md.
