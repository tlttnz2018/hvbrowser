import {
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  SQLiteDatabase,
  SQLiteVariadicBindParams,
} from 'expo-sqlite';

export interface DefinitionEntry {
  word: string;
  pinyin: string;
  meaning: string;
}

interface DefinitionRow {
  word: string;
  pinyin: string;
  meaning: string;
}

const DATABASE_NAME = 'TrungVietDictionary-v1.sqlite';
const DATABASE_ASSET = require('../data/TrungVietDictionary.sqlite');

const MAX_LOOKUP_WORD_LENGTH = 17;

let databasePromise: Promise<SQLiteDatabase> | null = null;

function toCharacters(value: string): string[] {
  return Array.from(value || '');
}

async function getDefinitionDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      await importDatabaseFromAssetAsync(DATABASE_NAME, {
        assetId: DATABASE_ASSET,
      });
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
    meaning: row.meaning,
  };
}

function buildLookupCandidates(chineseContext: string, characterIndex: number): string[] {
  const characters = toCharacters(chineseContext);
  if (characters.length === 0) {
    return [];
  }

  const targetIndex = Math.max(0, Math.min(characters.length - 1, Math.floor(characterIndex)));
  const maxLength = Math.min(MAX_LOOKUP_WORD_LENGTH, characters.length);
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (let length = maxLength; length >= 1; length -= 1) {
    const firstStart = Math.max(0, targetIndex - length + 1);
    const lastStart = Math.min(targetIndex, characters.length - length);

    for (let start = firstStart; start <= lastStart; start += 1) {
      const word = characters.slice(start, start + length).join('');
      if (!seen.has(word)) {
        seen.add(word);
        candidates.push(word);
      }
    }
  }

  return candidates;
}

export async function findDefinitionByWord(word: string): Promise<DefinitionEntry | null> {
  const database = await getDefinitionDatabase();
  const row = await database.getFirstAsync<DefinitionRow>(
    'SELECT word, pinyin, meaning FROM definitions WHERE word = ?',
    word,
  );

  return row ? toDefinitionEntry(row) : null;
}

export async function findBestDefinitionMatch(
  chineseContext: string,
  characterIndex: number,
): Promise<DefinitionEntry | null> {
  const candidates = buildLookupCandidates(chineseContext, characterIndex);
  if (candidates.length === 0) {
    return null;
  }

  const database = await getDefinitionDatabase();
  const placeholders = candidates.map(() => '?').join(', ');
  const rows = await database.getAllAsync<DefinitionRow>(
    `SELECT word, pinyin, meaning FROM definitions WHERE word IN (${placeholders})`,
    candidates as SQLiteVariadicBindParams,
  );
  const rowsByWord = new Map(rows.map((row) => [row.word, row]));

  for (const candidate of candidates) {
    const row = rowsByWord.get(candidate);
    if (row) {
      return toDefinitionEntry(row);
    }
  }

  return null;
}
