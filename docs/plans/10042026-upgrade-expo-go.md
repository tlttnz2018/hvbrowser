# Han Viet Browser: Expo SDK 35 → 55 Migration Spec

**Date:** 2026-04-10
**Approach:** Fresh Expo 55 project on a new branch, port all business logic

---

## Context

The Han Viet Browser is a Chinese-to-Vietnamese translation browser built on Expo SDK 35 (circa 2019). It fetches HTML pages from CJK websites, cleans ads/censorship, converts Chinese characters to Han-Viet readings, and renders the result in a WebView. The app is currently iOS-only, uses MobX 5 with legacy decorators, styled-components 4, class components, and React 16.8.

Expo SDK 35 is no longer supported by Expo Go or EAS. This migration creates a modern, maintainable codebase on Expo 55 while preserving all business logic — especially the encoding pipeline and 639-line regex cleanup engine.

---

## Decisions

| Area               | Current                                 | Target                                        |
| ------------------ | --------------------------------------- | --------------------------------------------- |
| Expo SDK           | 35                                      | 55                                            |
| React              | 16.8.3                                  | 18.x                                          |
| Package manager    | npm/yarn (lock files deleted)           | **bun**                                       |
| State management   | MobX 5 (legacy decorators)              | **Zustand**                                   |
| Styling            | styled-components 4.2.0                 | **NativeWind v4** (Tailwind CSS)              |
| Components         | Class components                        | **Functional + hooks**                        |
| Navigation         | Custom MobX-based toggle                | **Expo Router** (file-based)                  |
| HTML parsing       | react-native-cheerio (RC, unmaintained) | **htmlparser2 + domutils**                    |
| Platforms          | iOS only                                | **iOS + Android**                             |
| App identity       | com.troioi.hvbrowser2                   | Same (keep bundle ID + EAS project)           |
| Directory strategy | Same repo                               | **New branch (`expo55-migration`), same dir** |

**Dropped dependencies:** react-native-messages (unused), lodash (replace with native), prop-types (TypeScript), uuid/react-native-uuid (use stable keys), stream polyfill, vietphraser.js (dead code), newChinesePhienAm.json (unused).

---

## Architecture

### File Structure (New)

```
app/
  _layout.tsx          # Root layout: SafeAreaView, toolbar, Buffer polyfill, dictionary load
  index.tsx            # Home screen: site shortcut grid, bookmarks, last-viewed
  web.tsx              # Web screen: WebView with HV content, font injection
components/
  SearchInput.tsx      # URL input with back button
  Grid.tsx             # Generic grid layout (FlatList)
  ImageGrid.tsx        # Site shortcut grid items
  WebTextToolbar.tsx   # Font size + CSS toggle toolbar
  buttons/
    ToolbarButton.tsx
    BookmarkToggleButton.tsx
    HVToggleButton.tsx
    HomeToggleButton.tsx
    MoreToggleButton.tsx
hooks/
  usePageLoader.ts     # Core orchestration: URL → download → clean → convert → store
  useHistory.ts        # Browser history navigation
stores/
  useAppStore.ts       # Content, URL, bookmarks, dictionary, history (persisted)
  useWebPageStore.ts   # UI state: font, HV toggle, CSS toggle, menu
utils/
  cleanup.ts           # 639-line regex cleanup engine (port exact rules)
  downloader.ts        # HTML fetch with encoding detection/decoding
  normalize-url.ts     # Relative-to-absolute URL resolution
data/
  DataHanVietUni.json  # Han-Viet dictionary (~236KB, loaded into memory)
global.css             # Tailwind directives
tailwind.config.js
metro.config.js        # NativeWind CSS support
babel.config.js        # NativeWind + expo presets
```

### Data Flow

```
User taps URL/link
  → usePageLoader.loadPage(url)
    → normalize-url.fixUrl(currentUrl, url)
    → downloader.downloadHtmlPage(url)
        → fetch() as ArrayBuffer
        → encoding-japanese.detect() → UTF-8 / GBK / Shift_JIS / EUC-JP / Big5
        → iconv-lite.decode(Buffer.from(bytes), encoding) OR TextDecoder
    → cleanup.handleContentText(html)
        → character substitution (~400 regex rules)
        → ad text removal (~135 patterns)
        → paragraph normalization
    → cleanup.updateRelativeUrl(html, url)
        → htmlparser2 parse → rewrite <a> hrefs → serialize
    → downloader.convertHtmlPageToHV(html, dictionary)
        → character-by-character dictionary lookup
    → store results in useAppStore
  → WebView renders HTML
  → useEffect on fontSize → injectJavaScript for CSS
```

---

## Implementation Phases

### Phase 0: Scaffold (branch + fresh project)

1. `git checkout -b expo55-migration`
2. Move all current files into `_old/` (except `.git`, `assets/`, `data/`)
3. `bunx create-expo-app@latest . --template blank-typescript` (scaffold in temp dir if needed, then move)
4. Restore `assets/` and `data/` directories
5. Merge identity into new `app.json`:
   - `slug: "hvbrowser2"`
   - `ios.bundleIdentifier: "com.troioi.hvbrowser2"`
   - `android.package: "com.troioi.hvbrowser2"`
   - `extra.eas.projectId: "28c31d20-8052-11e9-9fe9-41aa2efe3a53"`
   - `platforms: ["ios", "android"]`
   - Remove `sdkVersion` field (Expo 55 uses package version)
6. Copy `eas.json` as-is

**Verify:** `bunx expo start` loads blank app on simulator.

### Phase 1: Install Dependencies

```bash
bun add zustand expo-router expo-constants expo-linking expo-status-bar \
  react-native-safe-area-context react-native-screens react-native-webview \
  @react-native-async-storage/async-storage \
  nativewind react-native-reanimated \
  encoding-japanese iconv-lite buffer \
  htmlparser2 domutils dom-serializer

bun add -d tailwindcss@^3.4
```

Set `"main": "expo-router/entry"` in `package.json`.

### Phase 2: Configure NativeWind

1. `tailwind.config.js` with NativeWind preset, content paths for `app/` and `components/`
2. `global.css` with `@tailwind base/components/utilities`
3. `babel.config.js`: presets `["babel-preset-expo", { jsxImportSource: "nativewind" }]` + `"nativewind/babel"`
4. `metro.config.js`: wrap default config with `withNativeWind(..., { input: "./global.css" })`

**Verify:** Test component with `className="bg-red-500 p-4"` renders correctly.

### Phase 3: Expo Router Setup

Create `app/_layout.tsx`, `app/index.tsx`, `app/web.tsx` with minimal placeholder content. Navigation via `router.push('/web')` and `router.push('/')`.

**Verify:** Tap between Home and Web screens.

### Phase 4: Zustand Stores

**`stores/useAppStore.ts`** — Two stores, separate concerns:

- Content state: `htmlOrig`, `htmlHV`, `currentUrl`, `webPageTitle`, `loading`, `error`
- Bookmarks: `bookmarks[]` with `toggleBookmark()`, computed `isCurrentBookmarked`
- History: `history[]` (max 50 items) with `pushHistory()`, `popHistory()`
- Dictionary: `dictionary` object (not persisted)
- Persistence via `zustand/middleware/persist` + `createJSONStorage(() => AsyncStorage)`
  - Only persist: `bookmarks`, `lastViewUrl`
  - One-time migration from old keys (`HV_BROWSER_BOOKMARK_STORAGE_KEY`, `HV_BROWSER_LASTVIEW_STORAGE_KEY`) in `onRehydrateStorage`

**`stores/useWebPageStore.ts`** — UI-only, no persistence:

- `fontSize` (1.0–4.0, step 0.25), `isHV`, `fullSite`, `moreMenu`, `urlInputFocus`
- Actions: `toggleHV()`, `toggleCss()`, `increaseFont()`, `decreaseFont()`, `resetFont()`, `toggleMoreMenu()`

**Verify:** Import stores, call actions, confirm state updates trigger re-renders.

### Phase 5: Port Utilities (HIGHEST RISK)

#### 5.1: `utils/normalize-url.ts`

Pure string manipulation, no deps. Port as-is with TypeScript types. Keep the custom implementation — native `URL` API won't handle the CJK-site-specific edge cases (`www./m./sj./wap.` prefixes, `.aspx/.php` detection).

#### 5.2: `utils/cleanup.ts` (639 lines — critical)

- Replace lodash with native: `_.isRegExp` → `instanceof RegExp`, `_.each` → `Object.entries().forEach()`, `_.extend` → `Object.assign()`, etc.
- Replace cheerio (`updateRelativeUrl`):

  ```ts
  import { parseDocument } from 'htmlparser2';
  import { findAll, getAttributeValue } from 'domutils';
  import render from 'dom-serializer';
  ```

  - `cheerio.load(text)` → `parseDocument(text)`
  - `$('a')` → `findAll(elem => elem.name === 'a', doc.children)`
  - `$(el).attr('href')` → `getAttributeValue(elem, 'href')`
  - `$(el).attr('href', val)` → `elem.attribs.href = val`
  - `$.html()` → `render(doc)`

- **Preserve ALL regex rules character-for-character**: `replaceAll` (135 patterns), `replace` (~100 entries), `oneWordReplace` (~100 entries), `replaceFix` (~15 entries)
- Preserve the `CHAR_ALIAS` mechanism and `toRE()` function exactly

#### 5.3: `utils/downloader.ts` (encoding — critical)

**Buffer polyfill** — In `app/_layout.tsx` or a `polyfills.ts` loaded first:

```ts
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
```

**Replace XMLHttpRequest with fetch:**

```ts
const response = await fetch(url);
const arrayBuffer = await response.arrayBuffer();
const byteArray = new Uint8Array(arrayBuffer);
const detected = encoding.detect(byteArray);
```

**Encoding mapping** (encoding-japanese → iconv-lite):

| Detected      | iconv-lite name                                                   |
| ------------- | ----------------------------------------------------------------- |
| `UTF8`        | Use `TextDecoder('utf-8')`, fallback to manual `utf8ArrayToStr()` |
| `SJIS`        | `shiftjis`                                                        |
| `EUCJP`       | `euc-jp`                                                          |
| `UNICODE`     | `utf-16le`                                                        |
| Other/unknown | `gbk` (preserve current fallback behavior)                        |

**`convertHtmlPageToHV`** — Character-by-character dictionary lookup. Pure string logic, ports directly.

#### 5.4: Drop `utils/vietphraser.js`

Dead code — never imported anywhere. The actual conversion uses `convertHtmlPageToHV` in downloader.js.

**Verify Phase 5:** Feed known HTML pages through old and new pipelines, diff outputs. This is the single most important verification step.

### Phase 6: Port Components

All components convert from class/MobX to functional/Zustand/NativeWind:

| Component          | Key Changes                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `SearchInput`      | `componentWillReceiveProps` → `useEffect([url])`, class → functional            |
| `Grid`             | `PureComponent` → `React.memo`, propTypes → TypeScript interface                |
| `ImageGrid`        | `uuid.v4()` keys → stable URL-based keys, remove styled-components              |
| 5 toolbar buttons  | Remove `inject()`/`observer()` HOCs → `useAppStore()`/`useWebPageStore()` hooks |
| `WebTextToolbar`   | Remove MobX injection, use Zustand hooks                                        |
| `HomeToggleButton` | `appStore.toggleHome()` → `router.push('/')` / `router.push('/web')`            |

### Phase 7: Port Screens

**`app/index.tsx` (Home):** ImageGrid with site shortcuts, bookmarks from store, last-viewed URL. NativeWind classes.

**`app/web.tsx` (Web):** WebView from `react-native-webview`. Font injection via `useEffect` on `fontSize`:

```ts
const webViewRef = useRef<WebView>(null);
const fontSize = useWebPageStore((s) => s.fontSize);
useEffect(() => {
  webViewRef.current?.injectJavaScript(`document.body.style.fontSize = "${fontSize}em"; true;`);
}, [fontSize]);
```

Link interception via `onNavigationStateChange` — filter out `about:`, `data:`, `postMessage`, same-URL, and base-URL-only navigations.

### Phase 8: Orchestration Hooks

**`hooks/usePageLoader.ts`** — Encapsulates `MainApp.handleUpdateUrl`:

```
loadPage(url) → fixUrl → downloadHtmlPage → handleContentText →
  updateRelativeUrl → convertHtmlPageToHV → store results → router.push('/web')
```

**`hooks/useHistory.ts`** — Encapsulates `MainApp.goBack`:

```
goBack() → popHistory → skip if same as current → loadPage(previousUrl)
```

### Phase 9: Root Layout (`app/_layout.tsx`)

Wires everything together:

- `SafeAreaView` wrapper (replaces hardcoded `top: 30`)
- Load dictionary on mount via `useEffect`
- Render SearchInput + toolbar buttons
- Conditionally show `WebTextToolbar` (when on `/web` route and more menu open)
- `<Slot />` for active route

### Phase 10: AsyncStorage Migration

One-time migration in Zustand persist `onRehydrateStorage`:

- Read old keys → write into new store → delete old keys
- Old: `HV_BROWSER_BOOKMARK_STORAGE_KEY` (JSON array), `HV_BROWSER_LASTVIEW_STORAGE_KEY` (string)
- New: single `hv-browser-storage` key via Zustand persist

### Phase 11: Platform Testing & Polish

- Android: test hardware back button, WebView `mixedContentMode`, encoding pipeline
- iOS: verify SafeAreaView insets, WebView font injection
- End-to-end test checklist (below)

---

## Risk Register

| Risk                                                                 | Severity   | Mitigation                                                                                                                            |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `iconv-lite` fails on Hermes with Buffer polyfill                    | **High**   | Test GBK decoding early in Phase 5.3. Fallback: use `encoding-japanese.convert()` to go from GBK→Unicode directly (it supports this). |
| Regex cleanup rules produce different output                         | **High**   | Create test fixtures: save HTML input/output pairs from old app, diff against new pipeline.                                           |
| `htmlparser2` serializes HTML differently than cheerio               | **Medium** | Only `updateRelativeUrl` uses DOM parsing (rewrites `<a>` hrefs). Verify with link-heavy pages.                                       |
| `react-native-webview` event shape differs from old built-in WebView | **Medium** | `navigationType` may be absent on Android. Test link interception on both platforms.                                                  |
| NativeWind className not applying on some RN components              | **Low**    | Some components need explicit `styled()` wrapper from NativeWind. Check docs for compatibility.                                       |

---

## Verification Plan

### Per-Phase Checks (described above in each phase)

### End-to-End Acceptance Test

1. **Cold start** → Home screen renders with 8 site shortcuts
2. **Tap site shortcut** → navigates to Web screen, loading indicator shows, page loads with Han-Viet translation
3. **GBK-encoded site** → text renders correctly (not garbled)
4. **Toggle HV button** → switches between original Chinese and Han-Viet reading
5. **Font size +/-/reset** → WebView text size changes via CSS injection
6. **Toggle CSS** → full site vs. minimal styling
7. **Bookmark toggle** → adds/removes bookmark, star icon reflects state
8. **Restart app** → bookmarks and last-viewed URL persist
9. **Tap link in WebView** → new page loads through full pipeline
10. **Back button** → navigates to previous page in history
11. **URL input** → type URL manually, press enter, page loads
12. **Android** → all above work, hardware back button navigates history
13. **Migration** → old AsyncStorage bookmarks appear after first launch on new version

### Cleanup Rules Regression Test

Save 3-5 HTML pages from known Chinese novel sites through the **old** cleanup pipeline. After porting, run same inputs through **new** pipeline and diff. Zero differences = pass.
