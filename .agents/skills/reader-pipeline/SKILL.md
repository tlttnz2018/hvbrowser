---
name: reader-pipeline
description: Use when working on hvbrowser reader loading, page transitions, WebView rendering, Han-Viet conversion flow, or bugs where URL, loading, and rendered HTML get out of sync. Focuses on the minimal files and pitfalls for the reader pipeline.
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
- [`stores/useWebPageStore.ts`](/Users/saigon/dev/hvbrowser/stores/useWebPageStore.ts) for transient reader mode state

## Pipeline

1. URL enters through the app shell and calls `usePageLoader`.
2. `usePageLoader` normalizes the URL, updates history, and drives loading state.
3. Remote pages are downloaded, cleaned, converted to Han-Viet, then stored as `htmlOrig` and `htmlHV`.
4. `app/index.tsx` chooses the active HTML variant and renders it in the `WebView`.
5. Injected bridge code handles link interception, scroll reporting, dismissal taps, and reader restoration.
6. Offline EPUB chapters reuse the same reader surface, but their `epub://...` URLs must resolve back to offline chapter records instead of going through remote fetch logic.

## Invariants

- `htmlOrig` and `htmlHV` must stay aligned for the same page.
- Do not end reader loading before the `WebView` load-complete path runs.
- If a new page is starting, clear stale HTML before pairing the next URL with fresh content.
- `currentContentSource === 'offline'` changes navigation behavior; preserve that branch logic.
- Reader mode and full-site mode share the same `WebView` surface but differ in HTML shaping and behavior.
- `epub://...` URLs are synthetic offline chapter identities. Bookmarks, back navigation, and link taps must resolve them through offline chapter lookup before any remote `loadPage` path continues.
- EPUB chapters may start with only `originalHtml`; Han-Viet HTML can be generated lazily on first open.

## Common Failure Modes

- Loading overlay disappears after download but before conversion or WebView readiness.
- New URL briefly renders old HTML because the old page was not cleared first.
- Injected JS changes break navigation interception or reader scroll restoration.
- A fix updates only `htmlOrig` or only `htmlHV`.
- A loading boolean grows ambiguous; use a stage enum if the UI needs real progress states.
- EPUB bookmarks or cross-chapter links open the wrong content because a synthetic `epub://...` URL was treated like a remote URL.

## Change Strategy

- For loading UX, keep state ownership centralized in `useAppStore`.
- Prefer extending `usePageLoader` and `app/index.tsx` instead of adding duplicate component-local loading state.
- Treat `onLoadStart` / `onLoadEnd` and injected-script completion paths as part of the reader pipeline, not just presentation details.

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
