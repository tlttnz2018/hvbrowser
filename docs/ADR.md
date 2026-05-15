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

## Non-goals For Current EPUB Support

- No DRM/encrypted EPUB support in v1.
- No full EPUB CSS/font/media fidelity goal in v1.
- No whole-book eager Han-Viet conversion during import.
