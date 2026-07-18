---
name: reader-pipeline
description: Use when working on hvbrowser reader loading, page transitions, WebView rendering, Han-Viet conversion flow, dictionary-sheet lookup, reader search, cross-chapter search, or bugs where URL, loading, and rendered HTML get out of sync. Focuses on the minimal files and pitfalls for the reader pipeline.
---

# Reader Pipeline

Use this skill for reader-load UX, WebView behavior, HTML conversion flow, or navigation/render mismatches.

## Read First

1. [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts)
2. [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx)
3. [`stores/useAppStore.ts`](/Users/saigon/dev/hvbrowser/stores/useAppStore.ts)
4. [`db/offline.ts`](/Users/saigon/dev/hvbrowser/db/offline.ts) when the issue involves offline chapters, EPUBs, bookmarks, or reader history

Read these only if needed:

- [`utils/downloader.ts`](/Users/saigon/dev/hvbrowser/utils/downloader.ts) for fetch, charset, and HV conversion timing
- [`utils/cleanup.ts`](/Users/saigon/dev/hvbrowser/utils/cleanup.ts) for cleanup cost or output issues
- [`utils/webview-html.ts`](/Users/saigon/dev/hvbrowser/utils/webview-html.ts) for injected base href and reader HTML shaping
- [`utils/definition-dictionary.ts`](/Users/saigon/dev/hvbrowser/utils/definition-dictionary.ts) for dictionary-sheet lookup, generated word-index matching, and exact SQLite definition reads
- [`stores/useWebPageStore.ts`](/Users/saigon/dev/hvbrowser/stores/useWebPageStore.ts) for transient reader mode state
- [`components/toolbars/WebTextToolbar.tsx`](/Users/saigon/dev/hvbrowser/components/toolbars/WebTextToolbar.tsx) for current-reader search UI, TOC search, and cross-chapter result navigation
- [`components/OfflineLibraryList.tsx`](/Users/saigon/dev/hvbrowser/components/OfflineLibraryList.tsx) for offline-library chapter search and opening search results
- [`utils/offline-chapter-search.ts`](/Users/saigon/dev/hvbrowser/utils/offline-chapter-search.ts) for Chinese/Han-Viet search normalization and snippet matching

## Pipeline

1. URL enters through the app shell and calls `usePageLoader`.
2. `usePageLoader` normalizes the URL, updates history, and drives loading state.
3. Remote pages are downloaded, cleaned, converted to Han-Viet, then stored as `htmlOrig` and `htmlHV`.
4. `app/index.tsx` chooses the active HTML variant and renders it in the `WebView`.
5. Injected bridge code handles link interception, scroll reporting, dismissal taps, and reader restoration.
6. Offline EPUB/TXT chapters reuse the same reader surface, but their `epub://...` / `txt://...` URLs must resolve back to offline chapter records instead of going through remote fetch logic.
7. Dictionary taps send Chinese context/indices from WebView to React Native; native code matches via `data/definition-word-index.json` and reads exact `word`/`pinyin`/`hv`/`meaning` from SQLite.
8. Reader search has two scopes: current-reader search builds a temporary index inside the active WebView DOM, while cross-chapter search fetches full offline chapter records only while scanning and keeps only result snippets in React state.

## Invariants

- `htmlOrig` and `htmlHV` must stay aligned for the same page.
- Do not end reader loading before the `WebView` load-complete path runs.
- If a new page is starting, clear stale HTML before pairing the next URL with fresh content.
- `currentContentSource === 'offline'` changes navigation behavior; preserve that branch logic.
- Reader mode and full-site mode share the same `WebView` surface but differ in HTML shaping and behavior.
- `epub://...` and `txt://...` URLs are synthetic offline chapter identities. Bookmarks, back navigation, and link taps must resolve them through offline chapter lookup before any remote `loadPage` path continues.
- EPUB/TXT chapters may start with only `originalHtml`; Han-Viet HTML can be generated lazily on first open.
- Offline chapter resume state comes from persisted `lastOpenedAt`, not from whichever chapter the UI last highlighted in memory.
- Offline library state is metadata-only for chapters. Full `originalHtml` / `convertedHvHtml` should not live in Zustand except as the active `htmlOrig` / `htmlHV` reader pair.
- Reader dictionary annotation must keep DOM payload small: `.hv-word` spans should carry Chinese character and segment metadata only; pinyin/HV/meaning belong to native lookup results.
- Current-reader search results live in `useWebPageStore` as transient result metadata. The full text index is built in injected JS from the active DOM and should not be persisted or mirrored into Zustand.
- Cross-chapter search may call `getOfflineChapterById()` / `getOfflineChapterByUrl()` for full bodies, but component state should keep only `OfflineChapterTextMatch` snippets/results. Do not retain searched chapter HTML after each iteration.
- Cross-chapter result jumps should use `readerSearchAutoJumpRequest`; the target chapter should open first, then active-DOM search/jump should run after WebView render.
- `TrungVietDictionary.sqlite` includes `hv`; app imports it as `TrungVietDictionary-v2.sqlite`. Bump the import name when the bundled schema changes.
- `DataHanVietUni.json` is the merged Han-Viet character map. `newChinesePhienAm.json`, `PinyinData.json`, and `pinyin-pro` should stay removed unless the dictionary architecture changes.

## Common Failure Modes

- Loading overlay disappears after download but before conversion or WebView readiness.
- New URL briefly renders old HTML because the old page was not cleared first.
- Injected JS changes break navigation interception or reader scroll restoration.
- A fix updates only `htmlOrig` or only `htmlHV`.
- A loading boolean grows ambiguous; use a stage enum if the UI needs real progress states.
- EPUB bookmarks or cross-chapter links open the wrong content because a synthetic `epub://...` URL was treated like a remote URL.
- Resume UI drifts between the in-reader TOC and the offline library because one side used transient session state instead of persisted chapter-open timestamps.
- Long reading sessions lag because offline library hydration or queue updates retain every downloaded chapter body in app state.
- Search causes lag because chapter text search accumulates full chapter records, DOM tokens, or converted chapter text in long-lived state instead of retaining only snippets/result metadata.
- Cross-chapter search jumps land wrong because an occurrence index from offline text search was treated as a stable DOM offset instead of being re-resolved in the opened chapter.
- Dictionary lookup regresses if WebView spans reintroduce per-character pinyin/HV/tooltip payloads or if SQLite lookup stops selecting `hv`.

## Change Strategy

- For loading UX, keep state ownership centralized in `useAppStore`.
- Prefer extending `usePageLoader` and `app/index.tsx` instead of adding duplicate component-local loading state.
- Treat `onLoadStart` / `onLoadEnd` and injected-script completion paths as part of the reader pipeline, not just presentation details.
- Regenerate `data/definition-word-index.json` with `bun run generate:definition-index` after changing dictionary words.
- Re-sync SQLite `hv` with `bun run merge:han-viet-dictionary` after changing `DataHanVietUni.json` or the dictionary DB.

## Validation

- Run `bun lint`
- Run `bun format:check`
- Run `bun typecheck`
- Manually sanity-check:
  - remote page load
  - Han-Viet toggle
  - full-site vs reader mode
  - in-page link navigation
  - reader scroll restoration
  - any loading overlay or status text you changed
