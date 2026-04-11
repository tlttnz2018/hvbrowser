import { Generated, Kysely, Migration, MigrationProvider, Migrator, Selectable, sql } from 'kysely';

import { createExpoSqliteDatabase, ExpoSqliteDialect } from './expoSqliteDialect';

const DATABASE_NAME = 'hvbrowser.db';

export type OfflineChapterStatus = 'queued' | 'downloading' | 'downloaded' | 'failed';

interface OfflineStoryTable {
  id: Generated<number>;
  name: string;
  home_page_url: string | null;
  index_page_url: string | null;
  created_at: string;
  updated_at: string;
}

interface OfflineChapterTable {
  id: Generated<number>;
  story_id: number;
  chapter_name: string;
  chapter_url: string;
  chapter_order: number | null;
  original_html: string;
  converted_hv_html: string;
  download_status: OfflineChapterStatus;
  download_error: string | null;
  downloaded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OfflineDatabaseSchema {
  offline_stories: OfflineStoryTable;
  offline_chapters: OfflineChapterTable;
}

type OfflineStoryRow = Selectable<OfflineStoryTable>;
type OfflineChapterRow = Selectable<OfflineChapterTable>;

export interface OfflineStoryRecord {
  id: number;
  name: string;
  homePageUrl: string | null;
  indexPageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineChapterRecord {
  id: number;
  storyId: number;
  chapterName: string;
  chapterUrl: string;
  chapterOrder: number | null;
  originalHtml: string;
  convertedHvHtml: string;
  downloadStatus: OfflineChapterStatus;
  downloadError: string | null;
  downloadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UpsertOfflineStoryInput {
  name: string;
  homePageUrl?: string | null;
  indexPageUrl?: string | null;
}

interface SaveOfflineChapterInput {
  storyId: number;
  chapterName: string;
  chapterUrl: string;
  chapterOrder?: number | null;
  originalHtml?: string;
  convertedHvHtml?: string;
  downloadStatus?: OfflineChapterStatus;
  downloadError?: string | null;
  downloadedAt?: string | null;
}

const migrations: Record<string, Migration> = {
  '001_create_offline_tables': {
    async up(db) {
      await db.schema
        .createTable('offline_stories')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('home_page_url', 'text')
        .addColumn('index_page_url', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();

      await db.schema
        .createTable('offline_chapters')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
        .addColumn('story_id', 'integer', (col) =>
          col.notNull().references('offline_stories.id').onDelete('cascade'),
        )
        .addColumn('chapter_name', 'text', (col) => col.notNull())
        .addColumn('chapter_url', 'text', (col) => col.notNull().unique())
        .addColumn('chapter_order', 'integer')
        .addColumn('original_html', 'text', (col) => col.notNull())
        .addColumn('converted_hv_html', 'text', (col) => col.notNull())
        .addColumn('download_status', 'text', (col) => col.notNull().defaultTo('queued'))
        .addColumn('download_error', 'text')
        .addColumn('downloaded_at', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();

      await db.schema
        .createIndex('idx_offline_chapters_story_id')
        .ifNotExists()
        .on('offline_chapters')
        .column('story_id')
        .execute();

      await db.schema
        .createIndex('idx_offline_chapters_download_status')
        .ifNotExists()
        .on('offline_chapters')
        .column('download_status')
        .execute();

      await sql`create unique index if not exists idx_offline_stories_home_page_url on offline_stories(home_page_url) where home_page_url is not null`.execute(
        db,
      );
      await sql`create unique index if not exists idx_offline_stories_index_page_url on offline_stories(index_page_url) where index_page_url is not null`.execute(
        db,
      );
    },
  },
};

const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

const sqliteDatabase = createExpoSqliteDatabase(DATABASE_NAME);

const offlineDb = new Kysely<OfflineDatabaseSchema>({
  dialect: new ExpoSqliteDialect(sqliteDatabase),
});

let initializationPromise: Promise<void> | null = null;

function mapOfflineStoryRow(row: OfflineStoryRow): OfflineStoryRecord {
  return {
    id: row.id,
    name: row.name,
    homePageUrl: row.home_page_url,
    indexPageUrl: row.index_page_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOfflineChapterRow(row: OfflineChapterRow): OfflineChapterRecord {
  return {
    id: row.id,
    storyId: row.story_id,
    chapterName: row.chapter_name,
    chapterUrl: row.chapter_url,
    chapterOrder: row.chapter_order,
    originalHtml: row.original_html,
    convertedHvHtml: row.converted_hv_html,
    downloadStatus: row.download_status,
    downloadError: row.download_error,
    downloadedAt: row.downloaded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOfflineStoryById(id: number): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_stories')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? mapOfflineStoryRow(row) : null;
}

export async function ensureOfflineDbReady() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const migrator = new Migrator({
        db: offlineDb,
        provider: migrationProvider,
        migrationTableName: 'offline_kysely_migrations',
        migrationLockTableName: 'offline_kysely_migration_lock',
      });
      const { error } = await migrator.migrateToLatest();

      if (error) {
        throw error;
      }
    })();
  }

  return initializationPromise;
}

export async function upsertOfflineStory(
  input: UpsertOfflineStoryInput,
): Promise<OfflineStoryRecord> {
  await ensureOfflineDbReady();

  const now = new Date().toISOString();
  const trimmedName = input.name.trim() || 'Untitled story';

  const existing =
    (input.homePageUrl ? await getOfflineStoryByHomePageUrl(input.homePageUrl) : null) ||
    (input.indexPageUrl ? await getOfflineStoryByIndexPageUrl(input.indexPageUrl) : null);

  if (existing) {
    await offlineDb
      .updateTable('offline_stories')
      .set({
        name: trimmedName || existing.name,
        home_page_url: input.homePageUrl ?? existing.homePageUrl,
        index_page_url: input.indexPageUrl ?? existing.indexPageUrl,
        updated_at: now,
      })
      .where('id', '=', existing.id)
      .execute();

    return (await getOfflineStoryById(existing.id)) as OfflineStoryRecord;
  }

  const inserted = await offlineDb
    .insertInto('offline_stories')
    .values({
      name: trimmedName,
      home_page_url: input.homePageUrl ?? null,
      index_page_url: input.indexPageUrl ?? null,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapOfflineStoryRow(inserted);
}

export async function getOfflineStoryByIndexPageUrl(
  indexPageUrl: string,
): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_stories')
    .selectAll()
    .where('index_page_url', '=', indexPageUrl)
    .executeTakeFirst();

  return row ? mapOfflineStoryRow(row) : null;
}

export async function getOfflineStoryByHomePageUrl(
  homePageUrl: string,
): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_stories')
    .selectAll()
    .where('home_page_url', '=', homePageUrl)
    .executeTakeFirst();

  return row ? mapOfflineStoryRow(row) : null;
}

export async function getOfflineStoryByChapterUrl(
  chapterUrl: string,
): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_stories')
    .innerJoin('offline_chapters', 'offline_chapters.story_id', 'offline_stories.id')
    .select('offline_stories.id')
    .select('offline_stories.name')
    .select('offline_stories.home_page_url')
    .select('offline_stories.index_page_url')
    .select('offline_stories.created_at')
    .select('offline_stories.updated_at')
    .where('offline_chapters.chapter_url', '=', chapterUrl)
    .executeTakeFirst();

  return row
    ? mapOfflineStoryRow({
        id: row.id,
        name: row.name,
        home_page_url: row.home_page_url,
        index_page_url: row.index_page_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    : null;
}

export async function listOfflineStories(): Promise<OfflineStoryRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('offline_stories')
    .selectAll()
    .orderBy('updated_at', 'desc')
    .orderBy('created_at', 'desc')
    .execute();

  return rows.map(mapOfflineStoryRow);
}

export async function saveOfflineChapter(
  input: SaveOfflineChapterInput,
): Promise<OfflineChapterRecord> {
  await ensureOfflineDbReady();

  const now = new Date().toISOString();
  const existing = await getOfflineChapterByUrl(input.chapterUrl);
  const originalHtml = input.originalHtml ?? existing?.originalHtml ?? '';
  const convertedHvHtml = input.convertedHvHtml ?? existing?.convertedHvHtml ?? '';
  const downloadStatus = input.downloadStatus ?? existing?.downloadStatus ?? 'queued';
  const downloadError = input.downloadError ?? existing?.downloadError ?? null;
  const downloadedAt =
    input.downloadedAt !== undefined ? input.downloadedAt : (existing?.downloadedAt ?? null);

  await offlineDb
    .insertInto('offline_chapters')
    .values({
      story_id: input.storyId,
      chapter_name: input.chapterName,
      chapter_url: input.chapterUrl,
      chapter_order: input.chapterOrder ?? null,
      original_html: originalHtml,
      converted_hv_html: convertedHvHtml,
      download_status: downloadStatus,
      download_error: downloadError,
      downloaded_at: downloadedAt,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column('chapter_url').doUpdateSet({
        story_id: input.storyId,
        chapter_name: input.chapterName,
        chapter_order: input.chapterOrder ?? null,
        original_html: originalHtml,
        converted_hv_html: convertedHvHtml,
        download_status: downloadStatus,
        download_error: downloadError,
        downloaded_at: downloadedAt,
        updated_at: now,
      }),
    )
    .execute();

  return (await getOfflineChapterByUrl(input.chapterUrl)) as OfflineChapterRecord;
}

export async function listOfflineChapters(): Promise<OfflineChapterRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('offline_chapters')
    .selectAll()
    .orderBy('chapter_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map(mapOfflineChapterRow);
}

export async function listOfflineChaptersByStory(storyId: number): Promise<OfflineChapterRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('offline_chapters')
    .selectAll()
    .where('story_id', '=', storyId)
    .orderBy('chapter_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map(mapOfflineChapterRow);
}

export async function getOfflineChapterByUrl(
  chapterUrl: string,
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_chapters')
    .selectAll()
    .where('chapter_url', '=', chapterUrl)
    .executeTakeFirst();

  return row ? mapOfflineChapterRow(row) : null;
}

export async function getOfflineChapterById(id: number): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_chapters')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? mapOfflineChapterRow(row) : null;
}

export async function updateOfflineChapterStatus(
  id: number,
  status: OfflineChapterStatus,
  error?: string | null,
  payload?: Partial<
    Pick<OfflineChapterRecord, 'chapterName' | 'originalHtml' | 'convertedHvHtml' | 'downloadedAt'>
  >,
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const now = new Date().toISOString();

  await offlineDb
    .updateTable('offline_chapters')
    .set({
      chapter_name: payload?.chapterName,
      original_html: payload?.originalHtml,
      converted_hv_html: payload?.convertedHvHtml,
      download_status: status,
      download_error: error ?? null,
      downloaded_at: payload?.downloadedAt ?? (status === 'downloaded' ? now : null),
      updated_at: now,
    })
    .where('id', '=', id)
    .execute();

  return getOfflineChapterById(id);
}

export async function attachHomePageToStory(
  storyId: number,
  homePageUrl: string,
): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  await offlineDb
    .updateTable('offline_stories')
    .set({
      home_page_url: homePageUrl,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', storyId)
    .execute();

  return getOfflineStoryById(storyId);
}

export async function attachIndexPageToStory(
  storyId: number,
  indexPageUrl: string,
): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  await offlineDb
    .updateTable('offline_stories')
    .set({
      index_page_url: indexPageUrl,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', storyId)
    .execute();

  return getOfflineStoryById(storyId);
}

export async function deleteOfflineStory(id: number): Promise<void> {
  await ensureOfflineDbReady();

  await offlineDb.deleteFrom('offline_stories').where('id', '=', id).execute();
}

export async function deleteOfflineChapter(id: number): Promise<void> {
  await ensureOfflineDbReady();

  await offlineDb.deleteFrom('offline_chapters').where('id', '=', id).execute();
}
