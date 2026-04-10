function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function buildReaderStyle(fontSize: number): string {
  return [
    '<style>',
    'html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #111 !important; }',
    `body { padding: 16px 14px 24px !important; font-size: ${fontSize}em !important; line-height: 1.75 !important; word-break: break-word !important; }`,
    '* { max-width: 100% !important; box-sizing: border-box !important; }',
    'table { width: 100% !important; display: block !important; }',
    'tr, td, tbody, thead { display: block !important; width: 100% !important; }',
    'img { height: auto !important; }',
    'a { color: #0a58ca !important; text-decoration: none !important; }',
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
  output = output.replace(/\s(on[a-z]+|class|id|style|bgcolor|align|valign|width|height|border|cellpadding|cellspacing|nowrap)=(".*?"|'.*?'|[^\s>]+)/gi, '');
  output = output.replace(/&nbsp;/gi, ' ');

  return output;
}

function injectIntoHead(html: string, injected: string): string {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${injected}`);
  }

  return `<head>${injected}</head>${html}`;
}

function annotateHanVietText(text: string, dictionary: Record<string, string>): string {
  let output = '';

  for (const ch of text) {
    const hvWord = dictionary[ch];
    if (hvWord) {
      output += `<span class="hv-word" data-original="${escapeAttribute(ch)}">${escapeHtml(hvWord)}</span> `;
    } else {
      output += escapeHtml(ch);
    }
  }

  return output;
}

function annotateHanVietTextWithPinyin(
  text: string,
  dictionary: Record<string, string>,
  pinyinDictionary: Record<string, string>
): string {
  let output = '';

  for (const ch of text) {
    const hvWord = dictionary[ch];
    if (hvWord) {
      const pinyin = pinyinDictionary[ch] || '';
      const tooltip = pinyin ? `${ch}\n${pinyin}` : ch;
      output += `<span class="hv-word" data-original="${escapeAttribute(tooltip)}">${escapeHtml(hvWord)}</span> `;
    } else {
      output += escapeHtml(ch);
    }
  }

  return output;
}

function annotateChineseTextWithPinyin(
  text: string,
  dictionary: Record<string, string>,
  pinyinDictionary: Record<string, string>
): string {
  let output = '';

  for (const ch of text) {
    const hvWord = dictionary[ch];
    if (hvWord) {
      const pinyin = pinyinDictionary[ch] || '';
      const tooltip = pinyin ? `${pinyin}\n${hvWord}` : hvWord;
      output += `<span class="hv-word" data-original="${escapeAttribute(tooltip)}">${escapeHtml(ch)}</span>`;
    } else {
      output += escapeHtml(ch);
    }
  }

  return output;
}

export function stripPresentationHtml(html: string, fontSize: number): string {
  const output = stripPresentationMarkup(html);
  return injectIntoHead(output, buildReaderStyle(fontSize));
}

function buildTooltipEnhancements(): string {
  return [
    '<style>',
    '.hv-word { cursor: pointer; }',
    '.hv-word.active { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 0.14em; }',
    '#hv-tooltip {',
    '  position: fixed;',
    '  left: 0;',
    '  top: 0;',
    '  display: none;',
    '  background: #fff;',
    '  color: #0b5d1e;',
    '  border: 2px solid #4e342e;',
    '  padding: 6px 10px;',
    '  border-radius: 6px;',
    '  font-size: 1.5em;',
    '  font-weight: 700;',
    '  line-height: 1.2;',
    '  white-space: nowrap;',
    '  z-index: 9999;',
    '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);',
    '  pointer-events: none;',
    '}',
    '#hv-tooltip .hv-tooltip-line { display: block; white-space: nowrap; }',
    '#hv-tooltip .hv-tooltip-line:first-child { color: #0d3b66; }',
    '#hv-tooltip .hv-tooltip-line + .hv-tooltip-line { margin-top: 2px; color: #0b5d1e; }',
    '</style>',
    '<script>',
    '(function() {',
    '  var tooltip = document.createElement("div");',
    '  tooltip.id = "hv-tooltip";',
    '  function ensureTooltip() { if (document.body && !tooltip.parentNode) document.body.appendChild(tooltip); }',
    '  ensureTooltip();',
    '  document.addEventListener("DOMContentLoaded", ensureTooltip);',
    '  function hideTooltip() {',
    '    tooltip.style.display = "none";',
    '    var active = document.querySelector(".hv-word.active");',
    '    if (active) active.classList.remove("active");',
    '  }',
    '  function showTooltip(target) {',
    '    ensureTooltip();',
    '    var active = document.querySelector(".hv-word.active");',
    '    if (active && active !== target) active.classList.remove("active");',
    '    target.classList.add("active");',
    '    var content = target.getAttribute("data-original") || "";',
    '    tooltip.innerHTML = content.split("\\n").map(function(line) {',
    '      return \'<span class="hv-tooltip-line">\' + line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</span>";',
    '    }).join("");',
    '    tooltip.style.display = "block";',
    '    var rect = target.getBoundingClientRect();',
    '    var tipRect = tooltip.getBoundingClientRect();',
    '    var margin = 8;',
    '    var left = rect.left + (rect.width / 2) - (tipRect.width / 2);',
    '    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));',
    '    var top = rect.top - tipRect.height - 8;',
    '    if (top < margin) top = Math.min(window.innerHeight - tipRect.height - margin, rect.bottom + 8);',
    '    tooltip.style.left = left + "px";',
    '    tooltip.style.top = Math.max(margin, top) + "px";',
    '  }',
    '  document.addEventListener("click", function(event) {',
    '    var current = event.target && event.target.closest ? event.target.closest(".hv-word") : null;',
    '    if (!current) { hideTooltip(); return; }',
    '    var active = document.querySelector(".hv-word.active");',
    '    if (tooltip.style.display === "block" && active === current) {',
    '      hideTooltip();',
    '    } else {',
      '      showTooltip(current);',
    '    }',
    '    event.preventDefault();',
    '  });',
    '  window.addEventListener("scroll", hideTooltip, true);',
    '  window.addEventListener("resize", hideTooltip);',
    '})();',
    '</script>',
  ].join('');
}

export function stripPresentationHtmlWithHvTooltips(
  html: string,
  fontSize: number,
  dictionary: Record<string, string>,
  pinyinDictionary: Record<string, string>
): string {
  const output = stripPresentationMarkup(html).replace(/>([^<>]+)</g, (_, text: string) => {
    if (!text.trim()) return `>${text}<`;
    return `>${annotateHanVietTextWithPinyin(text, dictionary, pinyinDictionary)}<`;
  });

  const injected = [buildReaderStyle(fontSize), buildTooltipEnhancements()].join('');

  return injectIntoHead(output, injected);
}

export function stripPresentationHtmlWithChineseTooltips(
  html: string,
  fontSize: number,
  dictionary: Record<string, string>,
  pinyinDictionary: Record<string, string>
): string {
  const output = stripPresentationMarkup(html).replace(/>([^<>]+)</g, (_, text: string) => {
    if (!text.trim()) return `>${text}<`;
    return `>${annotateChineseTextWithPinyin(text, dictionary, pinyinDictionary)}<`;
  });

  const injected = [buildReaderStyle(fontSize), buildTooltipEnhancements()].join('');

  return injectIntoHead(output, injected);
}
