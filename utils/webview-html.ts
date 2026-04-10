function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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

export function stripPresentationHtml(html: string, fontSize: number): string {
  if (!html) return html;

  let output = html;

  output = output.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  output = output.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  output = output.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '');
  output = output.replace(/\s(on[a-z]+|class|id|style|bgcolor|align|valign|width|height|border|cellpadding|cellspacing|nowrap)=(".*?"|'.*?'|[^\s>]+)/gi, '');

  const readerStyle = [
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

  if (/<head\b[^>]*>/i.test(output)) {
    return output.replace(/<head\b[^>]*>/i, (match) => `${match}\n${readerStyle}`);
  }

  return `<head>${readerStyle}</head>${output}`;
}
