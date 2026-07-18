import { Buffer } from 'buffer';
import { importDatabaseFromAssetAsync, openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

export interface DefinitionEntry {
  word: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
}

interface DefinitionRow {
  word: string;
  pinyin: string;
  hv: string;
  meaning: string;
}

interface DefinitionWordIndexBucketAsset {
  length: number;
  count: number;
  text: string;
  offsetsBase64: string;
}

interface DefinitionWordIndexAsset {
  version: number;
  source: string;
  maxLookupWordLength: number;
  wordCount: number;
  buckets: DefinitionWordIndexBucketAsset[];
}

interface DefinitionWordIndexBucket {
  length: number;
  count: number;
  text: string;
  offsets: Uint32Array;
}

interface DefinitionWordIndex {
  maxLookupWordLength: number;
  bucketsByLength: Map<number, DefinitionWordIndexBucket>;
}

interface DefinitionContextCache {
  chineseContext: string;
  entriesByWord: Map<string, DefinitionEntry | null>;
  matchedWordsByIndex: Map<number, string | null>;
}

const DATABASE_NAME = 'TrungVietDictionary-v2.sqlite';
const DATABASE_ASSET = require('../data/TrungVietDictionary.sqlite');
const DEFINITION_WORD_INDEX_ASSET =
  require('../data/definition-word-index.json') as DefinitionWordIndexAsset;

const MAX_LOOKUP_WORD_LENGTH = 17;

let databasePromise: Promise<SQLiteDatabase> | null = null;
let wordIndex: DefinitionWordIndex | null = null;
let contextCache: DefinitionContextCache | null = null;

function toCharacters(value: string): string[] {
  return Array.from(value || '');
}

async function getDefinitionDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      await importDatabaseFromAssetAsync(DATABASE_NAME, { assetId: DATABASE_ASSET });
      const database = await openDatabaseAsync(DATABASE_NAME);
      await database.execAsync('PRAGMA query_only = ON;');
      return database;
    })();
  }

  return databasePromise;
}

function toDefinitionEntry(row: DefinitionRow): DefinitionEntry {
  return {
    word: row.word,
    pinyin: row.pinyin,
    hanViet: row.hv,
    meaning: row.meaning,
  };
}

function getContextCache(chineseContext?: string | null): DefinitionContextCache | null {
  if (!chineseContext) {
    return null;
  }

  if (contextCache?.chineseContext !== chineseContext) {
    contextCache = {
      chineseContext,
      entriesByWord: new Map(),
      matchedWordsByIndex: new Map(),
    };
  }

  return contextCache;
}

function decodeOffsets(base64: string): Uint32Array {
  const bytes = Buffer.from(base64, 'base64');
  const offsets = new Uint32Array(bytes.length / 4);

  for (let index = 0; index < offsets.length; index += 1) {
    offsets[index] = bytes.readUInt32LE(index * 4);
  }

  return offsets;
}

function getDefinitionWordIndex(): DefinitionWordIndex {
  if (!wordIndex) {
    const bucketsByLength = new Map<number, DefinitionWordIndexBucket>();

    for (const bucket of DEFINITION_WORD_INDEX_ASSET.buckets) {
      bucketsByLength.set(bucket.length, {
        length: bucket.length,
        count: bucket.count,
        text: bucket.text,
        offsets: decodeOffsets(bucket.offsetsBase64),
      });
      bucket.offsetsBase64 = '';
    }

    wordIndex = {
      maxLookupWordLength: Math.min(
        MAX_LOOKUP_WORD_LENGTH,
        DEFINITION_WORD_INDEX_ASSET.maxLookupWordLength,
      ),
      bucketsByLength,
    };
  }

  return wordIndex;
}

export async function initializeDefinitionWordIndex(): Promise<void> {
  getDefinitionWordIndex();
}

function getBucketWord(bucket: DefinitionWordIndexBucket, index: number): string {
  const start = bucket.offsets[index];
  const end = index + 1 < bucket.count ? bucket.offsets[index + 1] - 1 : bucket.text.length - 1;
  return bucket.text.slice(start, end);
}

function bucketHasWord(bucket: DefinitionWordIndexBucket, word: string): boolean {
  let low = 0;
  let high = bucket.count - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = getBucketWord(bucket, middle);

    if (current === word) {
      return true;
    }

    if (current < word) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return false;
}

function findWordIndexMatchContainingIndex(
  index: DefinitionWordIndex,
  chineseContext: string,
  characterIndex: number,
): string | null {
  const characters = toCharacters(chineseContext);
  if (characters.length === 0) {
    return null;
  }

  const targetIndex = Math.max(0, Math.min(characters.length - 1, Math.floor(characterIndex)));
  const maxLength = Math.min(index.maxLookupWordLength, characters.length);

  for (let length = maxLength; length >= 1; length -= 1) {
    const bucket = index.bucketsByLength.get(length);
    if (!bucket) {
      continue;
    }

    const firstStart = Math.max(0, targetIndex - length + 1);
    const lastStart = Math.min(targetIndex, characters.length - length);

    for (let start = firstStart; start <= lastStart; start += 1) {
      const word = characters.slice(start, start + length).join('');
      if (bucketHasWord(bucket, word)) {
        return word;
      }
    }
  }

  return null;
}

export async function findDefinitionByWord(
  word: string,
  options?: { chineseContext?: string | null },
): Promise<DefinitionEntry | null> {
  const trimmedWord = word.trim();
  if (!trimmedWord) {
    return null;
  }

  const cache = getContextCache(options?.chineseContext);
  if (cache?.entriesByWord.has(trimmedWord)) {
    return cache.entriesByWord.get(trimmedWord) ?? null;
  }

  const database = await getDefinitionDatabase();
  const row = await database.getFirstAsync<DefinitionRow>(
    'SELECT word, pinyin, hv, meaning FROM definitions WHERE word = ?',
    trimmedWord,
  );
  const entry = row ? toDefinitionEntry(row) : null;

  cache?.entriesByWord.set(trimmedWord, entry);
  return entry;
}

export async function findBestDefinitionMatch(
  chineseContext: string,
  characterIndex: number,
): Promise<DefinitionEntry | null> {
  const index = getDefinitionWordIndex();
  const cache = getContextCache(chineseContext);
  const safeCharacterIndex = Math.max(0, Math.floor(characterIndex));
  let matchedWord: string | null | undefined = cache?.matchedWordsByIndex.get(safeCharacterIndex);

  if (matchedWord === undefined) {
    matchedWord = findWordIndexMatchContainingIndex(index, chineseContext, safeCharacterIndex);
    cache?.matchedWordsByIndex.set(safeCharacterIndex, matchedWord);
  }

  if (!matchedWord) {
    return null;
  }

  return await findDefinitionByWord(matchedWord, { chineseContext });
}
