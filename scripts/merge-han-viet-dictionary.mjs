import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Database } from 'bun:sqlite';

const baseMapPath = resolve('data/DataHanVietUni.json');
const overrideMapPath = resolve('data/newChinesePhienAm.json');
const databasePath = resolve('data/TrungVietDictionary.sqlite');

function toCharacters(value) {
  return Array.from(value || '');
}

function toHanVietText(word, dictionary) {
  return toCharacters(word)
    .map((character) => dictionary[character] || character)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

const baseMap = JSON.parse(await readFile(baseMapPath, 'utf8'));
const overrideMap = await readJsonIfExists(overrideMapPath);
const mergedMap = Object.fromEntries(
  Object.entries({
    ...baseMap,
    ...overrideMap,
  }).filter(([key]) => key.trim()),
);

await writeFile(baseMapPath, `${JSON.stringify(mergedMap, null, 2)}\n`);

const database = new Database(databasePath);
const columns = database.query('PRAGMA table_info(definitions)').all();

if (!columns.some((column) => column.name === 'hv')) {
  database.run("ALTER TABLE definitions ADD COLUMN hv TEXT NOT NULL DEFAULT ''");
}

const rows = database.query('SELECT word FROM definitions').all();
const update = database.prepare('UPDATE definitions SET hv = ? WHERE word = ?');

database.transaction(() => {
  for (const row of rows) {
    const word = String(row.word || '').trim();
    update.run(toHanVietText(word, mergedMap), word);
  }
})();

database.run('VACUUM');

console.log(
  `Merged ${Object.keys(overrideMap).length} overrides into ${baseMapPath} and populated hv for ${rows.length} dictionary rows.`,
);
