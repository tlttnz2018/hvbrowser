---
name: worklet-migration
description: Use when moving JavaScript work onto React Native Worklets or debugging Worklet crashes/performance, especially in Expo SDK 54 projects where runtime boundaries, serialization, callbacks, and native/JS version alignment matter.
---

# Worklet Migration

Use this skill before moving expensive JavaScript work onto a Worklet runtime.

## Mental Model

- A Worklet runtime is a separate JavaScript runtime, not a faster version of the RN runtime.
- Values crossing the runtime boundary are serialized or copied. Large inputs, large outputs, and captured closures can cost more than the computation saved.
- Objects captured by a worklet are snapshots for that runtime. Do not assume later RN-side mutations are visible inside the worklet.
- Worklet code can synchronously call only worklet-safe functions, host functions, or other functions explicitly available in that runtime.
- RN work such as React state, navigation, WebView commands, SQLite, network/native modules, logging sinks with side effects, and store mutation must stay on RN and be reached through scheduled callbacks.

## Setup Guardrails

- Keep the Worklets JS package version aligned with the native app or Expo Go version. Version mismatches are crash-class bugs, not ordinary TypeScript problems.
- After adding or upgrading Worklets native dependencies, rebuild the native app. Clearing Metro cache is not enough.
- For Expo SDK 54, prefer the Expo-compatible Worklets version and `babel-preset-expo` behavior already validated by the project. Do not install latest Worklets or add Babel plugins from newer docs without checking the local SDK.
- Expo apps may need `inlineRequires: true` in `metro.config.js` for Worklets initialization.
- Verify the installed API before coding. Worklets docs may describe newer APIs than the project has locally.

## Candidate Test

Move work to a Worklet only when all of these are true:

- The operation is pure or can be expressed as pure compute from serializable input.
- Inputs and outputs are bounded, measurable, and smaller than the UI stutter being avoided.
- The result can be ignored safely if the request becomes stale.
- There is a correct RN-thread fallback.
- The feature can be enabled in small steps and disabled quickly if device logs show native instability.

Keep work on RN/native when it depends on:

- UI tree, component lifecycle, refs, gestures, navigation, WebView commands, or store mutation.
- SQLite, filesystem, network, native module calls, or platform APIs that are not explicitly injected into the Worklet runtime.
- Huge indexes, full caches, or long-lived data structures whose serialization and duplicated memory are not yet measured.

## Boundary Pattern

Design every Worklet task as a boundary:

1. Build a minimal input object on RN.
2. Schedule one named Worklet task through the project’s Worklet scheduler or wrapper.
3. Inside the worklet, call only worklet-safe pure helpers.
4. Return a compact result through an RN-defined callback, usually via `scheduleOnRN`.
5. On RN, check request id, cache key, or generation before applying the result.
6. On timeout, scheduling failure, or thrown error, run the RN fallback.

Prefer this shape:

```ts
scheduleTask(
  workletTask,
  { requestId, source, options },
  (result) => applyIfCurrent(requestId, result),
  (message) => runFallback(message),
);
```

Avoid this shape:

```ts
workletTask(reactState, mutableStore, webViewRef, sqliteDb, giantCache);
```

## Callback Rules

- Functions passed to `scheduleOnRN` must be defined on the RN runtime, not created inside a worklet callback.
- Do not call RN functions directly from a Worklet unless they are documented host functions.
- Do not pass callbacks as runtime arguments if the installed Worklets version has not been validated for that pattern. Prefer the project’s known-safe scheduling wrapper.
- Treat every callback result as asynchronous and possibly stale.

## Payload Discipline

- Log input/output sizes before and after migration.
- Cap caches by entry count and, when possible, by approximate size.
- Cache by content identity, not only by mode flags: include URL/id, source length/hash, options, theme/layout inputs, and version/generation.
- Do not store full computed payloads in global app state unless the feature already required durable ownership there.
- If a task needs a large dictionary or static table, measure whether passing it per task is worse than the RN-thread work. Consider chunking, pre-indexing, or keeping the feature on RN.

## Failure Design

- Add logs for: start, schedule, scheduled, success, fallback, timeout, stale result, and error.
- Use a timeout for every Worklet task that affects loading or visible UI.
- Use request ids or cache keys so late Worklet results cannot overwrite newer UI state.
- Keep a one-line rollback path: one caller or feature flag should disable the new Worklet route while keeping the pure helper and RN fallback intact.
- When the app closes without a JS error, first suspect native/JS version mismatch, unsupported API, invalid callback ownership, or oversized serialized payload.

## Validation Checklist

- Run typecheck, lint, and format checks.
- Test on a real device or simulator with both small and large payloads.
- Test cancellation: navigate away, change mode/options, and start the same task twice.
- Test fallback: force scheduler unavailable or timeout and confirm behavior remains correct.
- Compare perceived tap/scroll responsiveness and total elapsed time; a lower compute time is not enough if serialization delays UI updates.
