# HVBrowser

HVBrowser is an Expo / React Native reader for browsing Chinese novel sites, converting page text to Han-Viet, and saving stories or chapters for offline reading.

## Current State

This is a single-app mobile-first project built around a `WebView` reader, a Han-Viet conversion pipeline, and a SQLite-backed offline library.

- Expo 54
- React Native 0.81
- React 19
- Expo Router
- Zustand for state
- Expo SQLite + Kysely for persistence
- `react-native-webview` for rendering remote and transformed HTML

## What The App Does

- Open Chinese novel sites inside an in-app browser/reader
- Convert downloaded page text to Han-Viet with a one-tap toggle
- Switch between full-site mode and cleaned reader mode
- Adjust reader font sizing
- Save and manage bookmarks
- Maintain browsing history for back navigation
- Organize offline stories and chapters
- Queue chapter downloads for offline reading
- Re-open downloaded chapters inside the same reader

## Development

### Run The App

```bash
bun start
```

Other available scripts:

```bash
bun android
bun ios
```

## Validation

The repository has basic linting and formatting scripts:

```bash
bun lint
bun format:check
bun typecheck
```

For feature work, manual testing is still important, especially for:

- remote page loading
- Han-Viet toggle
- full-site vs reader mode
- link interception inside the `WebView`
- bookmark add/edit/remove flows
- offline story and chapter download flows

## Notes For Future Sessions

If you are updating the app, read [`AGENTS.md`](/Users/saigon/dev/hvbrowser/AGENTS.md) first. It documents the current architecture, important invariants, risky areas like encoding and WebView injection, and a practical checklist for making safe changes.
