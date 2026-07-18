import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Database } from 'bun:sqlite';

const databasePath = resolve('data/TrungVietDictionary.sqlite');
const outputPath = resolve('data/definition-word-index.json');
const maxLookupWordLength = 17;

function toCharacters(value) {
  return Array.from(value || '');
}

function encodeOffsets(offsets) {
  const buffer = Buffer.allocUnsafe(offsets.length * 4);
  offsets.forEach((offset, index) => {
    buffer.writeUInt32LE(offset, index * 4);
  });
  return buffer.toString('base64');
}

const database = new Database(databasePath, { readonly: true });
const rows = database
  .query('SELECT word FROM definitions WHERE length(word) <= ? ORDER BY word')
  .all(maxLookupWordLength);

const wordsByLength = new Map();

for (const row of rows) {
  const word = String(row.word || '').trim();
  const length = toCharacters(word).length;
  if (!word || length > maxLookupWordLength) {
    continue;
  }

  const words = wordsByLength.get(length) ?? [];
  words.push(word);
  wordsByLength.set(length, words);
}

const buckets = Array.from(wordsByLength.entries())
  .sort(([leftLength], [rightLength]) => leftLength - rightLength)
  .map(([length, words]) => {
    const uniqueWords = Array.from(new Set(words)).sort();
    const offsets = [];
    let text = '';

    for (const word of uniqueWords) {
      offsets.push(text.length);
      text += `${word}\n`;
    }

    return {
      length,
      count: uniqueWords.length,
      text,
      offsetsBase64: encodeOffsets(offsets),
    };
  });

const index = {
  version: 1,
  source: 'TrungVietDictionary.sqlite',
  maxLookupWordLength,
  wordCount: buckets.reduce((total, bucket) => total + bucket.count, 0),
  buckets,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index)}\n`);

console.log(
  `Generated ${outputPath} with ${index.wordCount} words across ${buckets.length} length buckets.`,
);
