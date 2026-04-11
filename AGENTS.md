# AGENTS.md

## Purpose

- This repository is a single-app Expo / React Native project for browsing Chinese novel sites, converting page text to Han-Viet, and saving stories/chapters for offline reading.
- Future agents should treat it as a WebView-first reader app with a custom offline pipeline, not as a generic CRUD/mobile app.

## Current Stack

- Expo 54 + React Native 0.81 + React 19
- Expo Router for the app shell (`app/_layout.tsx`, `app/index.tsx`)
- Zustand for client state (`stores/useAppStore.ts`, `stores/useWebPageStore.ts`)
- Expo SQLite + custom Kysely dialect for persistence (`db/`)
- `react-native-webview` for rendering source pages and transformed reader HTML
- TypeScript in `strict` mode

## High-Level Architecture

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
- [`utils/webview-html.ts`](/Users/saigon/dev/hvbrowser/utils/webview-html.ts): base href injection and reader HTML shaping
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
- Changes to injected JS can easily break navigation or reader restoration. Re-test on device/simulator when touching it.
- For reader loading UX changes, do not mark loading complete until the `WebView` load-complete path has run.

### Navigation / History

- `usePageLoader.loadPage()` pushes history before loading the new page.
- `loadOfflineChapter()` sets `currentContentSource` to `offline`; several navigation branches depend on that flag.
- `app/index.tsx` ignores some WebView navigation events (`about:`, `data:`, `postMessage`, offline mode). Preserve those guards unless you are intentionally changing WebView behavior.

### Offline Library

- Offline records live in the same SQLite DB file as bookmarks, but in separate Kysely schemas/modules.
- Chapter URLs are unique in `offline_chapters`. Re-queue logic depends on that uniqueness.
- Queue processing is intentionally serialized via `queueLoopPromise` in [`utils/offline-download-queue.ts`](/Users/saigon/dev/hvbrowser/utils/offline-download-queue.ts).
- Hydrating the offline library also rebuilds the in-memory download queue from queued chapter rows; [`app/_layout.tsx`](/Users/saigon/dev/hvbrowser/app/_layout.tsx) restarts the queue loop when queued items are present.
- Existing downloaded HTML should be reused when possible instead of redownloading.
- Saving the chapter currently open in the reader can persist the already-loaded `htmlOrig` / `htmlHV` pair directly, without waiting for the queue downloader.

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
- If the task is specifically about reader-pipeline behavior, use the repo-local skill at [`.agents/skills/reader-pipeline/SKILL.md`](.agents/skills/reader-pipeline/SKILL.md).

## Repo Commands

- Install dependencies with `bun install`.
- Start the Expo app with `bun start`.
- Launch a target directly with `bun android`, `bun ios`, or `bun web`.
- Run validation with `bun lint`, `bun format:check`, and `bun typecheck`.
- Apply local autofixes with `bun lint:fix` and `bun format`.

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
