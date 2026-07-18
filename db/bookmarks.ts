import AsyncStorage from '@react-native-async-storage/async-storage';
import { Generated, Kysely, Selectable } from 'kysely';

import {
  getBookmarkFavicon,
  getBookmarkImage,
  sanitizeBookmarkUrl,
  truncateBookmarkDescription,
  truncateBookmarkTitle,
} from '../utils/bookmarks';
import { createExpoSqliteDatabase, ExpoSqliteDialect } from './expoSqliteDialect';
import { AppMigration, runMigrations } from './runMigrations';

const DATABASE_NAME = 'hvbrowser.db';
const BOOKMARK_STORAGE_KEY = 'hv-browser-storage';
const OLD_BOOKMARK_KEY = 'HV_BROWSER_BOOKMARK_STORAGE_KEY';

interface BookmarkTable {
  id: Generated<number>;
  title: string;
  description: string;
  url: string;
  image: string | null;
  favicon: string | null;
  created_at: string;
  last_accessed_at: string;
}

interface DatabaseSchema {
  bookmarks: BookmarkTable;
}

type BookmarkRow = Selectable<BookmarkTable>;

interface LegacyBookmark {
  url?: string;
  desc?: string;
  title?: string;
}

interface PersistedStoreState {
  state?: {
    bookmarks?: LegacyBookmark[];
    lastViewUrl?: string;
  };
  version?: number;
}

export interface BookmarkRecord {
  id: number;
  title: string;
  description: string;
  url: string;
  image: string | null;
  favicon: string | null;
  createdAt: string;
  lastAccessedAt: string;
}

export interface BookmarkTransferRecord {
  title?: string;
  description?: string;
  desc?: string;
  url?: string;
  image?: string | null;
  favicon?: string | null;
  createdAt?: string;
  lastAccessedAt?: string;
}

export interface BookmarkTransferPayload {
  version: 1;
  exportedAt: string;
  bookmarks: BookmarkTransferRecord[];
}

const migrations: Record<string, AppMigration> = {
  '001_create_bookmarks_table': {
    async up(db) {
      await db.schema
        .createTable('bookmarks')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('url', 'text', (col) => col.notNull().unique())
        .addColumn('image', 'text')
        .addColumn('favicon', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('last_accessed_at', 'text', (col) => col.notNull())
        .execute();
    },
  },
  '002_add_bookmark_description': {
    async up(db) {
      await db.schema
        .alterTable('bookmarks')
        .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
        .execute();
    },
  },
};

const sqliteDatabase = createExpoSqliteDatabase(DATABASE_NAME);

export const bookmarkDb = new Kysely<DatabaseSchema>({
  dialect: new ExpoSqliteDialect(sqliteDatabase),
});

let initializationPromise: Promise<void> | null = null;

function mapBookmarkRow(row: BookmarkRow): BookmarkRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    image: row.image,
    favicon: row.favicon,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

function normalizeLegacyBookmarks(input: LegacyBookmark[] | undefined): LegacyBookmark[] {
  return Array.isArray(input) ? input.filter((bookmark) => !!bookmark?.url) : [];
}

function getBookmarkPayload(url: string, rawTitle: string, rawDescription?: string | null) {
  const normalizedUrl = sanitizeBookmarkUrl(url) || url.trim();
  const title = truncateBookmarkTitle(rawTitle) || normalizedUrl;
  const description = truncateBookmarkDescription(rawDescription ?? '');
  const image = getBookmarkImage(normalizedUrl);

  return {
    title,
    description,
    url: normalizedUrl,
    image,
    favicon: image ? null : getBookmarkFavicon(normalizedUrl),
  };
}

function getValidDateString(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  return Number.isNaN(Date.parse(input)) ? fallback : input;
}

function getTransferBookmarks(input: unknown): BookmarkTransferRecord[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (
    input &&
    typeof input === 'object' &&
    Array.isArray((input as BookmarkTransferPayload).bookmarks)
  ) {
    return (input as BookmarkTransferPayload).bookmarks;
  }

  return [];
}

async function migrateLegacyBookmarksFromAsyncStorage() {
  const [persistedStoreRaw, oldBookmarkRaw] = await Promise.all([
    AsyncStorage.getItem(BOOKMARK_STORAGE_KEY),
    AsyncStorage.getItem(OLD_BOOKMARK_KEY),
  ]);

  const pendingBookmarks = new Map<string, LegacyBookmark>();

  if (persistedStoreRaw) {
    try {
      const persistedStore = JSON.parse(persistedStoreRaw) as PersistedStoreState;

      for (const bookmark of normalizeLegacyBookmarks(persistedStore.state?.bookmarks)) {
        pendingBookmarks.set(bookmark.url!, bookmark);
      }
    } catch {
      // Ignore malformed persisted state and keep current data in place.
    }
  }

  if (oldBookmarkRaw) {
    try {
      const oldBookmarks = JSON.parse(oldBookmarkRaw) as LegacyBookmark[];

      for (const bookmark of normalizeLegacyBookmarks(oldBookmarks)) {
        if (!pendingBookmarks.has(bookmark.url!)) {
          pendingBookmarks.set(bookmark.url!, bookmark);
        }
      }
    } catch {
      // Ignore malformed legacy payloads and continue cleanup below.
    }
  }

  const now = new Date().toISOString();
  const bookmarkValues = [...pendingBookmarks.values()].map((bookmark) => {
    const payload = getBookmarkPayload(
      bookmark.url!,
      bookmark.title || bookmark.desc || bookmark.url!,
      bookmark.desc || bookmark.title || bookmark.url!,
    );

    return {
      ...payload,
      created_at: now,
      last_accessed_at: now,
    };
  });

  if (bookmarkValues.length > 0) {
    await bookmarkDb
      .insertInto('bookmarks')
      .values(bookmarkValues)
      .onConflict((oc) => oc.column('url').doNothing())
      .execute();
  }

  if (persistedStoreRaw) {
    try {
      const persistedStore = JSON.parse(persistedStoreRaw) as PersistedStoreState;
      const nextPersistedStore: PersistedStoreState = {
        ...persistedStore,
        state: {
          ...persistedStore.state,
          bookmarks: [],
        },
      };

      await AsyncStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(nextPersistedStore));
    } catch {
      // Keep the current persisted store untouched if it can't be parsed.
    }
  }

  if (oldBookmarkRaw) {
    await AsyncStorage.removeItem(OLD_BOOKMARK_KEY);
  }
}

export async function ensureBookmarkDbReady() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await runMigrations(bookmarkDb, migrations, 'bookmark_kysely_migrations');
      await migrateLegacyBookmarksFromAsyncStorage();
    })();
  }

  return initializationPromise;
}

export async function listBookmarks(): Promise<BookmarkRecord[]> {
  await ensureBookmarkDbReady();

  const rows = await bookmarkDb
    .selectFrom('bookmarks')
    .selectAll()
    .orderBy('last_accessed_at', 'desc')
    .orderBy('created_at', 'desc')
    .execute();

  return rows.map(mapBookmarkRow);
}

export async function exportBookmarksPayload(): Promise<BookmarkTransferPayload> {
  const bookmarks = await listBookmarks();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: bookmarks.map((bookmark) => ({
      title: bookmark.title,
      description: bookmark.description,
      url: bookmark.url,
      image: bookmark.image,
      favicon: bookmark.favicon,
      createdAt: bookmark.createdAt,
      lastAccessedAt: bookmark.lastAccessedAt,
    })),
  };
}

export async function importBookmarksFromJson(raw: string): Promise<number> {
  await ensureBookmarkDbReady();

  const parsed = JSON.parse(raw) as unknown;
  const now = new Date().toISOString();
  const dedupedBookmarks = new Map<
    string,
    {
      title: string;
      description: string;
      url: string;
      image: string | null;
      favicon: string | null;
      created_at: string;
      last_accessed_at: string;
    }
  >();

  for (const bookmark of getTransferBookmarks(parsed)) {
    const normalizedUrl = sanitizeBookmarkUrl(bookmark.url ?? '');
    if (!normalizedUrl) continue;

    const payload = getBookmarkPayload(
      normalizedUrl,
      bookmark.title || bookmark.desc || normalizedUrl,
      bookmark.description || bookmark.desc || '',
    );

    dedupedBookmarks.set(normalizedUrl, {
      ...payload,
      image: typeof bookmark.image === 'string' ? bookmark.image : payload.image,
      favicon: typeof bookmark.favicon === 'string' ? bookmark.favicon : payload.favicon,
      created_at: getValidDateString(bookmark.createdAt, now),
      last_accessed_at: getValidDateString(bookmark.lastAccessedAt, now),
    });
  }

  const values = [...dedupedBookmarks.values()];
  if (values.length === 0) {
    return 0;
  }

  await bookmarkDb
    .insertInto('bookmarks')
    .values(values)
    .onConflict((oc) =>
      oc.column('url').doUpdateSet((eb) => ({
        title: eb.ref('excluded.title'),
        description: eb.ref('excluded.description'),
        image: eb.ref('excluded.image'),
        favicon: eb.ref('excluded.favicon'),
        created_at: eb.ref('excluded.created_at'),
        last_accessed_at: eb.ref('excluded.last_accessed_at'),
      })),
    )
    .execute();

  return values.length;
}

export async function saveBookmark(input: {
  title: string;
  url: string;
  description?: string | null;
}): Promise<void> {
  await ensureBookmarkDbReady();

  const now = new Date().toISOString();
  const payload = getBookmarkPayload(input.url, input.title, input.description);

  await bookmarkDb
    .insertInto('bookmarks')
    .values({
      ...payload,
      created_at: now,
      last_accessed_at: now,
    })
    .onConflict((oc) =>
      oc.column('url').doUpdateSet({
        title: payload.title,
        description: payload.description,
        image: payload.image,
        favicon: payload.favicon,
        last_accessed_at: now,
      }),
    )
    .execute();
}

export async function removeBookmarkByUrl(url: string): Promise<void> {
  await ensureBookmarkDbReady();

  await bookmarkDb.deleteFrom('bookmarks').where('url', '=', url).execute();
}

export async function touchBookmarkByUrl(url: string): Promise<void> {
  await ensureBookmarkDbReady();

  await bookmarkDb
    .updateTable('bookmarks')
    .set({ last_accessed_at: new Date().toISOString() })
    .where('url', '=', url)
    .execute();
}
