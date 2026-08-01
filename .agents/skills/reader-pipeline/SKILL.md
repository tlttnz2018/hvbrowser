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
7. Dictionary taps send lightweight metadata from WebView to React Native: `lookupId`, segment id/index, and selected range. `app/index.tsx` reconstructs Chinese context from the RN segment registry, chooses best/exact lookup ranges, matches via `data/definition-word-index.json`, and reads exact `word`/`pinyin`/`hv`/`meaning` from SQLite.
8. Reader search has two scopes: current-reader search computes matches in React Native from the reader segment registry and sends only highlight ranges to WebView, while cross-chapter search fetches full offline chapter records only while scanning and keeps only result snippets in React state. Current-reader search caches prepared indexes per active segment registry/dictionary and schedules manual searches after interactions.
9. Offline book search keywords and compact cross-chapter result payloads are persisted in `offline_chapter_search_cache`; current-reader search records keyword history/counts only, not WebView result payloads.

## Invariants

- `htmlOrig` and `htmlHV` must stay aligned for the same page.
- Do not end reader loading before the `WebView` load-complete path runs.
- If a new page is starting, clear stale HTML before pairing the next URL with fresh content.
- `currentContentSource === 'offline'` changes navigation behavior; preserve that branch logic.
- Reader mode and full-site mode share the same `WebView` surface but differ in HTML shaping and behavior.
- HV/Chinese switching should stay single-WebView for now. Do not use dual mounted WebViews or hidden inactive-mode prewarming; that approach caused worse freezes because it prepared another full chapter and mounted another native WebView while the user was reading.
- `epub://...` and `txt://...` URLs are synthetic offline chapter identities. Bookmarks, back navigation, and link taps must resolve them through offline chapter lookup before any remote `loadPage` path continues.
- EPUB/TXT chapters may start with only `originalHtml`; Han-Viet HTML can be generated lazily on first open.
- Offline chapter resume state comes from persisted `lastOpenedAt`, not from whichever chapter the UI last highlighted in memory.
- Reader scroll position is memory-first. WebView scroll messages update an in-memory URL-keyed ratio cache for active-session restore and HV/Chinese toggle alignment; they must not write to SQLite directly or through debounce/timer loops.
- Persist `readerScrollRatio` only when switching from one offline story/book to another, using the previous book's active chapter and last in-memory ratio. Same-book Prev/Next should avoid scroll-position DB writes.
- The shaped reader HTML may be cached for the current requested mode. Build reader-mode WebView HTML in an after-interactions effect instead of during render, and avoid precomputing the inactive HV/Chinese mode on the foreground JS thread.
- Reader Worklets route pure reader shaping/search/conversion work through a guarded native-only `hvbrowser-reader` runtime when available. Web, failed native initialization, and task timeouts keep the existing RN-thread fallback.
- Offline library state is metadata-only for chapters. Full `originalHtml` / `convertedHvHtml` should not live in Zustand except as the active `htmlOrig` / `htmlHV` reader pair.
- Reader annotation must keep DOM payload small: `.hv-word` spans should carry only segment id/index metadata for tap/highlight targeting. Full Chinese context/sentence construction, current-reader search matching, word-range selection, pinyin/HV/meaning, and dictionary matching belong to React Native / SQLite lookup.
- Current-reader search results live in `useWebPageStore` as transient result metadata. Search matching is computed in React Native from the reader segment registry; injected JS should only register RN-provided ranges, highlight spans, and scroll to targets.
- Reuse the current-reader prepared index cache in `app/index.tsx`; do not rebuild Chinese/Han-Viet indexes per keystroke/query unless the segment registry or dictionary changed.
- Current-reader search highlights should cover every token in a matched phrase. Store target ranges in injected JS and scroll to the first target; do not collapse multi-word or multi-character matches to only the first token.
- Cross-chapter search may call `getOfflineChapterById()` / `getOfflineChapterByUrl()` for full bodies, but component state should keep only `OfflineChapterTextMatch` snippets/results. Do not retain searched chapter HTML after each iteration.
- Cross-chapter search results should include every occurrence in a matching chapter, not just the first match. Keep `occurrenceIndex` stable enough for `readerSearchAutoJumpRequest` to re-resolve the target inside the opened WebView.
- Persisted search acceleration belongs in `offline_chapter_search_cache`: store compact match snippets/occurrence indexes with a chapter signature, plus keyword `search_count` / `last_searched_at` for recent/top suggestions.
- Current-reader search may call keyword-history recording for suggestions, but it must not persist WebView-local results or clear/replace an existing cross-chapter `result_json` / `chapter_signature`.
- Cross-chapter result jumps should use `readerSearchAutoJumpRequest`; the target chapter should open first, then RN segment-registry search/jump should run after WebView render.
- Cross-chapter result lists must remain `readerSearchScope === 'chapters'` while the user navigates them. Installing chapter results should clear pending current-reader search requests, and current-reader responses must not overwrite chapter-scope results.
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
- Reader taps and bottom toolbar lag because high-frequency scroll events, same-book chapter navigation, or HV/Chinese toggles write `readerScrollRatio` to SQLite instead of keeping position memory-only.
- Reader taps can still lag if WebView scroll-position messages are too chatty; keep scroll bridge messages deduped/throttled and force-post only around load/touch end/page hide.
- Mode switching freezes because an optimization mounts two WebViews, warms the inactive mode, or otherwise prepares both full chapter render trees at once.
- Mode switching freezes if reader HTML/dictionary segment shaping runs synchronously during render instead of after interactions or in a future worker runtime.
- Long reading sessions lag because offline library hydration or queue updates retain every downloaded chapter body in app state.
- Search causes lag because chapter text search accumulates full chapter records, DOM tokens, or converted chapter text in long-lived state instead of retaining only snippets/result metadata, compact RN segment indexes, or compact SQLite cache rows.
- Reader search visually highlights only the first word/character of a phrase because the match map stored a single DOM target instead of the full token span.
- Cross-chapter search shows only one result per chapter because a chapter-id keyed state map stores a single match instead of an array of occurrences.
- Cross-chapter search jumps land wrong because an occurrence index from offline text search was treated as a stable DOM offset instead of being re-resolved in the opened chapter.
- Reader-only keyword history overwrites cached cross-chapter `result_json`, making repeat cross-chapter search slow again.
- Cross-chapter Prev/Next breaks because a stale current-reader WebView search response replaces chapter-scope results after the user opens a chapter result.
- Search/dictionary lookup regresses if WebView spans reintroduce sentence/context/search-index logic, per-character pinyin/HV/tooltip payloads, or if SQLite lookup stops selecting `hv`.

## Change Strategy

- For loading UX, keep state ownership centralized in `useAppStore`.
- Prefer extending `usePageLoader` and `app/index.tsx` instead of adding duplicate component-local loading state.
- Treat `onLoadStart` / `onLoadEnd` and injected-script completion paths as part of the reader pipeline, not just presentation details.
- Reader worker tasks must stay pure and fallback-safe. Keep encoding, cleanup, SQLite, WebView commands, and React state mutation outside Worklets; benchmark serialization cost with large chapters on device.
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
