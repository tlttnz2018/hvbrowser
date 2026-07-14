import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync as legacyCopyAsync } from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';

import type { OfflineChapterRecord, OfflineStoryRecord } from '../db/offline';
import { saveOfflineChapter, upsertOfflineStory } from '../db/offline';
import { useAppStore } from '../stores/useAppStore';

type TxtBytes = Uint8Array<ArrayBufferLike>;

interface TxtImportFile {
  uri: string;
  open: () => TxtFileHandle;
  size?: number;
  sourceFileName?: string;
}

interface TxtFileHandle {
  close: () => void;
  readBytes: (length: number) => TxtBytes;
  size: number | null;
}

interface TxtImportResult {
  story: OfflineStoryRecord;
  chapter: OfflineChapterRecord | null;
  chapterCount: number;
}

type TxtEncoding = 'utf-8' | 'gbk';

const TXT_CHAPTER_CHUNK_BYTES = 200 * 1024;
const MIN_LINE_BREAK_CHUNK_BYTES = Math.floor(TXT_CHAPTER_CHUNK_BYTES * 0.6);
const READ_BUFFER_BYTES = 64 * 1024;
const TXT_CACHE_ROOT = new Directory(Paths.cache, 'txt-imports');

let iconvDecode: ((buf: TxtBytes, enc: string) => string) | null = null;

if (Platform.OS !== 'web') {
  const { Buffer } = require('buffer');
  const iconv = require('iconv-lite');
  iconvDecode = (buf: TxtBytes, enc: string) => iconv.decode(Buffer.from(buf), enc);
}

function basenameFromUri(uri: string) {
  const cleanUri = uri.split('?')[0].split('#')[0];
  const name = cleanUri.slice(cleanUri.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function stripTxtExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

function sanitizeCacheFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'book.txt';
}

function ensureDirectory(directory: Directory) {
  directory.create({ idempotent: true, intermediates: true });
}

async function copyPickedTxtToCache(source: TxtImportFile, fileName: string) {
  ensureDirectory(TXT_CACHE_ROOT);

  const target = new File(TXT_CACHE_ROOT, `${Date.now()}-${sanitizeCacheFileName(fileName)}`);
  if (target.exists) {
    target.delete();
  }

  await legacyCopyAsync({
    from: source.uri,
    to: target.uri,
  });

  return target;
}

function hasUtf8Bom(bytes: TxtBytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

interface Utf8ValidationState {
  expected: number;
  codePoint: number;
  minCodePoint: number;
}

function validateUtf8Byte(byte: number, state: Utf8ValidationState) {
  if (state.expected === 0) {
    if (byte <= 0x7f) {
      return true;
    }

    if (byte < 0xc2 || byte > 0xf4) {
      return false;
    }

    if (byte <= 0xdf) {
      state.expected = 1;
      state.codePoint = byte & 0x1f;
      state.minCodePoint = 0x80;
      return true;
    }

    if (byte <= 0xef) {
      state.expected = 2;
      state.codePoint = byte & 0x0f;
      state.minCodePoint = 0x800;
      return true;
    }

    state.expected = 3;
    state.codePoint = byte & 0x07;
    state.minCodePoint = 0x10000;
    return true;
  }

  if ((byte & 0xc0) !== 0x80) {
    return false;
  }

  state.codePoint = (state.codePoint << 6) | (byte & 0x3f);
  state.expected -= 1;

  if (state.expected === 0) {
    if (
      state.codePoint < state.minCodePoint ||
      state.codePoint > 0x10ffff ||
      (state.codePoint >= 0xd800 && state.codePoint <= 0xdfff)
    ) {
      return false;
    }
  }

  return true;
}

function validateUtf8Bytes(bytes: TxtBytes, state: Utf8ValidationState, start = 0) {
  for (let index = start; index < bytes.length; index += 1) {
    if (!validateUtf8Byte(bytes[index], state)) {
      return false;
    }
  }

  return true;
}

function detectTxtEncoding(file: TxtImportFile): TxtEncoding {
  const handle = file.open();
  const state: Utf8ValidationState = { expected: 0, codePoint: 0, minCodePoint: 0 };
  let firstChunk = true;

  try {
    while (true) {
      const bytes = handle.readBytes(READ_BUFFER_BYTES);
      if (bytes.length === 0) {
        return state.expected === 0 ? 'utf-8' : 'gbk';
      }

      const start = firstChunk && hasUtf8Bom(bytes) ? 3 : 0;
      firstChunk = false;

      if (!validateUtf8Bytes(bytes, state, start)) {
        return 'gbk';
      }
    }
  } finally {
    handle.close();
  }
}

function decodeTxtBytes(bytes: TxtBytes, encoding: TxtEncoding) {
  if (encoding === 'utf-8') {
    return new TextDecoder('utf-8').decode(bytes);
  }

  if (Platform.OS === 'web') {
    return new TextDecoder('gbk').decode(bytes);
  }

  return iconvDecode!(bytes, 'gbk');
}

function getSafeUtf8ChunkEnd(bytes: TxtBytes, start: number, targetEnd: number) {
  let end = Math.min(targetEnd, bytes.length);
  if (end >= bytes.length) {
    return bytes.length;
  }

  while (end > start && (bytes[end] & 0xc0) === 0x80) {
    end -= 1;
  }

  return end > start ? end : targetEnd;
}

function getSafeGbkChunkEnd(bytes: TxtBytes, start: number, targetEnd: number) {
  const end = Math.min(targetEnd, bytes.length);
  let index = start;

  while (index < end) {
    const byte = bytes[index];
    if (byte >= 0x81 && byte <= 0xfe) {
      if (index + 1 >= end) {
        return index;
      }
      index += 2;
      continue;
    }

    index += 1;
  }

  return end;
}

function preferLineBreakChunkEnd(bytes: TxtBytes, start: number, end: number) {
  const minEnd = start + MIN_LINE_BREAK_CHUNK_BYTES;
  for (let index = end - 1; index >= minEnd; index -= 1) {
    if (bytes[index] === 0x0a) {
      return index + 1;
    }
  }

  return end;
}

function concatBytes(left: TxtBytes, right: TxtBytes): TxtBytes {
  if (left.length === 0) {
    return right;
  }
  if (right.length === 0) {
    return left;
  }

  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function getChunkEnd(bytes: TxtBytes, encoding: TxtEncoding, forceSplit: boolean) {
  if (!forceSplit || bytes.length <= TXT_CHAPTER_CHUNK_BYTES) {
    return bytes.length;
  }

  const targetEnd = TXT_CHAPTER_CHUNK_BYTES;
  const safeEnd =
    encoding === 'utf-8'
      ? getSafeUtf8ChunkEnd(bytes, 0, targetEnd)
      : getSafeGbkChunkEnd(bytes, 0, targetEnd);

  return preferLineBreakChunkEnd(bytes, 0, safeEnd);
}

function yieldToApp() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plainTextToReaderHtml(text: string, title: string) {
  const normalizedText = text.replace(/\r\n?/g, '\n').trim();
  const blocks = normalizedText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const body =
    blocks.length > 0
      ? blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`).join('\n')
      : '<p></p>';

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

export async function importTxtFile(file: TxtImportFile): Promise<TxtImportResult> {
  const fileName = file.sourceFileName || basenameFromUri(file.uri) || 'book.txt';
  const title = stripTxtExtension(fileName) || 'TXT Book';
  const encoding = detectTxtEncoding(file);
  const story = await upsertOfflineStory({
    name: title,
    sourceType: 'txt',
    sourceFileName: fileName,
  });
  const fileSize = file.size ?? null;
  const splitImport = fileSize == null || fileSize > TXT_CHAPTER_CHUNK_BYTES;
  const handle = file.open();
  const downloadedAt = new Date().toISOString();
  let pendingBytes: TxtBytes = new Uint8Array();
  let firstChapter: OfflineChapterRecord | null = null;
  let chapterCount = 0;

  async function saveNextChapter(text: string) {
    const chapterNumber = chapterCount + 1;
    const chapterTitle =
      splitImport && fileSize !== 0
        ? `${title} - Part ${String(chapterNumber).padStart(2, '0')}`
        : title;

    const chapter = await saveOfflineChapter({
      storyId: story.id,
      chapterName: chapterTitle,
      chapterUrl: `txt://story/${story.id}/chapter/${chapterNumber}`,
      chapterOrder: chapterNumber,
      originalHtml: plainTextToReaderHtml(text, chapterTitle),
      convertedHvHtml: '',
      downloadStatus: 'downloaded',
      downloadError: null,
      downloadedAt,
    });

    if (!firstChapter) {
      firstChapter = chapter;
    }
    chapterCount = chapterNumber;
  }

  try {
    while (true) {
      const bytes = handle.readBytes(READ_BUFFER_BYTES);
      const reachedEnd = bytes.length === 0;
      pendingBytes = concatBytes(pendingBytes, bytes);

      while (
        (splitImport && pendingBytes.length > TXT_CHAPTER_CHUNK_BYTES) ||
        (reachedEnd && pendingBytes.length > 0)
      ) {
        const end = getChunkEnd(pendingBytes, encoding, splitImport && !reachedEnd);
        const chunkBytes = pendingBytes.slice(0, end);
        pendingBytes = pendingBytes.slice(end);

        await saveNextChapter(decodeTxtBytes(chunkBytes, encoding));
        await yieldToApp();
      }

      if (reachedEnd) {
        break;
      }
    }
  } finally {
    handle.close();
  }

  if (chapterCount === 0) {
    await saveNextChapter('');
  }

  await useAppStore.getState().refreshOfflineLibrary();

  return { story, chapter: firstChapter, chapterCount };
}

export async function importTxtFromPicker(): Promise<TxtImportResult | null> {
  try {
    const pickedFile = await File.pickFileAsync(undefined, 'text/plain');
    const file = Array.isArray(pickedFile) ? pickedFile[0] : pickedFile;

    if (!file) {
      return null;
    }

    const fileName = basenameFromUri(file.uri) || 'book.txt';
    const importFile = await copyPickedTxtToCache(file, fileName);
    try {
      return await importTxtFile({
        uri: importFile.uri,
        open: () => importFile.open(),
        size: importFile.size,
        sourceFileName: fileName,
      });
    } finally {
      if (importFile.exists) {
        importFile.delete();
      }
    }
  } catch (error) {
    if (Platform.OS === 'web') {
      Alert.alert('TXT import failed', 'TXT import is not available in this build.');
      return null;
    }

    const message = error instanceof Error ? error.message : 'Unable to import TXT file.';
    Alert.alert('TXT import failed', message);
    return null;
  }
}
