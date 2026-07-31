import { Generated, Kysely, QueryResult, Selectable, sql } from 'kysely';

import { createExpoSqliteDatabase, ExpoSqliteDialect } from './expoSqliteDialect';
import { AppMigration, runMigrations } from './runMigrations';

const DATABASE_NAME = 'hvbrowser.db';

export type OfflineChapterStatus = 'queued' | 'downloading' | 'downloaded' | 'failed';
export type OfflineStorySourceType = 'remote' | 'epub' | 'txt';
export type EpubImportJobStatus =
  'queued' | 'extracting' | 'parsing' | 'importing' | 'paused' | 'completed' | 'failed';

interface OfflineStoryTable {
  id: Generated<number>;
  name: string;
  home_page_url: string | null;
  index_page_url: string | null;
  source_type: OfflineStorySourceType;
  author: string | null;
  cover_image_uri: string | null;
  source_file_name: string | null;
  asset_root_uri: string | null;
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
  last_opened_at: string | null;
  reader_scroll_ratio: number | null;
  reader_font_size: number | null;
  reader_is_hv: number | null;
  created_at: string;
  updated_at: string;
}

interface EpubImportJobTable {
  id: Generated<number>;
  file_name: string;
  picked_file_uri: string;
  source_file_uri: string | null;
  workspace_uri: string | null;
  story_id: number | null;
  status: EpubImportJobStatus;
  total_chapters: number;
  imported_chapters: number;
  checkpoint_chapter_index: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface OfflineChapterSearchCacheTable {
  id: Generated<number>;
  story_id: number;
  raw_query: string;
  normalized_query: string;
  result_json: string;
  result_count: number;
  chapter_signature: string;
  search_count: number;
  last_searched_at: string;
  created_at: string;
  updated_at: string;
}

interface OfflineDatabaseSchema {
  offline_stories: OfflineStoryTable;
  offline_chapters: OfflineChapterTable;
  epub_import_jobs: EpubImportJobTable;
  offline_chapter_search_cache: OfflineChapterSearchCacheTable;
}

type OfflineStoryRow = Selectable<OfflineStoryTable>;
type OfflineChapterRow = Selectable<OfflineChapterTable>;
type OfflineChapterMetadataRow = Omit<OfflineChapterRow, 'original_html' | 'converted_hv_html'>;
type EpubImportJobRow = Selectable<EpubImportJobTable>;
type OfflineChapterSearchCacheRow = Selectable<OfflineChapterSearchCacheTable>;

export interface OfflineStoryRecord {
  id: number;
  name: string;
  homePageUrl: string | null;
  indexPageUrl: string | null;
  sourceType: OfflineStorySourceType;
  author: string | null;
  coverImageUri: string | null;
  sourceFileName: string | null;
  assetRootUri: string | null;
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
  lastOpenedAt: string | null;
  readerScrollRatio: number | null;
  readerFontSize: number | null;
  readerIsHv: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineChapterBackupRecord {
  id: number;
  storyId: number;
  chapterName: string;
  chapterUrl: string;
  chapterOrder: number | null;
  downloadStatus: OfflineChapterStatus;
  downloadError: string | null;
  downloadedAt: string | null;
  lastOpenedAt: string | null;
  readerScrollRatio: number | null;
  readerFontSize: number | null;
  readerIsHv: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineLibraryBackupAsset {
  archivePath: string;
  relativePath: string;
}

export interface OfflineLibraryBackupChapter {
  chapterUrl: string;
  chapterName: string;
  chapterOrder: number | null;
  downloadStatus: OfflineChapterStatus;
  downloadError: string | null;
  downloadedAt: string | null;
  lastOpenedAt: string | null;
  readerScrollRatio?: number | null;
  readerFontSize?: number | null;
  readerIsHv?: boolean | null;
  createdAt: string;
  updatedAt: string;
  contentPath: string | null;
}

export interface OfflineLibraryBackupStory {
  storyKey: string;
  name: string;
  homePageUrl: string | null;
  indexPageUrl: string | null;
  sourceType: OfflineStorySourceType;
  author: string | null;
  sourceFileName: string | null;
  coverImagePath: string | null;
  assetPlaceholderPrefix: string | null;
  chapters: OfflineLibraryBackupChapter[];
  assets: OfflineLibraryBackupAsset[];
}

export interface OfflineLibraryBackupManifest {
  format: 'hvbrowser-offline-library';
  version: 1;
  exportedAt: string;
  storyKeys: string[];
  totalStories: number;
}

export interface OfflineLibraryImportResult {
  importedStories: number;
  importedChapters: number;
  queuedChapters: number;
  assetFiles: number;
}

export interface EpubImportJobRecord {
  id: number;
  fileName: string;
  pickedFileUri: string;
  sourceFileUri: string | null;
  workspaceUri: string | null;
  storyId: number | null;
  status: EpubImportJobStatus;
  totalChapters: number;
  importedChapters: number;
  checkpointChapterIndex: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineChapterSearchCacheMatch {
  chapterId: number;
  matchType: 'Chinese' | 'Han-Viet';
  snippet: string;
  occurrenceIndex: number;
}

export interface OfflineChapterSearchCacheRecord {
  id: number;
  storyId: number;
  rawQuery: string;
  normalizedQuery: string;
  matches: OfflineChapterSearchCacheMatch[];
  resultCount: number;
  chapterSignature: string;
  searchCount: number;
  lastSearchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineChapterSearchSuggestion {
  id: number;
  query: string;
  searchCount: number;
  lastSearchedAt: string;
}

export interface OfflineDatabaseMaintenanceResult {
  orphanedChaptersDeleted: number;
  orphanedSearchCacheRowsDeleted: number;
  orphanedImportJobStoryRefsCleared: number;
}

interface SaveOfflineChapterSearchCacheInput {
  storyId: number;
  rawQuery: string;
  matches: OfflineChapterSearchCacheMatch[];
  chapterSignature: string;
}

interface UpsertOfflineStoryInput {
  id?: number;
  name: string;
  homePageUrl?: string | null;
  indexPageUrl?: string | null;
  sourceType?: OfflineStorySourceType;
  author?: string | null;
  coverImageUri?: string | null;
  sourceFileName?: string | null;
  assetRootUri?: string | null;
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
  lastOpenedAt?: string | null;
  readerScrollRatio?: number | null;
  readerFontSize?: number | null;
  readerIsHv?: boolean | null;
}

interface CreateEpubImportJobInput {
  fileName: string;
  pickedFileUri: string;
  sourceFileUri?: string | null;
  workspaceUri?: string | null;
  storyId?: number | null;
}

interface UpdateEpubImportJobInput {
  fileName?: string;
  pickedFileUri?: string;
  sourceFileUri?: string | null;
  workspaceUri?: string | null;
  storyId?: number | null;
  status?: EpubImportJobStatus;
  totalChapters?: number;
  importedChapters?: number;
  checkpointChapterIndex?: number | null;
  errorMessage?: string | null;
}

const migrations: Record<string, AppMigration> = {
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
  '002_add_epub_support': {
    async up(db) {
      await db.schema
        .alterTable('offline_stories')
        .addColumn('source_type', 'text', (col) => col.notNull().defaultTo('remote'))
        .execute();
      await db.schema.alterTable('offline_stories').addColumn('author', 'text').execute();
      await db.schema.alterTable('offline_stories').addColumn('cover_image_uri', 'text').execute();
      await db.schema.alterTable('offline_stories').addColumn('source_file_name', 'text').execute();
      await db.schema.alterTable('offline_stories').addColumn('asset_root_uri', 'text').execute();

      await db.schema
        .createTable('epub_import_jobs')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
        .addColumn('file_name', 'text', (col) => col.notNull())
        .addColumn('picked_file_uri', 'text', (col) => col.notNull())
        .addColumn('source_file_uri', 'text')
        .addColumn('workspace_uri', 'text')
        .addColumn('story_id', 'integer', (col) =>
          col.references('offline_stories.id').onDelete('set null'),
        )
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('queued'))
        .addColumn('total_chapters', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('imported_chapters', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('checkpoint_chapter_index', 'integer')
        .addColumn('error_message', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();

      await db.schema
        .createIndex('idx_epub_import_jobs_status')
        .ifNotExists()
        .on('epub_import_jobs')
        .column('status')
        .execute();
    },
  },
  '003_add_offline_chapter_last_opened_at': {
    async up(db) {
      await db.schema.alterTable('offline_chapters').addColumn('last_opened_at', 'text').execute();
    },
  },
  '004_add_offline_chapter_reader_scroll_ratio': {
    async up(db) {
      await db.schema
        .alterTable('offline_chapters')
        .addColumn('reader_scroll_ratio', 'real')
        .execute();
    },
  },
  '005_add_offline_chapter_reader_preferences': {
    async up(db) {
      await db.schema
        .alterTable('offline_chapters')
        .addColumn('reader_font_size', 'real')
        .execute();
      await db.schema.alterTable('offline_chapters').addColumn('reader_is_hv', 'integer').execute();
    },
  },
  '006_add_offline_chapter_search_cache': {
    async up(db) {
      await db.schema
        .createTable('offline_chapter_search_cache')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
        .addColumn('story_id', 'integer', (col) =>
          col.notNull().references('offline_stories.id').onDelete('cascade'),
        )
        .addColumn('raw_query', 'text', (col) => col.notNull())
        .addColumn('normalized_query', 'text', (col) => col.notNull())
        .addColumn('result_json', 'text', (col) => col.notNull())
        .addColumn('result_count', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('chapter_signature', 'text', (col) => col.notNull())
        .addColumn('search_count', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('last_searched_at', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();

      await db.schema
        .createIndex('idx_offline_chapter_search_cache_story_query')
        .ifNotExists()
        .on('offline_chapter_search_cache')
        .columns(['story_id', 'normalized_query'])
        .unique()
        .execute();

      await db.schema
        .createIndex('idx_offline_chapter_search_cache_story_recent')
        .ifNotExists()
        .on('offline_chapter_search_cache')
        .columns(['story_id', 'last_searched_at'])
        .execute();

      await db.schema
        .createIndex('idx_offline_chapter_search_cache_story_count')
        .ifNotExists()
        .on('offline_chapter_search_cache')
        .columns(['story_id', 'search_count'])
        .execute();
    },
  },
  '007_cleanup_orphan_offline_rows': {
    async up(db) {
      await db.schema
        .createIndex('idx_offline_stories_updated_created')
        .ifNotExists()
        .on('offline_stories')
        .columns(['updated_at', 'created_at'])
        .execute();

      await db.schema
        .createIndex('idx_offline_chapters_story_order_created')
        .ifNotExists()
        .on('offline_chapters')
        .columns(['story_id', 'chapter_order', 'created_at'])
        .execute();

      await db.schema
        .createIndex('idx_offline_chapters_order_created')
        .ifNotExists()
        .on('offline_chapters')
        .columns(['chapter_order', 'created_at'])
        .execute();

      await db.schema
        .createIndex('idx_offline_chapters_status_order_created')
        .ifNotExists()
        .on('offline_chapters')
        .columns(['download_status', 'chapter_order', 'created_at'])
        .execute();

      await db.schema
        .createIndex('idx_epub_import_jobs_created')
        .ifNotExists()
        .on('epub_import_jobs')
        .column('created_at')
        .execute();

      await sql`
        delete from offline_chapter_search_cache
        where not exists (
          select 1 from offline_stories
          where offline_stories.id = offline_chapter_search_cache.story_id
        )
      `.execute(db);

      await sql`
        update epub_import_jobs
        set story_id = null
        where story_id is not null
          and not exists (
            select 1 from offline_stories
            where offline_stories.id = epub_import_jobs.story_id
          )
      `.execute(db);

      await sql`
        delete from offline_chapters
        where not exists (
          select 1 from offline_stories
          where offline_stories.id = offline_chapters.story_id
        )
      `.execute(db);

      try {
        await sql`vacuum`.execute(db);
      } catch (error) {
        console.warn('Offline database vacuum skipped:', error);
      }

      try {
        await sql`pragma optimize`.execute(db);
      } catch (error) {
        console.warn('Offline database optimize skipped:', error);
      }
    },
  },
};

const sqliteDatabase = createExpoSqliteDatabase(DATABASE_NAME);

const offlineDb = new Kysely<OfflineDatabaseSchema>({
  dialect: new ExpoSqliteDialect(sqliteDatabase),
});

let initializationPromise: Promise<void> | null = null;

function normalizeOfflineChapterLookupUrl(chapterUrl: string) {
  return chapterUrl.replace(/#.*$/, '');
}

export function normalizeOfflineSearchCacheQuery(rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(query)
    ? query.replace(/\s+/g, '')
    : query.replace(/\s+/g, ' ');
}

export function buildOfflineChapterSearchSignature(
  chapters: Array<Pick<OfflineChapterRecord, 'id' | 'downloadStatus' | 'updatedAt'>>,
) {
  return chapters
    .map((chapter) => `${chapter.id}:${chapter.downloadStatus}:${chapter.updatedAt}`)
    .sort()
    .join('|');
}

function parseOfflineChapterSearchMatches(resultJson: string): OfflineChapterSearchCacheMatch[] {
  try {
    const parsed = JSON.parse(resultJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const candidate = entry as Partial<OfflineChapterSearchCacheMatch>;
      if (
        typeof candidate.chapterId !== 'number' ||
        (candidate.matchType !== 'Chinese' && candidate.matchType !== 'Han-Viet') ||
        typeof candidate.snippet !== 'string' ||
        typeof candidate.occurrenceIndex !== 'number'
      ) {
        return [];
      }

      return [
        {
          chapterId: candidate.chapterId,
          matchType: candidate.matchType,
          snippet: candidate.snippet,
          occurrenceIndex: candidate.occurrenceIndex,
        },
      ];
    });
  } catch {
    return [];
  }
}

function mapOfflineChapterSearchCacheRow(
  row: OfflineChapterSearchCacheRow,
): OfflineChapterSearchCacheRecord {
  return {
    id: row.id,
    storyId: row.story_id,
    rawQuery: row.raw_query,
    normalizedQuery: row.normalized_query,
    matches: parseOfflineChapterSearchMatches(row.result_json),
    resultCount: row.result_count,
    chapterSignature: row.chapter_signature,
    searchCount: row.search_count,
    lastSearchedAt: row.last_searched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOfflineStoryRow(row: OfflineStoryRow): OfflineStoryRecord {
  return {
    id: row.id,
    name: row.name,
    homePageUrl: row.home_page_url,
    indexPageUrl: row.index_page_url,
    sourceType: row.source_type ?? 'remote',
    author: row.author ?? null,
    coverImageUri: row.cover_image_uri ?? null,
    sourceFileName: row.source_file_name ?? null,
    assetRootUri: row.asset_root_uri ?? null,
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
    lastOpenedAt: row.last_opened_at ?? null,
    readerScrollRatio: row.reader_scroll_ratio ?? null,
    readerFontSize: row.reader_font_size ?? null,
    readerIsHv: row.reader_is_hv == null ? null : row.reader_is_hv !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOfflineChapterMetadataRow(row: OfflineChapterMetadataRow): OfflineChapterRecord {
  return {
    id: row.id,
    storyId: row.story_id,
    chapterName: row.chapter_name,
    chapterUrl: row.chapter_url,
    chapterOrder: row.chapter_order,
    originalHtml: '',
    convertedHvHtml: '',
    downloadStatus: row.download_status,
    downloadError: row.download_error,
    downloadedAt: row.downloaded_at,
    lastOpenedAt: row.last_opened_at ?? null,
    readerScrollRatio: row.reader_scroll_ratio ?? null,
    readerFontSize: row.reader_font_size ?? null,
    readerIsHv: row.reader_is_hv == null ? null : row.reader_is_hv !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEpubImportJobRow(row: EpubImportJobRow): EpubImportJobRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    pickedFileUri: row.picked_file_uri,
    sourceFileUri: row.source_file_uri,
    workspaceUri: row.workspace_uri,
    storyId: row.story_id,
    status: row.status,
    totalChapters: row.total_chapters,
    importedChapters: row.imported_chapters,
    checkpointChapterIndex: row.checkpoint_chapter_index,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getAffectedRowCount(result: QueryResult<unknown>): number {
  return Number(result.numAffectedRows ?? 0n);
}

export async function ensureOfflineDbReady() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await sqliteDatabase.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(offlineDb, migrations, 'offline_kysely_migrations');
      await optimizeOfflineDatabase();
    })();
  }

  return initializationPromise;
}

async function optimizeOfflineDatabase() {
  try {
    await sqliteDatabase.execAsync('PRAGMA optimize;');
  } catch (error) {
    console.warn('Offline database optimize skipped:', error);
  }
}

async function vacuumOfflineDatabase() {
  try {
    await sqliteDatabase.execAsync('VACUUM;');
  } catch (error) {
    console.warn('Offline database vacuum skipped:', error);
  }
}

export async function cleanupOfflineDatabaseRows(): Promise<OfflineDatabaseMaintenanceResult> {
  await ensureOfflineDbReady();

  const orphanedSearchCacheRowsDeleted = getAffectedRowCount(
    await sql`
      delete from offline_chapter_search_cache
      where not exists (
        select 1 from offline_stories
        where offline_stories.id = offline_chapter_search_cache.story_id
      )
    `.execute(offlineDb),
  );

  const orphanedImportJobStoryRefsCleared = getAffectedRowCount(
    await sql`
      update epub_import_jobs
      set story_id = null
      where story_id is not null
        and not exists (
          select 1 from offline_stories
          where offline_stories.id = epub_import_jobs.story_id
        )
    `.execute(offlineDb),
  );

  const orphanedChaptersDeleted = getAffectedRowCount(
    await sql`
      delete from offline_chapters
      where not exists (
        select 1 from offline_stories
        where offline_stories.id = offline_chapters.story_id
      )
    `.execute(offlineDb),
  );

  await vacuumOfflineDatabase();
  await optimizeOfflineDatabase();

  return {
    orphanedChaptersDeleted,
    orphanedSearchCacheRowsDeleted,
    orphanedImportJobStoryRefsCleared,
  };
}

export async function getOfflineStoryById(id: number): Promise<OfflineStoryRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('offline_stories')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? mapOfflineStoryRow(row) : null;
}

export async function upsertOfflineStory(
  input: UpsertOfflineStoryInput,
): Promise<OfflineStoryRecord> {
  await ensureOfflineDbReady();

  const now = new Date().toISOString();
  const trimmedName = input.name.trim() || 'Untitled story';

  if (input.id != null) {
    const existingById = await getOfflineStoryById(input.id);
    if (existingById) {
      const nextValues: Record<string, unknown> = {
        name: trimmedName || existingById.name,
        home_page_url: input.homePageUrl ?? existingById.homePageUrl,
        index_page_url: input.indexPageUrl ?? existingById.indexPageUrl,
        source_type: input.sourceType ?? existingById.sourceType,
        author: input.author !== undefined ? input.author : existingById.author,
        cover_image_uri:
          input.coverImageUri !== undefined ? input.coverImageUri : existingById.coverImageUri,
        source_file_name:
          input.sourceFileName !== undefined ? input.sourceFileName : existingById.sourceFileName,
        asset_root_uri:
          input.assetRootUri !== undefined ? input.assetRootUri : existingById.assetRootUri,
        updated_at: now,
      };

      await offlineDb
        .updateTable('offline_stories')
        .set(nextValues)
        .where('id', '=', existingById.id)
        .execute();

      return (await getOfflineStoryById(existingById.id)) as OfflineStoryRecord;
    }
  }

  const existing =
    (input.homePageUrl ? await getOfflineStoryByHomePageUrl(input.homePageUrl) : null) ||
    (input.indexPageUrl ? await getOfflineStoryByIndexPageUrl(input.indexPageUrl) : null);

  if (existing) {
    const nextValues: Record<string, unknown> = {
      name: trimmedName || existing.name,
      home_page_url: input.homePageUrl ?? existing.homePageUrl,
      index_page_url: input.indexPageUrl ?? existing.indexPageUrl,
      source_type: input.sourceType ?? existing.sourceType,
      author: input.author !== undefined ? input.author : existing.author,
      cover_image_uri:
        input.coverImageUri !== undefined ? input.coverImageUri : existing.coverImageUri,
      source_file_name:
        input.sourceFileName !== undefined ? input.sourceFileName : existing.sourceFileName,
      asset_root_uri: input.assetRootUri !== undefined ? input.assetRootUri : existing.assetRootUri,
      updated_at: now,
    };

    await offlineDb
      .updateTable('offline_stories')
      .set(nextValues)
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
      source_type: input.sourceType ?? 'remote',
      author: input.author ?? null,
      cover_image_uri: input.coverImageUri ?? null,
      source_file_name: input.sourceFileName ?? null,
      asset_root_uri: input.assetRootUri ?? null,
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

  const normalizedUrl = normalizeOfflineChapterLookupUrl(chapterUrl);
  const row = await offlineDb
    .selectFrom('offline_stories')
    .innerJoin('offline_chapters', 'offline_chapters.story_id', 'offline_stories.id')
    .select('offline_stories.id')
    .select('offline_stories.name')
    .select('offline_stories.home_page_url')
    .select('offline_stories.index_page_url')
    .select('offline_stories.source_type')
    .select('offline_stories.author')
    .select('offline_stories.cover_image_uri')
    .select('offline_stories.source_file_name')
    .select('offline_stories.asset_root_uri')
    .select('offline_stories.created_at')
    .select('offline_stories.updated_at')
    .where('offline_chapters.chapter_url', '=', normalizedUrl)
    .executeTakeFirst();

  return row
    ? mapOfflineStoryRow({
        id: row.id,
        name: row.name,
        home_page_url: row.home_page_url,
        index_page_url: row.index_page_url,
        source_type: row.source_type,
        author: row.author,
        cover_image_uri: row.cover_image_uri,
        source_file_name: row.source_file_name,
        asset_root_uri: row.asset_root_uri,
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
  const normalizedChapterUrl = normalizeOfflineChapterLookupUrl(input.chapterUrl);
  const existing = await getOfflineChapterByUrl(normalizedChapterUrl);
  const originalHtml = input.originalHtml ?? existing?.originalHtml ?? '';
  const convertedHvHtml = input.convertedHvHtml ?? existing?.convertedHvHtml ?? '';
  const downloadStatus = input.downloadStatus ?? existing?.downloadStatus ?? 'queued';
  const downloadError = input.downloadError ?? existing?.downloadError ?? null;
  const downloadedAt =
    input.downloadedAt !== undefined ? input.downloadedAt : (existing?.downloadedAt ?? null);
  const lastOpenedAt =
    input.lastOpenedAt !== undefined ? input.lastOpenedAt : (existing?.lastOpenedAt ?? null);
  const readerScrollRatio =
    input.readerScrollRatio !== undefined
      ? input.readerScrollRatio
      : (existing?.readerScrollRatio ?? null);
  const readerFontSize =
    input.readerFontSize !== undefined ? input.readerFontSize : (existing?.readerFontSize ?? null);
  const readerIsHv =
    input.readerIsHv !== undefined ? input.readerIsHv : (existing?.readerIsHv ?? null);

  await offlineDb
    .insertInto('offline_chapters')
    .values({
      story_id: input.storyId,
      chapter_name: input.chapterName,
      chapter_url: normalizedChapterUrl,
      chapter_order: input.chapterOrder ?? null,
      original_html: originalHtml,
      converted_hv_html: convertedHvHtml,
      download_status: downloadStatus,
      download_error: downloadError,
      downloaded_at: downloadedAt,
      last_opened_at: lastOpenedAt,
      reader_scroll_ratio: readerScrollRatio,
      reader_font_size: readerFontSize,
      reader_is_hv: readerIsHv == null ? null : readerIsHv ? 1 : 0,
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
        last_opened_at: lastOpenedAt,
        reader_scroll_ratio: readerScrollRatio,
        reader_font_size: readerFontSize,
        reader_is_hv: readerIsHv == null ? null : readerIsHv ? 1 : 0,
        updated_at: now,
      }),
    )
    .execute();

  return (await getOfflineChapterByUrl(normalizedChapterUrl)) as OfflineChapterRecord;
}

export async function listOfflineChapters(): Promise<OfflineChapterRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('offline_chapters')
    .select([
      'id',
      'story_id',
      'chapter_name',
      'chapter_url',
      'chapter_order',
      'download_status',
      'download_error',
      'downloaded_at',
      'last_opened_at',
      'reader_scroll_ratio',
      'reader_font_size',
      'reader_is_hv',
      'created_at',
      'updated_at',
    ])
    .orderBy('chapter_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map(mapOfflineChapterMetadataRow);
}

export async function listOfflineChaptersByStory(storyId: number): Promise<OfflineChapterRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('offline_chapters')
    .select([
      'id',
      'story_id',
      'chapter_name',
      'chapter_url',
      'chapter_order',
      'download_status',
      'download_error',
      'downloaded_at',
      'last_opened_at',
      'reader_scroll_ratio',
      'reader_font_size',
      'reader_is_hv',
      'created_at',
      'updated_at',
    ])
    .where('story_id', '=', storyId)
    .orderBy('chapter_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map(mapOfflineChapterMetadataRow);
}

export async function listOfflineChapterBackupRecordsByStory(
  storyId: number,
): Promise<OfflineChapterBackupRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('offline_chapters')
    .select([
      'id',
      'story_id',
      'chapter_name',
      'chapter_url',
      'chapter_order',
      'download_status',
      'download_error',
      'downloaded_at',
      'last_opened_at',
      'reader_scroll_ratio',
      'reader_font_size',
      'reader_is_hv',
      'created_at',
      'updated_at',
    ])
    .where('story_id', '=', storyId)
    .orderBy('chapter_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    storyId: row.story_id,
    chapterName: row.chapter_name,
    chapterUrl: row.chapter_url,
    chapterOrder: row.chapter_order,
    downloadStatus: row.download_status,
    downloadError: row.download_error,
    downloadedAt: row.downloaded_at,
    lastOpenedAt: row.last_opened_at ?? null,
    readerScrollRatio: row.reader_scroll_ratio ?? null,
    readerFontSize: row.reader_font_size ?? null,
    readerIsHv: row.reader_is_hv == null ? null : row.reader_is_hv !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getOfflineChapterByUrl(
  chapterUrl: string,
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const normalizedUrl = normalizeOfflineChapterLookupUrl(chapterUrl);
  const row = await offlineDb
    .selectFrom('offline_chapters')
    .selectAll()
    .where('chapter_url', '=', normalizedUrl)
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
    Pick<
      OfflineChapterRecord,
      | 'chapterName'
      | 'originalHtml'
      | 'convertedHvHtml'
      | 'downloadedAt'
      | 'lastOpenedAt'
      | 'readerScrollRatio'
      | 'readerFontSize'
      | 'readerIsHv'
    >
  >,
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const now = new Date().toISOString();
  const nextValues: Record<string, unknown> = {
    download_status: status,
    download_error: error ?? null,
    downloaded_at: payload?.downloadedAt ?? (status === 'downloaded' ? now : null),
    updated_at: now,
  };

  if (payload?.chapterName !== undefined) {
    nextValues.chapter_name = payload.chapterName;
  }
  if (payload?.originalHtml !== undefined) {
    nextValues.original_html = payload.originalHtml;
  }
  if (payload?.convertedHvHtml !== undefined) {
    nextValues.converted_hv_html = payload.convertedHvHtml;
  }
  if (payload?.lastOpenedAt !== undefined) {
    nextValues.last_opened_at = payload.lastOpenedAt;
  }
  if (payload?.readerScrollRatio !== undefined) {
    nextValues.reader_scroll_ratio = payload.readerScrollRatio;
  }
  if (payload?.readerFontSize !== undefined) {
    nextValues.reader_font_size = payload.readerFontSize;
  }
  if (payload?.readerIsHv !== undefined) {
    nextValues.reader_is_hv = payload.readerIsHv == null ? null : payload.readerIsHv ? 1 : 0;
  }

  await offlineDb.updateTable('offline_chapters').set(nextValues).where('id', '=', id).execute();

  return getOfflineChapterById(id);
}

export async function updateOfflineChapterReaderScrollRatio(
  id: number,
  readerScrollRatio: number | null,
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const safeRatio =
    readerScrollRatio == null || !Number.isFinite(readerScrollRatio)
      ? null
      : Math.max(0, Math.min(1, readerScrollRatio));

  await offlineDb
    .updateTable('offline_chapters')
    .set({
      reader_scroll_ratio: safeRatio,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', id)
    .execute();

  return getOfflineChapterById(id);
}

export async function updateOfflineChapterReaderPreferences(
  id: number,
  input: { readerFontSize: number | null; readerIsHv: boolean | null },
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  const safeFontSize =
    input.readerFontSize == null || !Number.isFinite(input.readerFontSize)
      ? null
      : Math.max(1, Math.min(4, Number(input.readerFontSize.toFixed(2))));

  await offlineDb
    .updateTable('offline_chapters')
    .set({
      reader_font_size: safeFontSize,
      reader_is_hv: input.readerIsHv == null ? null : input.readerIsHv ? 1 : 0,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', id)
    .execute();

  return getOfflineChapterById(id);
}

export async function markOfflineChapterOpened(
  id: number,
  lastOpenedAt = new Date().toISOString(),
): Promise<OfflineChapterRecord | null> {
  await ensureOfflineDbReady();

  await offlineDb
    .updateTable('offline_chapters')
    .set({
      last_opened_at: lastOpenedAt,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', id)
    .execute();

  return getOfflineChapterById(id);
}

export async function getOfflineChapterSearchCache(
  storyId: number,
  rawQuery: string,
  chapterSignature: string,
): Promise<OfflineChapterSearchCacheRecord | null> {
  await ensureOfflineDbReady();

  const normalizedQuery = normalizeOfflineSearchCacheQuery(rawQuery);
  if (!normalizedQuery) {
    return null;
  }

  const row = await offlineDb
    .selectFrom('offline_chapter_search_cache')
    .selectAll()
    .where('story_id', '=', storyId)
    .where('normalized_query', '=', normalizedQuery)
    .executeTakeFirst();

  if (!row || row.chapter_signature !== chapterSignature) {
    return null;
  }

  const now = new Date().toISOString();
  await offlineDb
    .updateTable('offline_chapter_search_cache')
    .set({
      search_count: sql<number>`search_count + 1`,
      last_searched_at: now,
      updated_at: now,
    })
    .where('id', '=', row.id)
    .execute();

  return mapOfflineChapterSearchCacheRow({
    ...row,
    search_count: row.search_count + 1,
    last_searched_at: now,
    updated_at: now,
  });
}

export async function recordOfflineChapterSearchKeyword(
  storyId: number,
  rawQuery: string,
): Promise<void> {
  await ensureOfflineDbReady();

  const normalizedQuery = normalizeOfflineSearchCacheQuery(rawQuery);
  if (!normalizedQuery) {
    return;
  }

  const now = new Date().toISOString();
  const query = rawQuery.trim();

  await offlineDb
    .insertInto('offline_chapter_search_cache')
    .values({
      story_id: storyId,
      raw_query: query,
      normalized_query: normalizedQuery,
      result_json: '[]',
      result_count: 0,
      chapter_signature: '',
      search_count: 1,
      last_searched_at: now,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(['story_id', 'normalized_query']).doUpdateSet({
        raw_query: query,
        search_count: sql<number>`search_count + 1`,
        last_searched_at: now,
        updated_at: now,
      }),
    )
    .execute();
}

export async function saveOfflineChapterSearchCache(
  input: SaveOfflineChapterSearchCacheInput,
): Promise<void> {
  await ensureOfflineDbReady();

  const normalizedQuery = normalizeOfflineSearchCacheQuery(input.rawQuery);
  if (!normalizedQuery) {
    return;
  }

  const now = new Date().toISOString();
  const rawQuery = input.rawQuery.trim();

  await offlineDb
    .insertInto('offline_chapter_search_cache')
    .values({
      story_id: input.storyId,
      raw_query: rawQuery,
      normalized_query: normalizedQuery,
      result_json: JSON.stringify(input.matches),
      result_count: input.matches.length,
      chapter_signature: input.chapterSignature,
      search_count: 1,
      last_searched_at: now,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(['story_id', 'normalized_query']).doUpdateSet({
        raw_query: rawQuery,
        result_json: JSON.stringify(input.matches),
        result_count: input.matches.length,
        chapter_signature: input.chapterSignature,
        search_count: sql<number>`search_count + 1`,
        last_searched_at: now,
        updated_at: now,
      }),
    )
    .execute();
}

export async function listOfflineChapterSearchSuggestions(
  storyId: number,
): Promise<OfflineChapterSearchSuggestion[]> {
  await ensureOfflineDbReady();

  const recent = await offlineDb
    .selectFrom('offline_chapter_search_cache')
    .select(['id', 'raw_query', 'search_count', 'last_searched_at'])
    .where('story_id', '=', storyId)
    .orderBy('last_searched_at', 'desc')
    .limit(1)
    .execute();

  const recentId = recent[0]?.id ?? null;
  const popularQuery = offlineDb
    .selectFrom('offline_chapter_search_cache')
    .select(['id', 'raw_query', 'search_count', 'last_searched_at'])
    .where('story_id', '=', storyId);

  const popular =
    recentId == null
      ? await popularQuery
          .orderBy('search_count', 'desc')
          .orderBy('last_searched_at', 'desc')
          .limit(4)
          .execute()
      : await popularQuery
          .where('id', '!=', recentId)
          .orderBy('search_count', 'desc')
          .orderBy('last_searched_at', 'desc')
          .limit(4)
          .execute();

  return [...recent, ...popular].map((row) => ({
    id: row.id,
    query: row.raw_query,
    searchCount: row.search_count,
    lastSearchedAt: row.last_searched_at,
  }));
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

export async function createEpubImportJob(
  input: CreateEpubImportJobInput,
): Promise<EpubImportJobRecord> {
  await ensureOfflineDbReady();

  const now = new Date().toISOString();
  const inserted = await offlineDb
    .insertInto('epub_import_jobs')
    .values({
      file_name: input.fileName,
      picked_file_uri: input.pickedFileUri,
      source_file_uri: input.sourceFileUri ?? null,
      workspace_uri: input.workspaceUri ?? null,
      story_id: input.storyId ?? null,
      status: 'queued',
      total_chapters: 0,
      imported_chapters: 0,
      checkpoint_chapter_index: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapEpubImportJobRow(inserted);
}

export async function getEpubImportJobById(id: number): Promise<EpubImportJobRecord | null> {
  await ensureOfflineDbReady();

  const row = await offlineDb
    .selectFrom('epub_import_jobs')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? mapEpubImportJobRow(row) : null;
}

export async function listEpubImportJobs(): Promise<EpubImportJobRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('epub_import_jobs')
    .selectAll()
    .orderBy('created_at', 'desc')
    .execute();

  return rows.map(mapEpubImportJobRow);
}

export async function listPendingEpubImportJobs(): Promise<EpubImportJobRecord[]> {
  await ensureOfflineDbReady();

  const rows = await offlineDb
    .selectFrom('epub_import_jobs')
    .selectAll()
    .where('status', 'in', ['queued', 'extracting', 'parsing', 'importing', 'paused'])
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map(mapEpubImportJobRow);
}

export async function updateEpubImportJob(
  id: number,
  input: UpdateEpubImportJobInput,
): Promise<EpubImportJobRecord | null> {
  await ensureOfflineDbReady();

  const nextValues: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.fileName !== undefined) nextValues.file_name = input.fileName;
  if (input.pickedFileUri !== undefined) nextValues.picked_file_uri = input.pickedFileUri;
  if (input.sourceFileUri !== undefined) nextValues.source_file_uri = input.sourceFileUri;
  if (input.workspaceUri !== undefined) nextValues.workspace_uri = input.workspaceUri;
  if (input.storyId !== undefined) nextValues.story_id = input.storyId;
  if (input.status !== undefined) nextValues.status = input.status;
  if (input.totalChapters !== undefined) nextValues.total_chapters = input.totalChapters;
  if (input.importedChapters !== undefined) nextValues.imported_chapters = input.importedChapters;
  if (input.checkpointChapterIndex !== undefined) {
    nextValues.checkpoint_chapter_index = input.checkpointChapterIndex;
  }
  if (input.errorMessage !== undefined) nextValues.error_message = input.errorMessage;

  await offlineDb.updateTable('epub_import_jobs').set(nextValues).where('id', '=', id).execute();

  return getEpubImportJobById(id);
}

export async function deleteEpubImportJob(id: number): Promise<void> {
  await ensureOfflineDbReady();

  await offlineDb.deleteFrom('epub_import_jobs').where('id', '=', id).execute();
}

export async function deleteOfflineStory(id: number): Promise<void> {
  await ensureOfflineDbReady();

  await offlineDb.transaction().execute(async (transaction) => {
    await transaction
      .deleteFrom('offline_chapter_search_cache')
      .where('story_id', '=', id)
      .execute();
    await transaction
      .updateTable('epub_import_jobs')
      .set({ story_id: null })
      .where('story_id', '=', id)
      .execute();
    await transaction.deleteFrom('offline_chapters').where('story_id', '=', id).execute();
    await transaction.deleteFrom('offline_stories').where('id', '=', id).execute();
  });

  await optimizeOfflineDatabase();
}

export async function deleteOfflineChapter(id: number): Promise<void> {
  await ensureOfflineDbReady();

  await offlineDb.deleteFrom('offline_chapters').where('id', '=', id).execute();
  await optimizeOfflineDatabase();
}
