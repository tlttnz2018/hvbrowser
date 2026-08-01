import type { Theme } from '../theme';

function escapeAttribute(value: string): string {
  'worklet';

  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(value: string): string {
  'worklet';

  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isChineseCharacter(value: string): boolean {
  'worklet';

  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

export interface ReaderDefinitionSegment {
  id: number;
  text: string;
  sourceText: string;
  hanVietText: string;
  breakBeforeIndexes: number[];
  sourceIndexes: number[];
  hanVietIndexes: number[];
}

export interface ReaderHtmlWithDefinitionSegments {
  html: string;
  definitionSegments: Record<number, ReaderDefinitionSegment>;
}

export function injectBaseHref(html: string, pageUrl: string): string {
  'worklet';

  if (!html) return html;

  const baseTag = `<base href="${escapeAttribute(pageUrl)}" />`;

  if (/<base\b[^>]*>/i.test(html)) {
    return html.replace(/<base\b[^>]*>/i, baseTag);
  }

  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${baseTag}`);
  }

  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>\n${baseTag}\n</head>`);
  }

  return `<head>${baseTag}</head>${html}`;
}

function buildReaderStyle(
  fontSize: number,
  readerTheme: Theme['reader'],
  safeAreaBottom = 0,
): string {
  'worklet';

  const bottomPadding = 64 + safeAreaBottom;

  return [
    '<style>',
    `html, body { margin: 0 !important; padding: 0 !important; background: ${readerTheme.background} !important; color: ${readerTheme.text} !important; }`,
    `body { padding: 16px 14px ${bottomPadding}px !important; font-size: ${fontSize}em !important; line-height: 1.75 !important; word-break: break-word !important; }`,
    '* { max-width: 100% !important; box-sizing: border-box !important; }',
    'table { width: 100% !important; display: block !important; }',
    'tr, td, tbody, thead { display: block !important; width: 100% !important; }',
    'img { height: auto !important; }',
    `a { color: ${readerTheme.link} !important; text-decoration: none !important; }`,
    'br { content: ""; display: block; margin-top: 0.7em; }',
    '</style>',
  ].join('');
}

function stripPresentationMarkup(html: string): string {
  'worklet';

  if (!html) return html;

  let output = html;

  output = output.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  output = output.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  output = output.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '');
  output = output.replace(
    /\s(on[a-z]+|class|id|style|bgcolor|align|valign|width|height|border|cellpadding|cellspacing|nowrap)=(".*?"|'.*?'|[^\s>]+)/gi,
    '',
  );
  output = output.replace(/&nbsp;/gi, ' ');

  return output;
}

function injectIntoHead(html: string, injected: string): string {
  'worklet';

  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${injected}`);
  }

  return `<head>${injected}</head>${html}`;
}

function annotateHanVietTextWithDefinitions(
  text: string,
  dictionary: Record<string, string>,
  segmentId: number,
  segments: Record<number, ReaderDefinitionSegment>,
): string {
  'worklet';

  let output = '';
  let segmentIndex = 0;
  let breakBeforeNextChinese = false;
  const segmentText: string[] = [];
  const hanVietText: string[] = [];
  const breakBeforeIndexes: number[] = [];
  const sourceIndexes: number[] = [];
  const hanVietIndexes: number[] = [];
  let hanVietIndex = 0;

  for (const [sourceIndex, ch] of Array.from(text).entries()) {
    if (isChineseCharacter(ch)) {
      if (breakBeforeNextChinese) {
        breakBeforeIndexes.push(segmentIndex);
      }
      segmentText.push(ch);
      sourceIndexes.push(sourceIndex);
      hanVietIndexes.push(hanVietIndex);
      const hvWord = dictionary[ch] || ch;
      hanVietText.push(hvWord);
      hanVietIndex += Array.from(hvWord).length;
      output += `<span class="hv-word" data-hv-segment-id="${segmentId}" data-hv-segment-index="${segmentIndex}">${escapeHtml(hvWord)}</span>`;
      if (hvWord !== ch) {
        output += ' ';
        hanVietText.push(' ');
        hanVietIndex += 1;
      }
      segmentIndex += 1;
      breakBeforeNextChinese = false;
    } else {
      output += escapeHtml(ch);
      hanVietText.push(ch);
      hanVietIndex += Array.from(ch).length;
      if (ch.trim()) {
        breakBeforeNextChinese = segmentIndex > 0;
      }
    }
  }

  segments[segmentId] = {
    id: segmentId,
    text: segmentText.join(''),
    sourceText: text,
    hanVietText: hanVietText.join(''),
    breakBeforeIndexes,
    sourceIndexes,
    hanVietIndexes,
  };

  return output;
}

function annotateChineseTextWithDefinitions(
  text: string,
  dictionary: Record<string, string>,
  segmentId: number,
  segments: Record<number, ReaderDefinitionSegment>,
): string {
  'worklet';

  let output = '';
  let segmentIndex = 0;
  let breakBeforeNextChinese = false;
  const segmentText: string[] = [];
  const hanVietText: string[] = [];
  const breakBeforeIndexes: number[] = [];
  const sourceIndexes: number[] = [];
  const hanVietIndexes: number[] = [];
  let hanVietIndex = 0;

  for (const [sourceIndex, ch] of Array.from(text).entries()) {
    if (isChineseCharacter(ch)) {
      if (breakBeforeNextChinese) {
        breakBeforeIndexes.push(segmentIndex);
      }
      segmentText.push(ch);
      sourceIndexes.push(sourceIndex);
      const hvWord = dictionary[ch] || ch;
      hanVietIndexes.push(hanVietIndex);
      hanVietText.push(hvWord);
      hanVietIndex += Array.from(hvWord).length;
      if (hvWord !== ch) {
        hanVietText.push(' ');
        hanVietIndex += 1;
      }
      output += `<span class="hv-word" data-hv-segment-id="${segmentId}" data-hv-segment-index="${segmentIndex}">${escapeHtml(ch)}</span>`;
      segmentIndex += 1;
      breakBeforeNextChinese = false;
    } else {
      output += escapeHtml(ch);
      hanVietText.push(ch);
      hanVietIndex += Array.from(ch).length;
      if (ch.trim()) {
        breakBeforeNextChinese = segmentIndex > 0;
      }
    }
  }

  segments[segmentId] = {
    id: segmentId,
    text: segmentText.join(''),
    sourceText: text,
    hanVietText: hanVietText.join(''),
    breakBeforeIndexes,
    sourceIndexes,
    hanVietIndexes,
  };

  return output;
}

export function stripPresentationHtml(
  html: string,
  fontSize: number,
  readerTheme: Theme['reader'],
  safeAreaBottom = 0,
): string {
  'worklet';

  const output = stripPresentationMarkup(html);
  return injectIntoHead(output, buildReaderStyle(fontSize, readerTheme, safeAreaBottom));
}

export function normalizeEpubFullSiteHtml(
  html: string,
  readerTheme: Theme['reader'],
  baseFontSizePx = 14,
  safeAreaBottom = 0,
): string {
  'worklet';

  if (!html) {
    return html;
  }

  const bottomPadding = 64 + safeAreaBottom;
  const injected = [
    '<style>',
    `html, body { margin: 0 !important; padding: 0 !important; background: ${readerTheme.background} !important; color: ${readerTheme.text} !important; }`,
    `body { padding: 16px 14px ${bottomPadding}px !important; font-size: ${baseFontSizePx}px !important; line-height: 1.75 !important; word-break: break-word !important; }`,
    `body, body * { font-size: ${baseFontSizePx}px !important; line-height: 1.75 !important; }`,
    '* { max-width: 100% !important; box-sizing: border-box !important; }',
    'img, svg, video, canvas { max-width: 100% !important; height: auto !important; }',
    `a { color: ${readerTheme.link} !important; }`,
    '</style>',
  ].join('');

  return injectIntoHead(html, injected);
}

function buildDefinitionLookupEnhancements(): string {
  'worklet';

  return [
    '<style>',
    '.hv-word { cursor: pointer; }',
    '.hv-word.active { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 0.14em; }',
    '.hv-word.in-selection { background: rgba(255, 214, 102, 0.22); border-radius: 3px; }',
    '</style>',
    '<script>',
    '(function() {',
    '  var lookupCounter = 0;',
    '  var currentLookup = null;',
    '  function clearHighlights() {',
    '    var highlighted = document.querySelectorAll(".hv-word.active, .hv-word.in-selection");',
    '    for (var index = 0; index < highlighted.length; index += 1) {',
    '      highlighted[index].classList.remove("active");',
    '      highlighted[index].classList.remove("in-selection");',
    '    }',
    '  }',
    '  function clearLookup() {',
    '    currentLookup = null;',
    '    clearHighlights();',
    '  }',
    '  function getSegmentSelector(segmentId) {',
    '    return ".hv-word[data-hv-segment-id=\\"" + String(segmentId) + "\\"]";',
    '  }',
    '  function applyHighlights() {',
    '    clearHighlights();',
    '    if (!currentLookup) return;',
    '    var candidates = document.querySelectorAll(getSegmentSelector(currentLookup.segmentId));',
    '    for (var index = 0; index < candidates.length; index += 1) {',
    '      var candidate = candidates[index];',
    '      var segmentIndex = parseInt(candidate.getAttribute("data-hv-segment-index") || "-1", 10);',
    '      if (!Number.isFinite(segmentIndex)) continue;',
    '      if (currentLookup.start <= segmentIndex && segmentIndex < currentLookup.end) {',
    '        candidate.classList.add("in-selection");',
    '      }',
    '      if (segmentIndex === currentLookup.activeIndex) {',
    '        candidate.classList.add("active");',
    '      }',
    '    }',
    '  }',
    '  window.__HVBROWSER_DEFINITION_LOOKUP__SHOW__ = function(result) {',
    '    var lookupId = result && result.lookupId;',
    '    if (!lookupId || !currentLookup || currentLookup.lookupId !== lookupId) return;',
    '    if (typeof result.segmentId === "number") currentLookup.segmentId = result.segmentId;',
    '    if (typeof result.activeIndex === "number") currentLookup.activeIndex = result.activeIndex;',
    '    if (typeof result.selectedStart === "number") currentLookup.start = result.selectedStart;',
    '    if (typeof result.selectedEnd === "number") currentLookup.end = result.selectedEnd;',
    '    if (typeof result.segmentLength === "number") currentLookup.segmentLength = result.segmentLength;',
    '    if (currentLookup.end <= currentLookup.start) {',
    '      currentLookup.end = currentLookup.start + 1;',
    '    }',
    '    applyHighlights();',
    '  };',
    '  function buildLookupPayload(mode) {',
    '    if (!currentLookup) return null;',
    '    return {',
    '      type: "definition-press",',
    '      lookupId: currentLookup.lookupId,',
    '      lookupMode: mode,',
    '      segmentId: currentLookup.segmentId,',
    '      characterIndex: currentLookup.activeIndex,',
    '      selectedStart: currentLookup.start,',
    '      selectedEnd: currentLookup.end,',
    '      segmentLength: currentLookup.segmentLength',
    '    };',
    '  }',
    '  function requestLookup(mode) {',
    '    if (!currentLookup) return;',
    '    currentLookup.mode = mode;',
    '    applyHighlights();',
    '    var payload = buildLookupPayload(mode);',
    '    if (payload && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {',
    '      window.ReactNativeWebView.postMessage(JSON.stringify(payload));',
    '    }',
    '  }',
    '  function requestDefinition(target) {',
    '    var segmentId = parseInt(target.getAttribute("data-hv-segment-id") || "", 10);',
    '    var segmentIndex = parseInt(target.getAttribute("data-hv-segment-index") || "", 10);',
    '    if (!Number.isFinite(segmentId) || !Number.isFinite(segmentIndex)) return;',
    '    var lookupId = "hv-definition-" + Date.now() + "-" + lookupCounter;',
    '    lookupCounter += 1;',
    '    currentLookup = { lookupId: lookupId, segmentId: segmentId, activeIndex: segmentIndex, start: segmentIndex, end: segmentIndex + 1, segmentLength: segmentIndex + 1, mode: "best" };',
    '    requestLookup("best");',
    '  }',
    '  window.__HVBROWSER_DEFINITION_LOOKUP__CLOSE__ = clearLookup;',
    '  document.addEventListener("click", function(event) {',
    '    var current = event.target && event.target.closest ? event.target.closest(".hv-word") : null;',
    '    if (!current) { return; }',
    '    var link = current.closest ? current.closest("a") : null;',
    '    if (link) { clearLookup(); return; }',
    '    requestDefinition(current);',
    '    event.preventDefault();',
    '    event.stopPropagation();',
    '  });',
    '  window.addEventListener("resize", clearLookup);',
    '})();',
    '</script>',
  ].join('');
}

export function buildPresentationHtmlWithHvDefinitions(
  html: string,
  fontSize: number,
  dictionary: Record<string, string>,
  readerTheme: Theme['reader'],
  safeAreaBottom = 0,
): ReaderHtmlWithDefinitionSegments {
  'worklet';

  let segmentId = 0;
  const definitionSegments: Record<number, ReaderDefinitionSegment> = {};
  const output = stripPresentationMarkup(html).replace(/>([^<>]+)</g, (_, text: string) => {
    if (!text.trim()) return `>${text}<`;
    segmentId += 1;
    return `>${annotateHanVietTextWithDefinitions(text, dictionary, segmentId, definitionSegments)}<`;
  });

  const injected = [
    buildReaderStyle(fontSize, readerTheme, safeAreaBottom),
    buildDefinitionLookupEnhancements(),
  ].join('');

  return {
    html: injectIntoHead(output, injected),
    definitionSegments,
  };
}

export function stripPresentationHtmlWithHvDefinitions(
  html: string,
  fontSize: number,
  dictionary: Record<string, string>,
  readerTheme: Theme['reader'],
  safeAreaBottom = 0,
): string {
  'worklet';

  return buildPresentationHtmlWithHvDefinitions(
    html,
    fontSize,
    dictionary,
    readerTheme,
    safeAreaBottom,
  ).html;
}

export function buildPresentationHtmlWithChineseDefinitions(
  html: string,
  fontSize: number,
  dictionary: Record<string, string>,
  readerTheme: Theme['reader'],
  safeAreaBottom = 0,
): ReaderHtmlWithDefinitionSegments {
  'worklet';

  let segmentId = 0;
  const definitionSegments: Record<number, ReaderDefinitionSegment> = {};
  const output = stripPresentationMarkup(html).replace(/>([^<>]+)</g, (_, text: string) => {
    if (!text.trim()) return `>${text}<`;
    segmentId += 1;
    return `>${annotateChineseTextWithDefinitions(text, dictionary, segmentId, definitionSegments)}<`;
  });

  const injected = [
    buildReaderStyle(fontSize, readerTheme, safeAreaBottom),
    buildDefinitionLookupEnhancements(),
  ].join('');

  return {
    html: injectIntoHead(output, injected),
    definitionSegments,
  };
}

export function stripPresentationHtmlWithChineseDefinitions(
  html: string,
  fontSize: number,
  readerTheme: Theme['reader'],
  safeAreaBottom = 0,
): string {
  'worklet';

  return buildPresentationHtmlWithChineseDefinitions(
    html,
    fontSize,
    {},
    readerTheme,
    safeAreaBottom,
  ).html;
}
