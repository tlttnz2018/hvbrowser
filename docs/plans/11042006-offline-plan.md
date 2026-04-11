# Offline Reading Plan

## Goal

Add offline story and chapter storage, a sequential download queue with randomized rest time, a download action from the bottom-right reader toolbar, a user-confirmed page-role flow that the app remembers for future downloads, and a new `Offline book` tab inside the library drawer so users can browse saved stories, expand chapters, and read chapters without network access.

## Assumptions

- Current bookmark storage in [`db/bookmarks.ts`](/Users/saigon/dev/hvbrowser/db/bookmarks.ts) remains unchanged.
- Offline reading uses SQLite for durable storage, following the existing Kysely migration pattern already used for bookmarks.
- Downloading a chapter means saving both the original HTML and the converted Han-Viet HTML for one chapter URL.
- Queue processing is in-app only for now. No background OS task support is included in this phase.
- Failed downloads only need visible failure state/message; automatic retry is out of scope unless added later.
- The first version should not depend on hardcoded per-site configuration.
- The app should learn page roles from user input and from previously saved story/chapter URLs.

## Page-Role Behavior Rules

### Unknown page behavior

Rules:

- If the app cannot determine whether the current page is a `home page`, `index page`, or `chapter page`, tapping download should open a small role picker.
- The picker should let the user choose one of:
  - `Home page`
  - `Index page`
  - `Chapter page`
- After the user chooses once, the app should save enough information so future download-button taps can infer the role immediately for that story.

### Chapter page behavior

Rules:

- If the user marks the current page as a chapter page, tapping download should immediately save the current page content to the offline database.
- No chapter picker is shown in this flow.
- If the same chapter is already downloaded, the button should reflect that and avoid duplicate queue entries.
- Chapter download should attach to the matching story record using remembered `home_page_url` and `index_page_url` when possible.

### Index page behavior

Rules:

- If the user marks the current page as an index page, save that URL into `offline_stories.index_page_url` immediately, even if no chapters are selected yet.
- Then open a chapter-picker UI instead of immediately saving the current page as a chapter.
- The picker should list chapter links found on that page.
- The picker must support:
  - selecting individual chapter links
  - selecting all chapter links
  - adding the selected chapter links to the queue
- The queue still processes one chapter at a time with a random `1-5` second rest between items.

### Home page behavior

Rules:

- If the user marks the current page as a home page, save that URL into `offline_stories.home_page_url`.
- No chapter picker is shown in this flow.
- Saving the home page should help future chapter/index downloads resolve the story faster.

### Remembered behavior

Rules:

- After a story has `home_page_url` and/or `index_page_url` saved, future download-button taps should try to recognize the current page by comparing the current URL to known story URLs and previously saved chapter URLs.
- If the current URL exactly matches a saved `home_page_url`, show home-page actions immediately.
- If the current URL exactly matches a saved `index_page_url`, show index-page actions immediately.
- If the current URL already exists in `offline_chapters.chapter_url`, treat it as a chapter page immediately.
- If the current URL does not match saved home/index URLs for the story, treat it as a likely chapter page when the story context is already known.
- If the app still cannot determine the role safely, ask the user to choose `home page`, `index page`, or `chapter page`.

## Suggested Tables

### `offline_stories`

- `id` integer primary key autoincrement
- `name` text not null
- `home_page_url` text
- `index_page_url` text
- `created_at` text not null
- `updated_at` text not null

Notes:

- `home_page_url` and `index_page_url` should be nullable so the story can be learned gradually.
- Add unique indexes for non-null `home_page_url` and non-null `index_page_url` if SQLite migration approach allows it cleanly. If not, enforce uniqueness in code.

### `offline_chapters`

- `id` integer primary key autoincrement
- `story_id` integer not null references `offline_stories.id` on delete cascade
- `chapter_name` text not null
- `chapter_url` text not null unique
- `chapter_order` integer
- `original_html` text not null
- `converted_hv_html` text not null
- `download_status` text not null default `queued`
- `download_error` text
- `downloaded_at` text
- `created_at` text not null
- `updated_at` text not null

## Suggested Queue State

Keep queue runtime state in Zustand, persisted metadata in SQLite.

- `downloadQueue`: ordered array of chapter URLs or chapter IDs waiting to download
- `activeDownloadId`: current chapter being downloaded, or `null`
- `downloadQueueRunning`: boolean
- `downloadQueueLastError`: optional latest failure message

Queue rule:

- Process one chapter at a time.
- After each successful download, sleep a random `1000-5000ms` before moving to the next item.
- If download fails, mark that chapter as failed, surface the failure, and continue to the next queued item.

## Remembered Role Resolution

The app should try to resolve the current page in this order:

1. Match current URL against `offline_chapters.chapter_url`.
2. Match current URL against `offline_stories.index_page_url`.
3. Match current URL against `offline_stories.home_page_url`.
4. If the user is already inside a known story context and the current URL is neither home nor index, treat it as likely chapter page.
5. If still unknown, open the role picker.

## Task Checklist

### 1. Create offline database module

- [x] Add a new database module, likely `db/offline.ts`, instead of overloading [`db/bookmarks.ts`](/Users/saigon/dev/hvbrowser/db/bookmarks.ts).
- [x] Define Kysely table interfaces for `offline_stories` and `offline_chapters`.
- [x] Reuse the existing SQLite database file (`hvbrowser.db`) and dialect helper from [`db/expoSqliteDialect.ts`](/Users/saigon/dev/hvbrowser/db/expoSqliteDialect.ts).
- [x] Add migrations for both new tables.
- [x] Make `home_page_url` nullable.
- [x] Make `index_page_url` nullable.
- [x] Add an index on `offline_chapters.story_id`.
- [x] Add an index on `offline_chapters.download_status`.
- [x] Add an initialization helper such as `ensureOfflineDbReady()`.

### 2. Add offline DB query helpers

- [x] Add `upsertOfflineStory({ name, homePageUrl, indexPageUrl })`.
- [x] Add `getOfflineStoryByIndexPageUrl(indexPageUrl)`.
- [x] Add `getOfflineStoryByHomePageUrl(homePageUrl)`.
- [x] Add `getOfflineStoryByChapterUrl(chapterUrl)` via join on chapters.
- [x] Add `listOfflineStories()`.
- [x] Add `saveOfflineChapter(...)` that upserts by `chapter_url`.
- [x] Add `listOfflineChaptersByStory(storyId)`.
- [x] Add `getOfflineChapterByUrl(chapterUrl)`.
- [x] Add `getOfflineChapterById(id)`.
- [x] Add `updateOfflineChapterStatus(id, status, error?)`.
- [x] Add `attachHomePageToStory(storyId, homePageUrl)`.
- [x] Add `attachIndexPageToStory(storyId, indexPageUrl)`.
- [x] Add `deleteOfflineStory(id)` if cleanup is needed later.

### 3. Extend app store for offline state

- [x] Add offline store state in [`stores/useAppStore.ts`](/Users/saigon/dev/hvbrowser/stores/useAppStore.ts) or split into a dedicated offline store if that keeps responsibilities cleaner.
- [x] Add in-memory collections for `offlineStories` and `offlineChaptersByStory`.
- [x] Add queue state: `downloadQueue`, `activeDownloadId`, `downloadQueueRunning`, `downloadQueueLastError`.
- [x] Add state for the pending download UI flow:
  - current page-role prompt open/closed
  - current chapter-picker open/closed
  - selected story for pending action
  - selected page role
- [x] Add actions to hydrate offline library data from SQLite on startup.
- [x] Add actions to enqueue a chapter download.
- [x] Add actions to mark queue item started / completed / failed.
- [x] Add action to select and open an offline chapter in the reader.

### 4. Initialize offline data on app launch

- [x] In [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx), initialize offline DB data next to existing bookmark initialization.
- [x] Make sure initialization failures are logged without crashing the app shell.

### 5. Add remembered page-role resolution

- [x] Add a helper module such as `utils/offline-page-role.ts`.
- [x] Implement resolution by current URL against saved chapter URLs, saved index URLs, and saved home URLs.
- [x] Return one of:
  - `home page`
  - `index page`
  - `chapter page`
  - `unknown`
- [x] Add a helper to resolve the most likely story record for the current page.
- [x] Make sure this logic is used before showing any role-picker UI.

### 6. Add user-confirmed page-role flow

- [x] Build a lightweight prompt or modal opened from the download button when the app does not yet know whether the current page is `home page`, `index page`, or `chapter page`.
- [x] Let the user choose one of the three page roles.
- [x] Persist the selected role indirectly by saving the current URL into the relevant story field:
  - `home page` -> `offline_stories.home_page_url`
  - `index page` -> `offline_stories.index_page_url`
  - `chapter page` -> save into `offline_chapters.chapter_url`
- [x] Reuse remembered story URLs next time so the app can skip the prompt whenever possible.
- [x] Add fallback story naming using current page title when the story name is not yet known.
- [x] Allow story records to be created gradually as the user teaches the app home/index/chapter pages over time.

### 7. Add reusable download helpers

- [x] Keep raw fetch and Han-Viet conversion in [`utils/downloader.ts`](/Users/saigon/dev/hvbrowser/utils/downloader.ts).
- [x] Add a helper to sleep for a randomized `1-5` seconds.
- [x] Add a helper to download and convert a single chapter payload `{ originalHtml, convertedHvHtml, title }`.
- [x] Decide whether offline chapter HTML should pass through `cleanupHtml` before storage, or whether to store raw HTML plus cleaned converted HTML.
- [x] Recommended approach: store original fetched HTML as-is and store converted HTML after cleanup + conversion, matching current reading behavior.

### 8. Build the sequential queue worker

- [x] Add a queue runner module such as `utils/offline-download-queue.ts` or a hook such as `hooks/useOfflineDownloadQueue.ts`.
- [x] Ensure only one queue loop can run at a time.
- [x] Pop the next queued chapter.
- [x] Mark it `downloading`.
- [x] Download original HTML.
- [x] Convert to Han-Viet HTML.
- [x] Persist chapter content and mark it `downloaded`.
- [x] Wait random `1-5` seconds.
- [x] Move to the next item.
- [x] On error, mark chapter `failed` with `download_error`.
- [x] Surface failure in UI or alert without blocking the rest of the queue.

### 9. Add reader toolbar download action

- [x] Extend [`components/toolbars/WebTextToolbar.tsx`](/Users/saigon/dev/hvbrowser/components/toolbars/WebTextToolbar.tsx) with a new download button in the bottom-right menu.
- [x] Hook the button to remembered page-role-aware offline actions.
- [x] If current URL matches a saved story `home_page_url`, show home-page actions immediately.
- [x] If current URL matches a saved story `index_page_url`, show index-page actions immediately.
- [x] If current URL already exists as a saved chapter, treat it as chapter flow immediately.
- [x] If current page role is unknown, open the page-role chooser first.
- [x] Add loading / queued / downloaded visual feedback so the button is not ambiguous.
- [x] Keep the existing toolbar layout usable on small screens.

### 10. Decide current chapter insertion behavior

- [x] When the user confirms a chapter page, first resolve or create the parent story.
- [x] Then insert or update the chapter row in `queued` state.
- [x] Avoid duplicate queue entries if the same chapter is already queued or downloaded.
- [x] Decide whether re-download should overwrite existing chapter HTML.
- [x] Recommended approach: if already `downloaded`, do not enqueue again unless a future “redownload” action is added.

### 11. Add index-page chapter picker flow

- [x] Build a modal or drawer sheet that opens from the download button on index pages.
- [x] Populate the modal by extracting links from the current index page HTML.
- [x] Show each chapter with a checkbox.
- [x] Add `Select all` and `Clear all` actions.
- [x] Add a primary action to enqueue the selected chapters.
- [x] Prevent duplicate enqueue for chapters already `queued`, `downloading`, or `downloaded`.
- [x] Show lightweight counts such as `selected / total`.
- [x] Make sure `offline_stories.index_page_url` is saved before the picker opens, even if the user closes the picker without selecting chapters.

### 12. Add home-page save flow

- [x] When the user marks the current page as `home page`, save or update `offline_stories.home_page_url`.
- [x] If a story row already exists by matching `index_page_url` or related chapters, update that same story instead of creating a duplicate.
- [x] Show a lightweight confirmation that the home page has been remembered for this story.

### 13. Add offline reader loading path

- [x] Extend [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts) with a separate offline load path, or add a sibling hook for offline content.
- [x] Add a method that loads HTML directly from SQLite instead of `fetch`.
- [x] Reuse existing reader state setters: `setCurrentUrl`, `setWebPageTitle`, `setHtmlContent`, `setError`.
- [x] Ensure offline reading still supports HV/original toggle in the WebView.
- [x] Decide what `currentUrl` should be for offline chapters.
- [x] Recommended approach: keep `currentUrl` equal to the original chapter URL so navigation context stays consistent.

### 14. Prevent accidental network reload for offline chapters

- [x] Review reload behavior in [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx) and navigation behavior in [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx).
- [x] If the active chapter is offline, make reload use the offline HTML instead of calling remote download.
- [x] Add a lightweight flag in store such as `currentContentSource: 'remote' | 'offline'`.
- [x] Make navigation-state changes safe so local offline viewing does not unintentionally trigger remote fetches.

### 15. Add Offline book tab to library

- [x] Extend [`components/LibraryView.tsx`](/Users/saigon/dev/hvbrowser/components/LibraryView.tsx) with a top-level tab or segmented control that switches between current library content and `Offline book`.
- [x] Preserve the existing Sources / Saved behavior under the current tab.
- [x] Add a dedicated offline tab panel that lists offline stories.
- [x] Show chapter counts and download status per story where helpful.
- [x] Show remembered `home page` and `index page` links in story details if useful.

### 16. Build expandable offline story list UI

- [x] Add a story row component for the offline tab.
- [x] Support expand/collapse to reveal chapters under each story.
- [x] Sort chapters by `chapter_order`, with fallback to `created_at` or title when order is missing.
- [x] Show chapter status labels: `queued`, `downloading`, `downloaded`, `failed`.
- [x] Only allow opening chapters that are fully downloaded.
- [x] Tapping a downloaded chapter should dismiss the drawer and open the offline reader.

### 17. Update list components if reuse is possible

- [x] Decide whether [`components/BookmarkList.tsx`](/Users/saigon/dev/hvbrowser/components/BookmarkList.tsx) should be generalized, or whether offline needs a dedicated component.
- [x] Recommended approach: keep `BookmarkList` focused on source/bookmark items and build a separate offline list component to avoid forcing two unrelated data shapes into one list item renderer.

### 18. Add failure messaging

- [x] Choose a lightweight failure notification mechanism.
- [x] Recommended approach: use `Alert.alert` for immediate feedback and status badges in the offline list for persistent visibility.
- [x] Make sure failures leave the chapter row in `failed` state with error text saved.

### 19. Add queue progress visibility

- [x] Show queue progress somewhere visible, ideally in the toolbar or offline tab header.
- [x] Minimum useful states: idle, downloading current chapter, queued count, last failure.
- [x] Make sure a user can tell that downloads happen one at a time.

### 20. Validate migration and hydration flow

- [ ] Confirm fresh install creates both new tables.
- [ ] Confirm existing users keep bookmarks and can add offline stories without data loss.
- [ ] Confirm offline data hydrates after app restart.

### 21. Manual test checklist

- [ ] On a new story page with no saved metadata, tap download and confirm the app asks whether the page is `home page`, `index page`, or `chapter page`.
- [ ] Choose `chapter page` and confirm the current page is saved directly.
- [ ] Choose `index page` and confirm `offline_stories.index_page_url` is saved before chapter selection.
- [ ] Close the chapter picker without selecting anything and confirm the story still remembers the index page.
- [ ] Reopen the same index page and confirm the app now knows it is an index page immediately.
- [ ] Choose `home page` and confirm `offline_stories.home_page_url` is saved.
- [ ] Reopen the same home page and confirm the app now knows it is a home page immediately.
- [ ] Select one chapter from an index page and confirm only that chapter is queued.
- [ ] Select all chapters from an index page and confirm all detected chapter links are queued.
- [ ] Verify the story row appears under `Offline book`.
- [ ] Verify the chapter appears as `queued`, then `downloading`, then `downloaded`.
- [ ] Verify the queue waits a random `1-5` seconds before the next item.
- [ ] Queue multiple chapters and confirm only one runs at a time.
- [ ] Force a bad URL and confirm the chapter becomes `failed`.
- [ ] Tap a downloaded chapter from the offline library and confirm it opens without network.
- [ ] Toggle HV/original while reading offline and confirm both render.
- [ ] Press reload while reading offline and confirm it does not fetch from network.
- [ ] Restart the app and confirm offline stories and chapters remain available.

### 22. Nice-to-have follow-ups

- [ ] Add delete actions for chapter/story offline cache management.
- [ ] Add retry action for failed chapters.
- [ ] Add “download from chapter list” bulk enqueue from a story index page.
- [ ] Add progress timestamps or last-downloaded metadata in the offline library.
- [ ] Add an edit action so the user can correct a wrongly remembered home/index page later.

## Recommended Implementation Order

1. Database + migrations
2. Offline DB helpers
3. Remembered page-role resolution
4. Store state + hydration
5. Queue worker
6. Reader toolbar download button
7. Page-role chooser
8. Index-page chapter picker
9. Home-page save flow
10. Offline reader loading path
11. Library `Offline book` tab
12. Expandable chapter UI
13. Failure/progress feedback
14. Manual verification pass

## File Targets

- [`db/bookmarks.ts`](/Users/saigon/dev/hvbrowser/db/bookmarks.ts): leave bookmark logic intact; mirror patterns where useful
- [`db/expoSqliteDialect.ts`](/Users/saigon/dev/hvbrowser/db/expoSqliteDialect.ts): reuse existing SQLite setup
- `/Users/saigon/dev/hvbrowser/db/offline.ts`: new offline tables, migrations, and queries
- `/Users/saigon/dev/hvbrowser/utils/offline-page-role.ts`: remembered page-role resolution from saved story/chapter URLs
- [`stores/useAppStore.ts`](/Users/saigon/dev/hvbrowser/stores/useAppStore.ts): offline state, queue state, hydration, current content source
- [`hooks/usePageLoader.ts`](/Users/saigon/dev/hvbrowser/hooks/usePageLoader.ts): remote/offline load paths
- [`utils/downloader.ts`](/Users/saigon/dev/hvbrowser/utils/downloader.ts): shared download + conversion helpers
- `/Users/saigon/dev/hvbrowser/utils/offline-download-queue.ts`: sequential queue processing
- [`components/toolbars/WebTextToolbar.tsx`](/Users/saigon/dev/hvbrowser/components/toolbars/WebTextToolbar.tsx): add download button
- `/Users/saigon/dev/hvbrowser/components/OfflinePageRolePicker.tsx`: choose `home page`, `index page`, or `chapter page`
- `/Users/saigon/dev/hvbrowser/components/OfflineChapterPicker.tsx`: chapter selection modal for index pages
- [`components/LibraryView.tsx`](/Users/saigon/dev/hvbrowser/components/LibraryView.tsx): add `Offline book` tab
- `/Users/saigon/dev/hvbrowser/components/OfflineLibraryList.tsx`: expandable stories and chapters UI
- [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx): initialize offline data
- [`app/index.tsx`](/Users/saigon/dev/hvbrowser/app/index.tsx): protect offline reload/navigation behavior
