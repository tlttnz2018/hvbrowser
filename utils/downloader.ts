import { Platform } from 'react-native';

import { cleanupHtml } from './cleanup';

// iconv-lite and encoding-japanese are only used on native (require Buffer + string_decoder)
// On web, the browser handles encoding natively via its own TextDecoder
let icovDecode: ((buf: Uint8Array, enc: string) => string) | null = null;
let detectEncoding: ((buf: Uint8Array) => string) | null = null;

if (Platform.OS !== 'web') {
  const { Buffer } = require('buffer');
  if (typeof global !== 'undefined' && !global.Buffer) {
    global.Buffer = Buffer;
  }

  const iconv = require('iconv-lite');

  const encodingJp = require('encoding-japanese');
  detectEncoding = (buf: Uint8Array) => encodingJp.detect(buf) as string;
  icovDecode = (buf: Uint8Array, enc: string) => iconv.decode(Buffer.from(buf), enc);
}

const charCache: string[] = new Array(128);
const charFromCodePt = (cp: number): string =>
  String.fromCodePoint ? String.fromCodePoint(cp) : String.fromCharCode(cp);

function utf8ArrayToStr(array: Uint8Array): string {
  const result: string[] = [];
  const buffLen = array.length;
  for (let i = 0; i < buffLen; ) {
    const byte1 = array[i++];
    let codePt: number;
    if (byte1 <= 0x7f) {
      codePt = byte1;
    } else if (byte1 <= 0xdf) {
      codePt = ((byte1 & 0x1f) << 6) | (array[i++] & 0x3f);
    } else if (byte1 <= 0xef) {
      codePt = ((byte1 & 0x0f) << 12) | ((array[i++] & 0x3f) << 6) | (array[i++] & 0x3f);
    } else if (typeof String.fromCodePoint !== 'undefined') {
      codePt =
        ((byte1 & 0x07) << 18) |
        ((array[i++] & 0x3f) << 12) |
        ((array[i++] & 0x3f) << 6) |
        (array[i++] & 0x3f);
    } else {
      codePt = 63;
      i += 3;
    }
    result.push(charCache[codePt] || (charCache[codePt] = charFromCodePt(codePt)));
  }
  return result.join('');
}

function mapEncoding(detected: string): string {
  switch (detected) {
    case 'SJIS':
      return 'shiftjis';
    case 'EUCJP':
      return 'euc-jp';
    case 'UNICODE':
      return 'utf-16le';
    default:
      return 'gbk';
  }
}

// Normalize charset name to iconv-lite compatible names
function normalizeCharset(raw: string): string | null {
  const s = raw.toLowerCase().replace(/[-_\s]/g, '');
  if (s === 'utf8' || s === 'utf8mb4') return 'utf-8';
  if (s === 'gbk' || s === 'gb2312' || s === 'gb18030' || s === 'csgb2312' || s === 'xgbk')
    return 'gbk';
  if (s === 'big5' || s === 'big5hkscs' || s === 'csbig5') return 'big5';
  if (s === 'shiftjis' || s === 'sjis' || s === 'csshiftjis' || s === 'xsjis') return 'shiftjis';
  if (s === 'eucjp' || s === 'xeucjp' || s === 'cseucpkdfmtjapanese') return 'euc-jp';
  return null;
}

// 1. Check HTTP Content-Type header for charset
// 2. Scan the first 2KB of raw bytes for <meta charset> / <meta http-equiv>
// 3. Fall back to encoding-japanese detection
// 4. Default to GBK (most Chinese novel sites use GBK/GB2312)
function resolveEncoding(byteArray: Uint8Array, contentType: string | null): string {
  // --- Priority 1: Content-Type header ---
  if (contentType) {
    const m = contentType.match(/charset\s*=\s*([^\s;,"']+)/i);
    if (m) {
      const enc = normalizeCharset(m[1]);
      if (enc) return enc;
    }
  }

  // --- Priority 2: <meta> tag in the first 2KB ---
  // Decode as latin1 (byte-safe, no loss) to scan for ASCII meta tags
  const headBytes = byteArray.slice(0, 2048);
  let headStr = '';
  for (let i = 0; i < headBytes.length; i++) {
    headStr += String.fromCharCode(headBytes[i]);
  }

  // <meta charset="gbk"> or <meta charset='gbk'>
  const m1 = headStr.match(/<meta[^>]+charset\s*=\s*["']?\s*([^"';\s>]+)/i);
  if (m1) {
    const enc = normalizeCharset(m1[1]);
    if (enc) return enc;
  }

  // <meta http-equiv="Content-Type" content="text/html; charset=gbk">
  const m2 = headStr.match(/content\s*=\s*["'][^"']*charset\s*=\s*([^"';\s>]+)/i);
  if (m2) {
    const enc = normalizeCharset(m2[1]);
    if (enc) return enc;
  }

  // --- Priority 3: encoding-japanese byte-pattern detection ---
  const detected = detectEncoding!(byteArray);
  if (
    detected === 'UTF8' ||
    detected === 'ASCII' ||
    detected === 'UTF16' ||
    detected === 'UTF16BE' ||
    detected === 'UTF16LE'
  ) {
    return 'utf-8';
  }
  if (detected === 'SJIS') return 'shiftjis';
  if (detected === 'EUCJP') return 'euc-jp';
  if (detected === 'UNICODE') return 'utf-16le';

  // --- Priority 4: default to GBK (correct for most Chinese novel sites) ---
  return 'gbk';
}

export async function downloadHtmlPage(url: string): Promise<string> {
  console.log('Download from: ' + url);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return '';

  const byteArray = new Uint8Array(arrayBuffer);

  // On web: use the browser's TextDecoder — it accepts any IANA charset name
  if (Platform.OS === 'web') {
    const contentType = response.headers.get('content-type');
    const charset = contentType?.match(/charset\s*=\s*([^\s;,"']+)/i)?.[1] ?? 'utf-8';
    try {
      return new TextDecoder(charset).decode(byteArray);
    } catch {
      return new TextDecoder('utf-8').decode(byteArray);
    }
  }

  // On native: full encoding resolution pipeline
  const contentType = response.headers.get('content-type');
  const encoding = resolveEncoding(byteArray, contentType);

  if (encoding === 'utf-8') {
    try {
      return new TextDecoder('utf-8').decode(byteArray);
    } catch {
      return utf8ArrayToStr(byteArray);
    }
  }

  return icovDecode!(byteArray, encoding);
}

export async function convertHtmlPageToHV(
  htmlContent: string,
  dictionary: Record<string, string>,
): Promise<string> {
  const converts: string[] = [];
  for (let idx = 0; idx < htmlContent.length; idx++) {
    const ch = htmlContent[idx];
    const hvWord = dictionary[ch];
    converts.push(hvWord ? hvWord + ' ' : ch);
  }
  return converts.join('');
}

export function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return titleMatch?.[1]?.trim() || '';
}

export function randomQueueRestMs() {
  return 1000 + Math.floor(Math.random() * 4001);
}

export async function sleepRandomQueueRest() {
  const duration = randomQueueRestMs();
  await new Promise((resolve) => setTimeout(resolve, duration));
  return duration;
}

export async function downloadOfflineChapterPayload(
  url: string,
  dictionary: Record<string, string>,
): Promise<{ originalHtml: string; convertedHvHtml: string; title: string }> {
  const originalHtml = await downloadHtmlPage(url);
  const cleanedHtml = (await cleanupHtml(originalHtml)) || originalHtml;
  const convertedHvHtml = await convertHtmlPageToHV(cleanedHtml, dictionary);
  const title = extractHtmlTitle(convertedHvHtml) || extractHtmlTitle(originalHtml) || url;

  return {
    originalHtml,
    convertedHvHtml,
    title,
  };
}
