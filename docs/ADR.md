# ADR

This file records architecture decisions that shape the reader, offline library, and EPUB import pipeline.

## Foundational Decisions

### WebView-first reader

- The app is a WebView-first Chinese novel reader, not a generic content CRUD app.
- `app/_layout.tsx` owns shell chrome and global controls.
- `app/index.tsx` owns WebView rendering, injected bridge code, and in-page navigation handling.

### Split durable state from transient reader UI

- `stores/useAppStore.ts` owns durable/business state and async workflows:
  - current URL/title/history
  - rendered HTML payloads
  - bookmarks
  - offline stories/chapters
  - offline queues
- `stores/useWebPageStore.ts` owns transient reader/view state:
  - Han-Viet toggle
  - reader vs full-site mode
  - font size
  - drawer/theme UI state

### Reader pipeline keeps original and Han-Viet HTML in sync

- `htmlOrig` and `htmlHV` are the rendered source of truth.
- Reader loading is a staged pipeline, not only a fetch spinner.
- New page transitions must clear stale HTML before pairing the next URL with fresh content.
- Loading is not complete until the WebView load/render path finishes.

### Offline library reuses SQLite-backed story and chapter records

- Offline stories and chapters live in SQLite beside bookmarks, but in separate modules.
- Chapter URLs are unique in `offline_chapters`.
- Queue processing is serialized by design.

## Recent Decisions

### 2026-05 EPUB import uses a persisted background queue

Status: Accepted

- EPUB import runs through persisted `epub_import_jobs` records in `db/offline.ts`.
- Jobs resume through the app-managed queue loop in `utils/epub-import-queue.ts`.
- Import must not block normal remote reading or offline chapter reading.
- `Background` in v1 means persisted in-app resume after foreground return/app relaunch, not guaranteed OS background execution.

Why:

- Large EPUB files can take time to extract/import.
- Users still need the browser and offline reader while import is running.

### 2026-05 EPUB import is disk-backed and low-memory

Status: Accepted

- Picked EPUB files are staged into a per-job workspace under cache.
- Extraction is done to disk, not by holding the full archive in JS memory.
- Durable reader artifacts are:
  - story/chapter metadata in SQLite
  - chapter HTML in SQLite
  - large assets in app document storage
- Temporary source/unzip workspaces are cleanup targets after success/failure handling.

Why:

- EPUB files can be tens or hundreds of megabytes.
- Mobile memory pressure is a bigger risk than local disk usage during import.

### 2026-05 EPUB chapters reuse the existing offline chapter model

Status: Accepted

- EPUB stories use `offline_stories` with `sourceType = 'epub'`.
- EPUB sections become normal `offline_chapters`.
- EPUB chapter identity uses synthetic URLs of the form:
  - `epub://story/<storyId>/chapter/<index>`
- EPUB assets are rewritten to persisted local asset URIs.

Why:

- Reusing the offline reader model keeps navigation, reader rendering, and persistence aligned with existing code paths.

### 2026-05 Han-Viet conversion for EPUB is lazy per chapter

Status: Accepted

- Imported EPUB chapters store `originalHtml` immediately.
- `convertedHvHtml` is generated on first open and persisted back into SQLite.
- EPUB chapters default into reader mode when first opened.
- Full-site EPUB rendering is normalized to a consistent base font size instead of trusting publisher styles.

Why:

- Import should finish without converting the entire book up front.
- Reader-mode-first gives EPUB chapters the same Han-Viet interaction model as web chapters.

### 2026-05 Reader history is structured, not URL-only

Status: Accepted

- Reader history entries distinguish:
  - `remote-url`
  - `offline-chapter`
- Offline chapter history stores chapter identity plus URL.
- Anchor restore state is tracked separately through `pendingContentAnchor`.

Why:

- URL-only history is not enough to restore offline chapter sessions reliably.
- EPUB navigation and chapter-to-chapter jumps need stable offline identity.

### 2026-05 Offline chapter resume state is persisted per chapter

Status: Accepted

- Offline chapters store a persisted `lastOpenedAt` timestamp.
- Opening an offline chapter updates `lastOpenedAt` through the normal reader load path.
- Resume state must survive:
  - switching between books
  - app restarts
  - offline library backup/export and restore

Why:

- Resume behavior should come from durable reading state, not transient UI state.
- Both the offline library and reader surfaces need a shared source of truth for “last chapter read”.

### 2026-07 Reader scroll position is memory-first

Status: Accepted

- WebView scroll messages update an in-memory URL-keyed scroll ratio cache in `app/index.tsx`.
- The in-memory cache is used for active-session restoration and for keeping the reader aligned when switching between Han-Viet and Chinese render modes.
- Scroll events must not write `readerScrollRatio` to SQLite directly, through a timer, or through a debounce loop.
- Same-book Prev/Next chapter navigation must not persist scroll position to SQLite.
- When switching to a different offline story/book, persist the previous book's active chapter `readerScrollRatio` once, using the last in-memory ratio.

Why:

- Scroll messages are high-frequency and SQLite writes compete with reader taps, the bottom-right menu, and chapter navigation on mobile.
- Within one book session, transient in-memory position is enough for line matching and render-mode toggles.
- A durable DB position is only needed when leaving a book so the library can later resume that book near the last active chapter position.

### 2026-07 HV/Chinese mode switching stays single-WebView

Status: Accepted

- Reader mode uses one active WebView for the current chapter.
- Switching Han-Viet/Chinese may reuse a small in-memory cache for the currently requested shaped HTML.
- Reader-mode WebView HTML shaping runs after interactions in `app/index.tsx` instead of during React render.
- Do not mount separate persistent HV and Chinese WebViews for the same reader chapter in the current architecture.
- Do not prewarm the inactive mode on the foreground JS thread after chapter load.

Why:

- A dual-WebView experiment made large chapters worse: the hidden WebView still required full chapter HTML shaping and native WebView rendering.
- Inactive-mode prewarming can freeze the switch button because it competes with taps on the JS thread and native WebView work.
- Building dictionary/search segment HTML during render blocks taps before React Native can update loading/menu UI.
- A single WebView keeps bridge ownership simpler for dictionary lookup, reader search, navigation interception, and scroll restoration.

### 2026-08 Dictionary lookup business logic stays in React Native

Status: Accepted

- Reader HTML should contain only bridge metadata needed for interaction:
  - segment id/index metadata for dictionary taps, current-reader search highlights, and native highlight targeting
- `app/index.tsx` keeps the Chinese segment registry produced while shaping reader HTML.
- WebView dictionary tap messages send metadata such as `lookupId`, `segmentId`, `characterIndex`, and selected range.
- React Native reconstructs the Chinese context from the segment registry, chooses best/exact lookup ranges, calls the in-memory dictionary word index, and reads definition content from SQLite.
- Injected JavaScript may apply RN-supplied highlight ranges, but should not build full Chinese sentence lookup context or own dictionary-range business rules.

Why:

- Full sentence/context generation inside injected HTML/JavaScript makes the WebView bridge heavier and harder to reason about on large chapters.
- Keeping dictionary decisions in RN centralizes business logic beside `utils/definition-dictionary.ts` and the SQLite lookup path.
- Lightweight metadata keeps the DOM small while preserving current-reader search highlights and native-controlled dictionary highlighting.

### 2026-08 Current-reader search matching stays in React Native

Status: Accepted

- Reader HTML shaping produces a React Native segment registry with Chinese text, source text, generated Han-Viet text, and compact source offsets.
- Current-reader search computes Chinese and Han-Viet matches from that RN segment registry.
- Prepared current-reader Chinese/Han-Viet search indexes are cached per active segment registry/dictionary instead of rebuilt for each query.
- Manual current-reader search is scheduled after interactions so taps and sheet animation can settle before the first heavy match pass starts.
- `useWebPageStore` stores only transient result metadata for the active reader search.
- Injected JavaScript accepts RN-provided result id/range registrations, highlights matching `.hv-word` spans, and scrolls to the first target.
- Cross-chapter search result jumps still use `readerSearchAutoJumpRequest`, but the opened chapter re-resolves the occurrence through RN segment search instead of WebView DOM indexing.

Why:

- Building a token index by walking the active DOM in injected JavaScript made search and cross-chapter jumps compete with WebView rendering on large chapters.
- RN already owns the shaped segment registry needed for dictionary lookup, so search can reuse the same metadata without increasing HTML payload.
- Keeping WebView search work to highlight/scroll commands reduces bridge complexity and avoids long-running injected calculations.
- `react-native-worklets` is installed, but true worker-runtime search/conversion should be a deliberate follow-up because Babel/runtime setup and serialization costs need validation on device.

### 2026-08 Reader Worklet migration

Status: Accepted

- `react-native-worklets` is present in dependencies.
- Expo SDK 54 uses `babel-preset-expo`; do not add `react-native-worklets/plugin` manually because the preset handles Worklets/Reanimated setup for this SDK.
- `metro.config.js` enables `inlineRequires` because Expo apps can otherwise hit Worklets initialization issues.
- `utils/reader-worklet-runtime.ts` creates a guarded native-only reader runtime named `hvbrowser-reader`, warms it after initial interactions, and exposes a single scheduler with RN fallback behavior.
- The scheduler captures RN callbacks in the scheduled worklet closure and passes only the data payload through `runOnRuntime`; passing callbacks as runtime arguments broke conversion callbacks on SDK54's `react-native-worklets@0.5.1`.
- Web and failed native initialization keep the React Native-thread fallback because Worklets worker runtimes are not supported on web and can fail if the native app has not been rebuilt.
- Pure heavy-loop code lives outside React components:
  - `utils/reader-search.ts` owns current-reader search index construction and matching, but current-reader search runs on RN on SDK54.
  - `utils/han-viet-converter.ts` owns the pure character-to-Han-Viet loop.
  - `utils/reader-worklet-tasks.ts` owns Worklet task wrappers and marshals results back with `scheduleOnRN`.
- Worker-routed tasks:
  - reader HTML shaping and dictionary segment registry construction
  - first-time Han-Viet conversion after download/cleanup
  - bounded next-offline-chapter conversion and current-mode reader HTML shaping prewarm after the active chapter opens
- Fallbacks:
  - reader HTML shaping falls back to the existing RN builder if scheduling fails or times out.
  - Han-Viet conversion falls back to the pure RN conversion loop if scheduling fails or times out.
- Use `.agents/skills/worklet-migration/SKILL.md` before moving more reader work to Worklets.
- Do not run current-reader search through Worklets on SDK54. Returning full `map` arrays from `reader-search-index` crashed native before callbacks, and cold manual search crashed when started from the local search UI.
- Still on RN/native paths:
  - download and charset decoding
  - HTML cleanup
  - SQLite dictionary definition lookup
  - WebView bridge commands, highlighting, scrolling, and navigation
- Device benchmark still required: use large GBK/UTF-8 chapters to compare tap latency, total chapter prepare time, memory, and serialization cost.

Why:

- A worker can reduce RN JS thread stalls only if the data passed across runtime boundaries is compact enough.
- Worklet code cannot directly own WebView, SQLite, or React state side effects; those must stay in RN and receive compact worker results.
- Timeout fallbacks prevent reader prepare/search/conversion from getting stuck if a native Worklet runtime rejects a payload or a workletized import.
- Search-index maps are too large to treat as a safe cross-runtime payload; worker search should return only compact search results and WebView highlight ranges.
- Current-reader search should remain RN-owned after interactions until a newer Worklets runtime can be validated with large payloads.

### 2026-08 Next offline chapter prework is bounded and cache-only

Status: Accepted

- After an offline chapter opens, the loader may schedule conversion for the next known downloaded chapter through the existing Han-Viet conversion Worklet path.
- The preloader persists generated `convertedHvHtml` back to SQLite, but keeps full `originalHtml` / `convertedHvHtml` out of Zustand.
- `app/index.tsx` may also prewarm shaped reader HTML for the next chapter, but only for the currently active HV/Chinese mode, font size, safe-area inset, and theme.
- Prewarmed shaped HTML lives in a one-entry transient cache keyed by URL, input lengths, mode, font, inset, and theme. Both conversion and shaping preloads enforce byte budgets; oversized chapters are converted lazily and shaped only when opened. A normal reader prepare fallback still runs if the prewarm is missing, stale, or timed out.
- This is not inactive-mode prewarming and does not mount a second WebView.

Why:

- Same-book Next is a predictable user action and can reuse known offline chapter order.
- Preconverting the next chapter reduces the visible conversion delay without making scroll or mode switching write more data to SQLite.
- Keeping prewarm output bounded avoids returning to the earlier performance problem where hidden work competed with current reader taps.

### 2026-05 All `epub://` opens must resolve through offline chapter lookup

Status: Accepted

- `epub://` URLs are not remote URLs.
- Bookmark opens, WebView link taps, back-navigation restores, and any direct reader open path must resolve `epub://...` through offline chapter lookup before remote loading.
- `loadPage()` in `hooks/usePageLoader.ts` is allowed to delegate EPUB URLs into `loadOfflineChapter()` for this reason.

Why:

- EPUB chapter URLs are synthetic identities for offline content.
- Treating them like remote URLs breaks bookmarks and chapter targeting.

### 2026-05 EPUB story updates must target the existing story row by id

Status: Accepted

- EPUB import creates or resolves a story once, then updates it by `story.id`.
- EPUB metadata refresh must not rely on `homePageUrl`/`indexPageUrl` matching.

Why:

- EPUB stories do not naturally have remote home/index URLs.
- URL-based upsert matching created duplicate empty/full story pairs.

### 2026-05 Library tabs use shared sticky controls

Status: Accepted

- Both library tabs now follow the same small-screen behavior:
  - title/info card scrolls away
  - tab switcher stays sticky
  - tab-specific search/filter controls stay sticky under the tab switcher
- The offline tab keeps import cards and queue/job summaries in the scrollable content area.

Why:

- Small screens need more vertical room for lists.
- Sources and offline books should behave consistently.

### 2026-05 Reader TOC and offline book browser use different resume affordances

Status: Accepted

- The in-reader TOC remains chapter-oriented:
  - searchable
  - `All` / `Current` filtering
  - jump-to-current support
- The in-reader TOC should not expose a separate `Last` view, because the reader is already inside a specific chapter session.
- The offline library's per-book chapter browser exposes a `Last` action as a true resume mode:
  - it shows only the last opened chapter for that book
  - it is distinct from merely scrolling a full chapter list to a position

Why:

- `Last` is meaningful when resuming a book from the library, but redundant inside an already-open reader session.
- A one-chapter resume view is faster to use on mobile than reopening a long chapter list and scrolling within it.

### 2026-05 Offline library backups use a streaming ZIP archive

Status: Accepted

- Offline library export/import uses a single ZIP archive, not loose files.
- Export writes the ZIP directly to the chosen destination instead of building the full archive in memory.
- Import reads the ZIP sequentially and applies entries story-by-story.
- Backup archives target iOS/Android in v1; web can remain unsupported with a clear message.

Why:

- Offline libraries can contain many chapters and EPUB assets.
- Small-memory devices need bounded RAM use during backup and restore.
- A single archive is easier for users to move and re-import.

### 2026-05 Offline library backups store original HTML and regenerate Han-Viet lazily

Status: Accepted

- Backups store chapter `originalHtml` only.
- `convertedHvHtml` is not exported.
- Restored chapters regenerate and persist Han-Viet HTML later through the normal reader path when needed.

Why:

- Storing both HTML variants inflates backup size.
- Lazy regeneration keeps backup files smaller without changing reader behavior.

### 2026-05 Offline backup import merges books by source-aware identity

Status: Accepted

- Remote offline stories merge by sanitized `homePageUrl`, or sanitized `indexPageUrl` when home URL is absent.
- URL sanitization follows the bookmark-style rule:
  - strip hash fragments
  - ignore tracking-style query params
  - keep meaningful content query params
- EPUB stories merge by metadata first:
  - normalized title match is required
  - if both sides have authors, normalized author must also match
  - if only one side has author, original EPUB filename is the tiebreaker
  - if metadata title is missing, fall back to original EPUB filename
- Chapters continue to merge by normalized `chapterUrl` with the hash removed.

Why:

- Remote books need stable URL matching without over-collapsing different content pages.
- EPUB `epub://story/<id>/...` URLs are device-local and cannot be used as portable identity.

### 2026-05 Offline backup import restores unfinished remote chapters as queued

Status: Accepted

- Backup import restores remote `queued` and `downloading` chapters as `queued`.
- Existing downloaded chapter content must not be downgraded by an older queued/failed backup entry.
- EPUB import jobs are excluded from backups entirely because their device-local source/workspace URIs are not portable.

Why:

- The existing offline queue can safely resume queued remote chapter downloads after restore.
- Preserving downloaded content avoids regressions during additive import.
- EPUB import job records do not round-trip across devices.

## Non-goals For Current EPUB Support

- No DRM/encrypted EPUB support in v1.
- No full EPUB CSS/font/media fidelity goal in v1.
- No whole-book eager Han-Viet conversion during import.
