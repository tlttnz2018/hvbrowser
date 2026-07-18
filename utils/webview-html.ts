import type { Theme } from '../theme';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isChineseCharacter(value: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

export function injectBaseHref(html: string, pageUrl: string): string {
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

function buildReaderStyle(fontSize: number, readerTheme: Theme['reader']): string {
  return [
    '<style>',
    `html, body { margin: 0 !important; padding: 0 !important; background: ${readerTheme.background} !important; color: ${readerTheme.text} !important; }`,
    `body { padding: 16px 14px 24px !important; font-size: ${fontSize}em !important; line-height: 1.75 !important; word-break: break-word !important; }`,
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
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${injected}`);
  }

  return `<head>${injected}</head>${html}`;
}

function annotateHanVietTextWithDefinitions(
  text: string,
  dictionary: Record<string, string>,
  segmentId: number,
): string {
  let output = '';
  let segmentIndex = 0;
  let breakBeforeNextChinese = false;

  for (const ch of text) {
    if (isChineseCharacter(ch)) {
      const hvWord = dictionary[ch] || ch;
      const breakAttribute = breakBeforeNextChinese ? ' data-hv-break-before="1"' : '';
      output += `<span class="hv-word" data-chinese="${escapeAttribute(ch)}" data-hv-segment-id="${segmentId}" data-hv-segment-index="${segmentIndex}"${breakAttribute}>${escapeHtml(hvWord)}</span>`;
      if (hvWord !== ch) {
        output += ' ';
      }
      segmentIndex += 1;
      breakBeforeNextChinese = false;
    } else {
      output += escapeHtml(ch);
      if (ch.trim()) {
        breakBeforeNextChinese = segmentIndex > 0;
      }
    }
  }

  return output;
}

function annotateChineseTextWithDefinitions(text: string, segmentId: number): string {
  let output = '';
  let segmentIndex = 0;
  let breakBeforeNextChinese = false;

  for (const ch of text) {
    if (isChineseCharacter(ch)) {
      const breakAttribute = breakBeforeNextChinese ? ' data-hv-break-before="1"' : '';
      output += `<span class="hv-word" data-chinese="${escapeAttribute(ch)}" data-hv-segment-id="${segmentId}" data-hv-segment-index="${segmentIndex}"${breakAttribute}>${escapeHtml(ch)}</span>`;
      segmentIndex += 1;
      breakBeforeNextChinese = false;
    } else {
      output += escapeHtml(ch);
      if (ch.trim()) {
        breakBeforeNextChinese = segmentIndex > 0;
      }
    }
  }

  return output;
}

export function stripPresentationHtml(
  html: string,
  fontSize: number,
  readerTheme: Theme['reader'],
): string {
  const output = stripPresentationMarkup(html);
  return injectIntoHead(output, buildReaderStyle(fontSize, readerTheme));
}

export function normalizeEpubFullSiteHtml(
  html: string,
  readerTheme: Theme['reader'],
  baseFontSizePx = 14,
): string {
  if (!html) {
    return html;
  }

  const injected = [
    '<style>',
    `html, body { margin: 0 !important; padding: 0 !important; background: ${readerTheme.background} !important; color: ${readerTheme.text} !important; }`,
    `body { padding: 16px 14px 24px !important; font-size: ${baseFontSizePx}px !important; line-height: 1.75 !important; word-break: break-word !important; }`,
    `body, body * { font-size: ${baseFontSizePx}px !important; line-height: 1.75 !important; }`,
    '* { max-width: 100% !important; box-sizing: border-box !important; }',
    'img, svg, video, canvas { max-width: 100% !important; height: auto !important; }',
    `a { color: ${readerTheme.link} !important; }`,
    '</style>',
  ].join('');

  return injectIntoHead(html, injected);
}

function buildDefinitionLookupEnhancements(): string {
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
    '  function getWordCharacter(word) { return word.getAttribute("data-chinese") || ""; }',
    '  function getSelectedWords() {',
    '    if (!currentLookup) return [];',
    '    return currentLookup.words.slice(currentLookup.start, currentLookup.end);',
    '  }',
    '  function getSelectedText() { return getSelectedWords().map(getWordCharacter).join(""); }',
    '  function applyHighlights() {',
    '    clearHighlights();',
    '    if (!currentLookup) return;',
    '    for (var index = currentLookup.start; index < currentLookup.end; index += 1) {',
    '      currentLookup.words[index].classList.add("in-selection");',
    '    }',
    '    currentLookup.words[currentLookup.activeIndex].classList.add("active");',
    '  }',
    '  window.__HVBROWSER_DEFINITION_LOOKUP__SHOW__ = function(result) {',
    '    var lookupId = result && result.lookupId;',
    '    if (!lookupId || !currentLookup || currentLookup.lookupId !== lookupId) return;',
    '    if (currentLookup.mode === "best" && result.entry && result.entry.word) {',
    '      adoptResultRange(result.entry.word);',
    '    }',
    '    applyHighlights();',
    '  };',
    '  function collectSegmentWords(target) {',
    '    var segmentId = target.getAttribute("data-hv-segment-id") || "";',
    '    var selector = segmentId ? ".hv-word[data-chinese][data-hv-segment-id=\\"" + segmentId + "\\"]" : ".hv-word[data-chinese]";',
    '    var candidates = document.querySelectorAll(selector);',
    '    var segmentWords = [];',
    '    for (var index = 0; index < candidates.length; index += 1) {',
    '      segmentWords.push(candidates[index]);',
    '    }',
    '    var position = segmentWords.indexOf(target);',
    '    if (position < 0) {',
    '      return { words: [target], position: 0 };',
    '    }',
    '    var start = position;',
    '    while (start > 0 && segmentWords[start].getAttribute("data-hv-break-before") !== "1") start -= 1;',
    '    var end = position + 1;',
    '    while (end < segmentWords.length && segmentWords[end].getAttribute("data-hv-break-before") !== "1") end += 1;',
    '    return { words: segmentWords.slice(start, end), position: position - start };',
    '  }',
    '  function adoptResultRange(word) {',
    '    if (!currentLookup || !word) return;',
    '    for (var start = 0; start < currentLookup.words.length; start += 1) {',
    '      var text = "";',
    '      for (var end = start; end < currentLookup.words.length; end += 1) {',
    '        text += getWordCharacter(currentLookup.words[end]);',
    '        if (text === word && start <= currentLookup.activeIndex && currentLookup.activeIndex <= end) {',
    '          currentLookup.start = start;',
    '          currentLookup.end = end + 1;',
    '          applyHighlights();',
    '          return;',
    '        }',
    '        if (text.length >= word.length) break;',
    '      }',
    '    }',
    '  }',
    '  function buildLookupPayload(mode) {',
    '    if (!currentLookup) return null;',
    '    return {',
    '      type: "definition-press",',
    '      lookupId: currentLookup.lookupId,',
    '      lookupMode: mode,',
    '      chineseContext: currentLookup.words.map(getWordCharacter).join(""),',
    '      characterIndex: currentLookup.activeIndex,',
    '      selectedWord: getSelectedText(),',
    '      selectedStart: currentLookup.start,',
    '      selectedEnd: currentLookup.end,',
    '      segmentLength: currentLookup.words.length,',
    '      fallbackWord: getWordCharacter(currentLookup.words[currentLookup.activeIndex])',
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
    '    var segment = collectSegmentWords(target);',
    '    var lookupId = "hv-definition-" + Date.now() + "-" + lookupCounter;',
    '    lookupCounter += 1;',
    '    currentLookup = { lookupId: lookupId, words: segment.words, activeIndex: segment.position, start: segment.position, end: segment.position + 1, mode: "best" };',
    '    requestLookup("best");',
    '  }',
    '  function handleDialogAction(action) {',
    '    if (!currentLookup) return;',
    '    if (action === "close") { clearLookup(); return; }',
    '    if (action === "prev" && currentLookup.activeIndex > 0) {',
    '      currentLookup.activeIndex -= 1;',
    '      currentLookup.start = currentLookup.activeIndex;',
    '      currentLookup.end = currentLookup.activeIndex + 1;',
    '      requestLookup("exact");',
    '      return;',
    '    }',
    '    if (action === "next" && currentLookup.activeIndex < currentLookup.words.length - 1) {',
    '      currentLookup.activeIndex += 1;',
    '      currentLookup.start = currentLookup.activeIndex;',
    '      currentLookup.end = currentLookup.activeIndex + 1;',
    '      requestLookup("exact");',
    '      return;',
    '    }',
    '    if (action === "shrink" && currentLookup.end - currentLookup.start > 1) {',
    '      if (currentLookup.end - 1 > currentLookup.activeIndex) currentLookup.end -= 1;',
    '      else currentLookup.start += 1;',
    '      requestLookup("exact");',
    '      return;',
    '    }',
    '    if (action === "expand") {',
    '      if (currentLookup.end < currentLookup.words.length) currentLookup.end += 1;',
    '      else if (currentLookup.start > 0) currentLookup.start -= 1;',
    '      requestLookup("exact");',
    '    }',
    '  }',
    '  window.__HVBROWSER_DEFINITION_LOOKUP__ACTION__ = handleDialogAction;',
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

export function stripPresentationHtmlWithHvDefinitions(
  html: string,
  fontSize: number,
  dictionary: Record<string, string>,
  readerTheme: Theme['reader'],
): string {
  let segmentId = 0;
  const output = stripPresentationMarkup(html).replace(/>([^<>]+)</g, (_, text: string) => {
    if (!text.trim()) return `>${text}<`;
    segmentId += 1;
    return `>${annotateHanVietTextWithDefinitions(text, dictionary, segmentId)}<`;
  });

  const injected = [
    buildReaderStyle(fontSize, readerTheme),
    buildDefinitionLookupEnhancements(),
  ].join('');

  return injectIntoHead(output, injected);
}

export function stripPresentationHtmlWithChineseDefinitions(
  html: string,
  fontSize: number,
  readerTheme: Theme['reader'],
): string {
  let segmentId = 0;
  const output = stripPresentationMarkup(html).replace(/>([^<>]+)</g, (_, text: string) => {
    if (!text.trim()) return `>${text}<`;
    segmentId += 1;
    return `>${annotateChineseTextWithDefinitions(text, segmentId)}<`;
  });

  const injected = [
    buildReaderStyle(fontSize, readerTheme),
    buildDefinitionLookupEnhancements(),
  ].join('');

  return injectIntoHead(output, injected);
}
