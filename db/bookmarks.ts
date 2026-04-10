import AsyncStorage from '@react-native-async-storage/async-storage';
import { Generated, Kysely, Migrator, Migration, MigrationProvider, Selectable } from 'kysely';
import { createExpoSqliteDatabase, ExpoSqliteDialect } from './expoSqliteDialect';
import { getBookmarkFavicon, getBookmarkImage, truncateBookmarkTitle } from '../utils/bookmarks';

const DATABASE_NAME = 'hvbrowser.db';
const BOOKMARK_STORAGE_KEY = 'hv-browser-storage';
const OLD_BOOKMARK_KEY = 'HV_BROWSER_BOOKMARK_STORAGE_KEY';

interface BookmarkTable {
  id: Generated<number>;
  title: string;
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
  url: string;
  image: string | null;
  favicon: string | null;
  createdAt: string;
  lastAccessedAt: string;
}

const migrations: Record<string, Migration> = {
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
};

const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
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

function getBookmarkPayload(url: string, rawTitle: string) {
  const title = truncateBookmarkTitle(rawTitle) || url;
  const image = getBookmarkImage(url);

  return {
    title,
    url,
    image,
    favicon: image ? null : getBookmarkFavicon(url),
  };
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
    const payload = getBookmarkPayload(bookmark.url!, bookmark.title || bookmark.desc || bookmark.url!);

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
      const migrator = new Migrator({
        db: bookmarkDb,
        provider: migrationProvider,
      });
      const { error } = await migrator.migrateToLatest();

      if (error) {
        throw error;
      }

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

export async function saveBookmark(input: { title: string; url: string }): Promise<void> {
  await ensureBookmarkDbReady();

  const now = new Date().toISOString();
  const payload = getBookmarkPayload(input.url, input.title);

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
        image: payload.image,
        favicon: payload.favicon,
        last_accessed_at: now,
      })
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
