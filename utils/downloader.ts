import encoding from 'encoding-japanese';
import iconv from 'iconv-lite';
import { Buffer } from 'buffer';

// Ensure Buffer is available globally (required by iconv-lite on Hermes)
if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = Buffer;
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
      codePt =
        ((byte1 & 0x0f) << 12) |
        ((array[i++] & 0x3f) << 6) |
        (array[i++] & 0x3f);
    } else if (typeof String.fromCodePoint !== 'undefined') {
      codePt =
        ((byte1 & 0x07) << 18) |
        ((array[i++] & 0x3f) << 12) |
        ((array[i++] & 0x3f) << 6) |
        (array[i++] & 0x3f);
    } else {
      codePt = 63; // Cannot convert four byte code points, use "?"
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

export async function downloadHtmlPage(url: string): Promise<string> {
  console.log('Download from: ' + url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return '';
  }

  const byteArray = new Uint8Array(arrayBuffer);
  const detected = encoding.detect(byteArray) as string;

  if (detected === 'UTF8' || detected === 'ASCII') {
    try {
      return new TextDecoder('utf-8').decode(byteArray);
    } catch {
      return utf8ArrayToStr(byteArray);
    }
  }

  const iconvEncoding = mapEncoding(detected);
  return iconv.decode(Buffer.from(byteArray), iconvEncoding);
}

export async function convertHtmlPageToHV(
  htmlContent: string,
  dictionary: Record<string, string>
): Promise<string> {
  const converts: string[] = [];

  for (let idx = 0; idx < htmlContent.length; idx++) {
    const ch = htmlContent[idx];
    const hvWord = dictionary[ch];
    converts.push(hvWord ? hvWord + ' ' : ch);
  }

  return converts.join('');
}
