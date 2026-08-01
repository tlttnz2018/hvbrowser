# AGENTS.md

## Purpose

- This repository is a single-app Expo / React Native project for browsing Chinese novel sites, converting page text to Han-Viet, and saving stories/chapters for offline reading.
- Future agents should treat it as a WebView-first reader app with a custom offline pipeline, not as a generic CRUD/mobile app.
- Architecture decisions and recent EPUB/offline-reader decisions now live in [`docs/ADR.md`](/Users/saigon/dev/hvbrowser/docs/ADR.md). Use this file when a task touches navigation, persistence, offline reading, or reader-shell structure.

## Recent Memory

- EPUB imports run through persisted background jobs in `epub_import_jobs`; they should resume through the app-managed queue instead of blocking the reader.
- EPUB chapters are stored as normal offline chapters with synthetic `epub://story/<id>/chapter/<n>` URLs and lazy `convertedHvHtml` generation.
- TXT imports are split into normal offline chapters with synthetic `txt://story/<id>/chapter/<n>` URLs and lazy `convertedHvHtml` generation; they open directly in the reader after import.
- Any `epub://...` or `txt://...` open path, including bookmarks and history restores, must resolve through offline chapter lookup before remote loading.
- Library tabs now share the same mobile behavior: the hero/info area scrolls away, while the tab row and tab-specific search/filter controls stay sticky.
- Offline chapters now persist `lastOpenedAt`; use that durable field for resume behavior instead of transient UI state.
- The in-reader TOC stays focused on `All` / `Current`, while the offline library book browser uses `Last` as a one-chapter resume view.
- Offline library backups now use a single streaming ZIP archive to keep RAM and temp-disk use bounded on mobile devices.
- Backup restore merges remote stories by sanitized story URL, and merges EPUB stories by metadata-first matching with filename fallback/tiebreaker.
- Backups store chapter `originalHtml` only; restored chapters regenerate `convertedHvHtml` lazily through the reader path.
- Remote chapters restored from queued/downloading backup entries come back as `queued`, while existing downloaded content should not be downgraded by import.
- Offline library hydration keeps chapter rows metadata-only in Zustand; full `originalHtml` / `convertedHvHtml` should be fetched by id/url only for active reads, backups, or explicit text search.
- Reader scroll positions are memory-first. Scroll messages update only in-memory URL ratios for HV/Chinese toggle alignment; persist `readerScrollRatio` to SQLite only when leaving the active book for a different story, not during normal scrolling or same-book Prev/Next.
- Reader mode uses one active WebView. Do not reintroduce dual mounted HV/Chinese WebViews or inactive-mode prewarming; that made mode switching freeze on large chapters. Cache only the currently requested shaped HTML, and build reader-mode WebView HTML after interactions instead of during render.
- Reader search has two scopes: current-reader search computes matches in React Native from the reader segment registry and sends only highlight ranges to WebView, while cross-chapter search fetches full chapter bodies only during the search loop and stores only match snippets/results in UI state. Current-reader search indexes are cached per active segment registry/dictionary and manual searches are scheduled after interactions to keep taps smoother.
- Cross-chapter search returns every keyword occurrence in matching chapters, not just the first chapter hit; keep occurrence indexes aligned with WebView auto-jump resolution.
- Offline book search keywords and cached cross-chapter results live in `offline_chapter_search_cache`; current-reader search records keyword history/counts only and must not persist WebView-local result payloads.
- Dictionary lookup is React Native-owned business logic. Reader HTML carries only segment id/index metadata needed by the bridge for taps/highlights; RN keeps the Chinese segment registry, chooses lookup ranges, uses `data/definition-word-index.json` for word matching, then queries `data/TrungVietDictionary.sqlite` for exact `word`, `pinyin`, `hv`, and `meaning` content.
- Reader Worklets are enabled with Babel plugin setup, Metro `inlineRequires`, and a guarded native-only `hvbrowser-reader` runtime. Reader HTML shaping, current-reader search prewarm/cold manual search, and pure Han-Viet conversion are worker-routed with timeout/RN fallbacks; encoding, cleanup, SQLite definition lookup, and WebView commands stay on RN/native paths.
- The definition DB is imported as `TrungVietDictionary-v2.sqlite`; bump this name again if the bundled SQLite schema changes.
- `DataHanVietUni.json` is the merged Han-Viet character map. `newChinesePhienAm.json`, `PinyinData.json`, and `pinyin-pro` were removed; do not reintroduce pinyin JSON for dictionary sheet lookup.

## Current Stack

- Expo 54 + React Native 0.81 + React 19
- Expo Router for the app shell (`app/_layout.tsx`, `app/index.tsx`)
- Zustand for client state (`stores/useAppStore.ts`, `stores/useWebPageStore.ts`)
- Expo SQLite + custom Kysely dialect for persistence (`db/`)
- `react-native-webview` for rendering source pages and transformed reader HTML
- TypeScript in `strict` mode

## High-Level Architecture

For stable architectural decisions, prefer the ADR file over growing this section indefinitely.

### App Shell

- [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx) owns the top-level UI chrome:
  - search bar
  - reader/library controls
  - bookmark editor modal
  - offline download pickers
  - library drawer
- [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx) owns the `WebView` and in-page bridge logic.

### State Split

- [`stores/useAppStore.ts`](/Users/saigon/dev/hvbrowser/stores/useAppStore.ts) holds durable app state and async workflows:
  - current page HTML
  - current URL/title/history
  - bookmarks
  - offline stories/chapters
  - download queue
  - modal/picker state
- [`stores/useWebPageStore.ts`](/Users/saigon/dev/hvbrowser/stores/useWebPageStore.ts) holds transient reader/view state:
  - Han-Viet toggle
  - full-site vs reader mode
  - font size
  - library drawer state
  - theme preference

### Data Flow

1. User enters or taps a URL.
2. [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts) normalizes the URL, downloads HTML, cleans it, converts it to HV text, and stores both original/HV variants.
3. [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx) selects which HTML variant to render in the `WebView`.
4. WebView click/scroll messages are bridged back into React Native for navigation, drawer dismissal, and reader scroll restoration.
5. Offline actions flow through [`hooks/useOfflineDownloads.ts`](/Users/saigon/dev/hvbrowser/hooks/useOfflineDownloads.ts), then into SQLite-backed records in [`db/offline.ts`](/Users/saigon/dev/hvbrowser/db/offline.ts).

## Key Files By Responsibility

- [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts): remote/offline page loading entry point
- [`hooks/useOfflineDownloads.ts`](/Users/saigon/dev/hvbrowser/hooks/useOfflineDownloads.ts): role detection and queueing workflow for home/index/chapter pages
- [`utils/downloader.ts`](/Users/saigon/dev/hvbrowser/utils/downloader.ts): fetch + charset detection + HV conversion
- [`utils/cleanup.ts`](/Users/saigon/dev/hvbrowser/utils/cleanup.ts): HTML cleanup before conversion
- [`utils/txt-import.ts`](/Users/saigon/dev/hvbrowser/utils/txt-import.ts): streamed TXT file import, chunking, encoding, and `txt://` offline chapter creation
- [`utils/webview-html.ts`](/Users/saigon/dev/hvbrowser/utils/webview-html.ts): base href injection and reader HTML shaping
- [`utils/definition-dictionary.ts`](/Users/saigon/dev/hvbrowser/utils/definition-dictionary.ts): dictionary word-index lookup and exact SQLite definition reads
- [`utils/offline-chapter-search.ts`](/Users/saigon/dev/hvbrowser/utils/offline-chapter-search.ts): Chinese/Han-Viet text normalization and snippet generation for cross-chapter search
- [`db/bookmarks.ts`](/Users/saigon/dev/hvbrowser/db/bookmarks.ts): bookmark migrations and CRUD
- [`db/offline.ts`](/Users/saigon/dev/hvbrowser/db/offline.ts): offline story/chapter schema, migrations, and queries
- [`utils/offline-download-queue.ts`](/Users/saigon/dev/hvbrowser/utils/offline-download-queue.ts): single-flight offline queue loop
- [`components/LibraryView.tsx`](/Users/saigon/dev/hvbrowser/components/LibraryView.tsx): bookmark/source/offline library UI
- [`theme.ts`](/Users/saigon/dev/hvbrowser/theme.ts): central theme tokens for light/dark reader chrome

## Important Invariants

### Reader / WebView

- `htmlOrig` and `htmlHV` are the source of truth for rendered content. Keep both in sync when changing page-loading behavior.
- The app prepends `\ufeff` when storing HTML for the reader. Be careful not to accidentally double-strip or double-add BOM handling.
- Reader mode vs full-site mode is controlled by `useWebPageStore().fullSite`.
- Reader loading is a pipeline, not just a fetch spinner. Treat the loading UI as covering:
  - downloading
  - cleanup / HV conversion
  - WebView rendering / injected-script readiness
- Prefer stage-based loading state for reader transitions instead of a single boolean when the UI needs to explain progress.
- When starting a new page transition, clear stale `htmlOrig` / `htmlHV` before pairing the next URL with freshly loaded HTML. This avoids showing the previous page under a new URL while loading.
- `app/index.tsx` injects bridge code for:
  - link interception
  - page press dismissal
  - scroll position reporting/restoration
  - dictionary-sheet lookup messages
- Changes to injected JS can easily break navigation or reader restoration. Re-test on device/simulator when touching it.
- For reader loading UX changes, do not mark loading complete until the `WebView` load-complete path has run.
- Reader scroll restoration uses an in-memory URL-keyed ratio cache for active-session alignment, especially HV/Chinese toggles. Do not write scroll position to SQLite from scroll events, timers, debounce loops, or same-book chapter navigation; only persist the previous book's active chapter position when `storyId` changes.
- Keep HV/Chinese mode switching on a single WebView with a small current-mode HTML cache. Prepare reader-mode HTML in an after-interactions effect, not inside render. Avoid mounting separate hidden WebViews or preparing the inactive mode in the background unless a future implementation proves it does not block the JS thread or native WebView rendering on large chapters.
- Reader-mode annotation should keep the WebView DOM light: `.hv-word` spans carry only segment id/index metadata for tap/highlight targeting. Full Chinese sentence/context, current-reader search matching, lookup range selection, pinyin/HV/meaning, and dictionary matching belong to React Native / SQLite lookup.

### Reader Search

- Search inside the current reader is React Native-owned. `stores/useWebPageStore.ts` issues `readerSearchRequest` / jump requests, `app/index.tsx` computes Chinese/Han-Viet matches from the reader segment registry, and injected JS only registers RN-provided result ranges, highlights spans, and scrolls to targets.
- Current-reader search should reuse the prepared index cache in `app/index.tsx` instead of rebuilding Chinese/Han-Viet indexes for every query. Manual searches should stay scheduled after interactions unless a future worker-runtime implementation replaces the JS-thread calculation.
- Current-reader search highlights should cover every token in a matched phrase. Store and jump to match target ranges in injected JS; do not collapse a multi-word/multi-character match to only its first `.hv-word`.
- Search across chapters is offline-library text search. It may call `getOfflineChapterById()` to inspect full chapter HTML, but it should keep only `OfflineChapterTextMatch` snippets in component state and release full chapter records after each iteration.
- Search across chapters should surface all occurrences per chapter. `utils/offline-chapter-search.ts` returns per-occurrence snippets and occurrence indexes; result lists may contain multiple rows for the same chapter.
- Do not add long-lived full-text indexes or arrays of chapter HTML to Zustand for search. Persist only compact SQLite search cache entries in `offline_chapter_search_cache`, keyed by story/query/signature, and keep full chapter bodies out of long-lived state.
- Current-reader search may update the offline book keyword history/search count so recent/top suggestions work, but it must not overwrite existing cached cross-chapter `result_json` / `chapter_signature` for that keyword.
- Cross-chapter result jumps should use `readerSearchAutoJumpRequest` so opening the target chapter can compute current-reader matches from the RN segment registry and jump after WebView render, instead of carrying DOM offsets between chapters.
- Cross-chapter result lists must stay in `readerSearchScope === 'chapters'` after opening a result. Clear or ignore pending current-reader search requests when installing chapter results so late `reader-search-results` WebView messages cannot replace the chapter list and break Prev/Next across chapters.

### Dictionary Lookup

- Keep dictionary matching and definition content separate:
  - `data/definition-word-index.json` is generated from SQLite words and loaded for in-memory matching.
  - `TrungVietDictionary.sqlite` stores definition content and includes `word`, `pinyin`, `meaning`, and `hv`.
  - `utils/definition-dictionary.ts` caches only the active Chinese context/sentence, not a global definition cache.
- Keep dictionary lookup business logic out of injected HTML. WebView tap messages should send metadata such as `lookupId`, `segmentId`, `characterIndex`, and selected range; `app/index.tsx` should reconstruct the Chinese context from the RN segment registry and decide best/exact lookup ranges.
- `react-native-worklets` routes pure reader shaping/search/conversion work through the guarded reader runtime when available. Keep Web/failed-native fallback on RN, and benchmark large chapter serialization on device before assuming the worker path is faster for every chapter.
- Regenerate the word index with `bun run generate:definition-index` after changing dictionary words.
- Repopulate SQLite `hv` from the merged Han-Viet map with `bun run merge:han-viet-dictionary` after changing `DataHanVietUni.json` or the dictionary DB.

### Navigation / History

- `usePageLoader.loadPage()` pushes history before loading the new page.
- `loadOfflineChapter()` sets `currentContentSource` to `offline`; several navigation branches depend on that flag.
- `app/index.tsx` ignores some WebView navigation events (`about:`, `data:`, `postMessage`, offline mode). Preserve those guards unless you are intentionally changing WebView behavior.

### Offline Library

- Offline records live in the same SQLite DB file as bookmarks, but in separate Kysely schemas/modules.
- Chapter URLs are unique in `offline_chapters`. Re-queue logic depends on that uniqueness.
- Offline chapter resume state is stored durably per chapter via `lastOpenedAt`.
- Per-chapter `readerScrollRatio` is a coarse durable book-switch resume marker, not a continuously persisted scroll log. Keep high-frequency reader position state in memory.
- Queue processing is intentionally serialized via `queueLoopPromise` in [`utils/offline-download-queue.ts`](/Users/saigon/dev/hvbrowser/utils/offline-download-queue.ts).
- Hydrating the offline library also rebuilds the in-memory download queue from queued chapter rows; [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx) restarts the queue loop when queued items are present.
- Existing downloaded HTML should be reused when possible instead of redownloading.
- Saving the chapter currently open in the reader can persist the already-loaded `htmlOrig` / `htmlHV` pair directly, without waiting for the queue downloader.
- Do not retain downloaded chapter HTML in long-lived library state. Store metadata in `offlineChaptersByStory`; fetch full chapter records through `getOfflineChapterById()` / `getOfflineChapterByUrl()` when content is truly needed.

### Bookmark Persistence

- Bookmarks were migrated from older AsyncStorage formats into SQLite.
- Do not remove legacy migration code casually; it may still matter for real user upgrades.
- Bookmark URLs are sanitized before save/delete comparisons. Use existing helpers from [`utils/bookmarks.ts`](/Users/saigon/dev/hvbrowser/utils/bookmarks.ts) rather than rolling new URL comparison logic.

### Encoding / Content Fetching

- Encoding support is a core feature, not an edge case.
- Native uses `iconv-lite` + `encoding-japanese`; web uses `TextDecoder`.
- `metro.config.js` and the Buffer polyfill in [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx) are there to support this pipeline. Treat them as functional infrastructure, not cleanup targets.

## Working Guidelines For Future Agents

- Start by reading:
  - [`package.json`](/Users/saigon/dev/hvbrowser/package.json)
  - [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx)
  - [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx)
  - the relevant store/hook/db file for the feature you are changing
- Fast path for reader loading / WebView / page transition issues:
  - [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts)
  - [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx)
  - [`stores/useAppStore.ts`](/Users/saigon/dev/hvbrowser/stores/useAppStore.ts)
- If a state value spans async work plus render completion, prefer a descriptive stage enum over introducing additional loosely-coupled booleans.
- Prefer extending existing hooks/store actions over adding duplicate fetch/state logic in components.
- Keep UI state in `useWebPageStore` and durable/business state in `useAppStore`.
- Preserve the existing theme/token approach in [`theme.ts`](/Users/saigon/dev/hvbrowser/theme.ts) instead of hardcoding ad hoc colors.
- When adding persistence:
  - add/update Kysely migrations
  - update row-to-record mappers
  - update store hydration/refresh paths
- When changing offline flows, inspect both:
  - [`hooks/useOfflineDownloads.ts`](/Users/saigon/dev/hvbrowser/hooks/useOfflineDownloads.ts)
  - [`utils/offline-download-queue.ts`](/Users/saigon/dev/hvbrowser/utils/offline-download-queue.ts)
- When changing page rendering, inspect both:
  - [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts)
  - [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx)
- When changing reader search or cross-chapter search, inspect:
  - [`stores/useWebPageStore.ts`](/Users/saigon/dev/hvbrowser/stores/useWebPageStore.ts)
  - [`components/toolbars/WebTextToolbar.tsx`](/Users/saigon/dev/hvbrowser/components/toolbars/WebTextToolbar.tsx)
  - [`components/OfflineLibraryList.tsx`](/Users/saigon/dev/hvbrowser/components/OfflineLibraryList.tsx)
  - [`utils/offline-chapter-search.ts`](/Users/saigon/dev/hvbrowser/utils/offline-chapter-search.ts)
- If the task is specifically about reader-pipeline behavior, use the repo-local skill at [`.agents/skills/reader-pipeline/SKILL.md`](.agents/skills/reader-pipeline/SKILL.md).

## Repo Commands

- Install dependencies with `bun install`.
- Start the Expo app with `bun start`.
- Launch a target directly with `bun android`, `bun ios`, or `bun web`.
- Run validation with `bun lint`, `bun format:check`, and `bun typecheck`.
- Apply local autofixes with `bun lint:fix` and `bun format`.
- Regenerate dictionary word index with `bun run generate:definition-index`.
- Sync dictionary Han-Viet content with `bun run merge:han-viet-dictionary`.

## Validation Checklist

- Run `bun lint`.
- Run `bun format:check`.
- Run `bun typecheck`.
- If you touched the WebView or reader transformation path, manually sanity-check:
  - remote page load
  - HV toggle
  - full-site vs reader mode
  - in-page link navigation
  - reader scroll restoration
- If you touched offline features, manually sanity-check:
  - create/select story
  - queue chapter download
  - queued -> downloading -> downloaded transition
  - opening an offline chapter in the reader
- If you touched bookmarks/library, manually sanity-check:
  - add bookmark
  - edit bookmark
  - remove bookmark
  - import/export path from the library drawer

## UI Patterns

### Search Inputs

- Any searchable list or picker should provide an in-field clear affordance when the query is non-empty.
- Default pattern in this repo:
  - keep the `TextInput` as the primary field
  - add right padding so a clear button can sit inside the field area
  - render a small inline clear button with `xmark`
  - hide that clear button when the query is empty
  - use accessibility label `Clear search`
- Reference implementations:
  - [`components/LibraryView.tsx`](/Users/saigon/dev/hvbrowser/components/LibraryView.tsx)
  - [`components/OfflineChapterPicker.tsx`](/Users/saigon/dev/hvbrowser/components/OfflineChapterPicker.tsx)

- Use this pattern by default for:
  - library searches
  - offline chapter pickers
  - full-screen chapter browsers
  - any future filterable modal or drawer list

## Known Gaps

- No repo-level automated tests are currently set up.
- Some markdown notes in the repo root appear to be planning docs rather than guaranteed-current implementation docs.

## Safe Assumptions

- This is a mobile-first app even though Expo web exists.
- Offline reading, encoding compatibility, and WebView behavior are higher-risk areas than visual polish tweaks.
- Maintaining existing user data and migrations is more important than aggressively simplifying old persistence code.
