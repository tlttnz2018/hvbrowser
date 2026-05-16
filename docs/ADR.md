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
