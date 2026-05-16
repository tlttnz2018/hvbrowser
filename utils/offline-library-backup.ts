import { Directory, File } from 'expo-file-system';
import { Unzip, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

import {
  getOfflineChapterById,
  getOfflineChapterByUrl,
  listOfflineChapterBackupRecordsByStory,
  listOfflineStories,
  OfflineChapterBackupRecord,
  OfflineChapterStatus,
  OfflineLibraryBackupChapter,
  OfflineLibraryBackupManifest,
  OfflineLibraryBackupStory,
  OfflineLibraryImportResult,
  OfflineStoryRecord,
  saveOfflineChapter,
  upsertOfflineStory,
} from '../db/offline';
import { sanitizeBookmarkUrl } from './bookmarks';
import { getEpubAssetDirectory } from './epub-import';

const BACKUP_FORMAT = 'hvbrowser-offline-library' as const;
const BACKUP_VERSION = 1 as const;
const ZIP_CHUNK_SIZE = 64 * 1024;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ASSET_PLACEHOLDER_SCHEME = 'hvbrowser-backup-asset://';

interface StoryImportContext {
  backupStory: OfflineLibraryBackupStory;
  story: OfflineStoryRecord;
  assetRoot: Directory | null;
  chapterByContentPath: Map<string, OfflineLibraryBackupChapter>;
}

function ensureDirectory(directory: Directory) {
  directory.create({ idempotent: true, intermediates: true });
}

function ensureParentDirectory(file: File) {
  ensureDirectory(file.parentDirectory);
}

function normalizeComparisonText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSourceFileName(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function normalizeRemoteStoryUrl(value: string | null | undefined) {
  const normalized = sanitizeBookmarkUrl(value ?? '');
  return normalized || null;
}

function normalizeAssetRootUri(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function getStoryKey(storyId: number) {
  return `story-${storyId}`;
}

function getStoryDirectoryPath(storyKey: string) {
  return `stories/${storyKey}`;
}

function getAssetPlaceholderPrefix(storyKey: string) {
  return `${ASSET_PLACEHOLDER_SCHEME}${storyKey}/`;
}

function shouldCompressArchivePath(archivePath: string) {
  return /\.(json|html|htm|svg|css|xml|txt)$/i.test(archivePath);
}

function joinArchivePath(...segments: string[]) {
  return segments.map((segment) => segment.replace(/^\/+|\/+$/g, '')).join('/');
}

function toUtf8Bytes(value: string) {
  return TEXT_ENCODER.encode(value);
}

function fromUtf8Bytes(bytes: Uint8Array) {
  return TEXT_DECODER.decode(bytes);
}

function concatChunks(chunks: Uint8Array[], totalLength: number) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function createZipEntry(archivePath: string) {
  return shouldCompressArchivePath(archivePath)
    ? new ZipDeflate(archivePath, { level: 6 })
    : new ZipPassThrough(archivePath);
}

function pushBytesToZip(zip: Zip, archivePath: string, bytes: Uint8Array) {
  const entry = createZipEntry(archivePath);
  zip.add(entry);
  entry.push(bytes, true);
}

function pushTextToZip(zip: Zip, archivePath: string, text: string) {
  pushBytesToZip(zip, archivePath, toUtf8Bytes(text));
}

async function pushFileToZip(zip: Zip, archivePath: string, sourceFile: File) {
  const entry = createZipEntry(archivePath);
  zip.add(entry);

  const handle = sourceFile.open();

  try {
    const totalSize = handle.size ?? sourceFile.size;
    if (totalSize === 0) {
      entry.push(new Uint8Array(), true);
      return;
    }

    while ((handle.offset ?? 0) < totalSize) {
      const remaining = totalSize - (handle.offset ?? 0);
      const chunk = handle.readBytes(Math.min(ZIP_CHUNK_SIZE, remaining));
      entry.push(chunk, (handle.offset ?? 0) >= totalSize);
    }
  } finally {
    handle.close();
  }
}

function listFilesRecursively(
  directory: Directory,
  prefix = '',
): Array<{ file: File; relativePath: string }> {
  const files: Array<{ file: File; relativePath: string }> = [];

  for (const entry of directory.list()) {
    if (entry instanceof Directory) {
      files.push(...listFilesRecursively(entry, joinArchivePath(prefix, entry.name)));
      continue;
    }

    files.push({
      file: entry,
      relativePath: joinArchivePath(prefix, entry.name),
    });
  }

  return files;
}

function getCoverImagePath(story: OfflineStoryRecord) {
  if (!story.assetRootUri || !story.coverImageUri) {
    return null;
  }

  const normalizedRoot = normalizeAssetRootUri(story.assetRootUri);
  if (!story.coverImageUri.startsWith(normalizedRoot)) {
    return null;
  }

  return story.coverImageUri.slice(normalizedRoot.length);
}

function rewriteHtmlForBackup(html: string, storyKey: string, assetRootUri: string | null) {
  if (!assetRootUri) {
    return html;
  }

  return html.replaceAll(normalizeAssetRootUri(assetRootUri), getAssetPlaceholderPrefix(storyKey));
}

function rewriteHtmlFromBackup(html: string, storyKey: string, assetRoot: Directory | null) {
  if (!assetRoot) {
    return html;
  }

  return html.replaceAll(getAssetPlaceholderPrefix(storyKey), normalizeAssetRootUri(assetRoot.uri));
}

function normalizeImportedChapterStatus(status: OfflineChapterStatus) {
  return status === 'downloading' ? 'queued' : status;
}

function buildBackupStory(
  story: OfflineStoryRecord,
  chapters: OfflineChapterBackupRecord[],
  assetFiles: Array<{ file: File; relativePath: string }>,
) {
  const storyKey = getStoryKey(story.id);
  const storyDirectory = getStoryDirectoryPath(storyKey);

  const backupStory: OfflineLibraryBackupStory = {
    storyKey,
    name: story.name,
    homePageUrl: story.homePageUrl,
    indexPageUrl: story.indexPageUrl,
    sourceType: story.sourceType,
    author: story.author,
    sourceFileName: story.sourceFileName,
    coverImagePath: getCoverImagePath(story),
    assetPlaceholderPrefix:
      story.assetRootUri && assetFiles.length > 0 ? getAssetPlaceholderPrefix(storyKey) : null,
    chapters: chapters.map((chapter) => ({
      chapterUrl: chapter.chapterUrl,
      chapterName: chapter.chapterName,
      chapterOrder: chapter.chapterOrder,
      downloadStatus: chapter.downloadStatus,
      downloadError: chapter.downloadError,
      downloadedAt: chapter.downloadedAt,
      lastOpenedAt: chapter.lastOpenedAt,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
      contentPath:
        chapter.downloadStatus === 'downloaded'
          ? joinArchivePath(storyDirectory, 'chapters', `${chapter.id}.html`)
          : null,
    })),
    assets: assetFiles.map(({ relativePath }) => ({
      archivePath: joinArchivePath(storyDirectory, 'assets', relativePath),
      relativePath,
    })),
  };

  return backupStory;
}

function replaceStoryInCache(stories: OfflineStoryRecord[], nextStory: OfflineStoryRecord) {
  const existingIndex = stories.findIndex((story) => story.id === nextStory.id);
  if (existingIndex >= 0) {
    stories.splice(existingIndex, 1, nextStory);
    return;
  }

  stories.push(nextStory);
}

function findMatchingRemoteStory(
  stories: OfflineStoryRecord[],
  backupStory: OfflineLibraryBackupStory,
) {
  const normalizedHome = normalizeRemoteStoryUrl(backupStory.homePageUrl);
  const normalizedIndex = normalizeRemoteStoryUrl(backupStory.indexPageUrl);

  return (
    stories.find((story) => {
      if (story.sourceType !== 'remote') {
        return false;
      }

      const existingHome = normalizeRemoteStoryUrl(story.homePageUrl);
      const existingIndex = normalizeRemoteStoryUrl(story.indexPageUrl);

      return (
        (normalizedHome && existingHome === normalizedHome) ||
        (normalizedIndex && existingIndex === normalizedIndex)
      );
    }) ?? null
  );
}

function findMatchingEpubStory(
  stories: OfflineStoryRecord[],
  backupStory: OfflineLibraryBackupStory,
) {
  const incomingTitle = normalizeComparisonText(backupStory.name);
  const incomingAuthor = normalizeComparisonText(backupStory.author);
  const incomingFileName = normalizeSourceFileName(backupStory.sourceFileName);

  return (
    stories.find((story) => {
      if (story.sourceType !== 'epub') {
        return false;
      }

      const existingTitle = normalizeComparisonText(story.name);
      const existingAuthor = normalizeComparisonText(story.author);
      const existingFileName = normalizeSourceFileName(story.sourceFileName);

      if (incomingTitle) {
        if (existingTitle !== incomingTitle) {
          return false;
        }

        if (existingAuthor && incomingAuthor) {
          return existingAuthor === incomingAuthor;
        }

        if ((existingAuthor && !incomingAuthor) || (!existingAuthor && incomingAuthor)) {
          return !!incomingFileName && existingFileName === incomingFileName;
        }

        return true;
      }

      if (!incomingFileName) {
        return false;
      }

      return existingFileName === incomingFileName;
    }) ?? null
  );
}

function findMatchingStory(stories: OfflineStoryRecord[], backupStory: OfflineLibraryBackupStory) {
  if (backupStory.sourceType === 'remote') {
    return findMatchingRemoteStory(stories, backupStory);
  }

  return findMatchingEpubStory(stories, backupStory);
}

async function prepareStoryImportContext(
  backupStory: OfflineLibraryBackupStory,
  existingStories: OfflineStoryRecord[],
) {
  const matchedStory = findMatchingStory(existingStories, backupStory);
  const normalizedHomePageUrl = normalizeRemoteStoryUrl(backupStory.homePageUrl);
  const normalizedIndexPageUrl = normalizeRemoteStoryUrl(backupStory.indexPageUrl);

  let story = await upsertOfflineStory({
    id: matchedStory?.id,
    name: backupStory.name,
    homePageUrl: normalizedHomePageUrl,
    indexPageUrl: normalizedIndexPageUrl,
    sourceType: backupStory.sourceType,
    author: backupStory.author,
    sourceFileName: backupStory.sourceFileName,
  });

  let assetRoot: Directory | null = null;
  if (
    backupStory.sourceType === 'epub' &&
    (backupStory.assets.length > 0 || backupStory.coverImagePath)
  ) {
    assetRoot = getEpubAssetDirectory(story.id);
    ensureDirectory(assetRoot);
    story = await upsertOfflineStory({
      id: story.id,
      name: story.name,
      sourceType: 'epub',
      author: backupStory.author,
      sourceFileName: backupStory.sourceFileName,
      assetRootUri: assetRoot.uri,
      coverImageUri: backupStory.coverImagePath
        ? new File(assetRoot, backupStory.coverImagePath).uri
        : null,
    });
  }

  replaceStoryInCache(existingStories, story);

  return {
    backupStory,
    story,
    assetRoot,
    chapterByContentPath: new Map(
      backupStory.chapters
        .filter((chapter) => !!chapter.contentPath)
        .map((chapter) => [chapter.contentPath as string, chapter]),
    ),
  } satisfies StoryImportContext;
}

async function importBackupChapter(
  context: StoryImportContext,
  chapter: OfflineLibraryBackupChapter,
  originalHtml: string | null,
) {
  const existingChapter = await getOfflineChapterByUrl(chapter.chapterUrl);

  if (
    !originalHtml &&
    existingChapter?.downloadStatus === 'downloaded' &&
    existingChapter.originalHtml
  ) {
    await saveOfflineChapter({
      storyId: context.story.id,
      chapterName: chapter.chapterName,
      chapterUrl: chapter.chapterUrl,
      chapterOrder: chapter.chapterOrder,
      originalHtml: existingChapter.originalHtml,
      convertedHvHtml: existingChapter.convertedHvHtml,
      downloadStatus: 'downloaded',
      downloadError: existingChapter.downloadError,
      downloadedAt: existingChapter.downloadedAt,
      lastOpenedAt: chapter.lastOpenedAt ?? existingChapter.lastOpenedAt,
    });
    return { imported: true, queued: false };
  }

  const nextStatus =
    originalHtml != null ? 'downloaded' : normalizeImportedChapterStatus(chapter.downloadStatus);
  const nextOriginalHtml =
    originalHtml != null
      ? rewriteHtmlFromBackup(originalHtml, context.backupStory.storyKey, context.assetRoot)
      : '';

  await saveOfflineChapter({
    storyId: context.story.id,
    chapterName: chapter.chapterName,
    chapterUrl: chapter.chapterUrl,
    chapterOrder: chapter.chapterOrder,
    originalHtml: nextOriginalHtml,
    convertedHvHtml: originalHtml != null ? '' : (existingChapter?.convertedHvHtml ?? ''),
    downloadStatus: nextStatus,
    downloadError: nextStatus === 'failed' ? chapter.downloadError : null,
    downloadedAt:
      nextStatus === 'downloaded' ? (chapter.downloadedAt ?? new Date().toISOString()) : null,
    lastOpenedAt: chapter.lastOpenedAt ?? existingChapter?.lastOpenedAt ?? null,
  });

  return {
    imported: true,
    queued: nextStatus === 'queued',
  };
}

async function writeImportedAsset(
  context: StoryImportContext,
  relativePath: string,
  bytes: Uint8Array,
) {
  if (!context.assetRoot) {
    return false;
  }

  const targetFile = new File(context.assetRoot, relativePath);
  ensureParentDirectory(targetFile);
  targetFile.create({ overwrite: true, intermediates: true });
  const handle = targetFile.open();

  try {
    handle.writeBytes(bytes);
  } finally {
    handle.close();
  }

  return true;
}

function getStoryKeyFromArchivePath(pathname: string) {
  const segments = pathname.split('/');
  return segments.length >= 2 && segments[0] === 'stories' ? segments[1] : null;
}

function getRelativeArchivePath(pathname: string, startIndex: number) {
  return pathname.split('/').slice(startIndex).join('/');
}

function assertBackupManifest(value: unknown): asserts value is OfflineLibraryBackupManifest {
  const manifest = value as Partial<OfflineLibraryBackupManifest> | null;
  if (
    !manifest ||
    manifest.format !== BACKUP_FORMAT ||
    manifest.version !== BACKUP_VERSION ||
    !Array.isArray(manifest.storyKeys)
  ) {
    throw new Error('The selected file is not a supported hvbrowser offline library backup.');
  }
}

function assertBackupStory(value: unknown): asserts value is OfflineLibraryBackupStory {
  const story = value as Partial<OfflineLibraryBackupStory> | null;
  if (
    !story ||
    typeof story.storyKey !== 'string' ||
    typeof story.name !== 'string' ||
    !Array.isArray(story.chapters) ||
    !Array.isArray(story.assets)
  ) {
    throw new Error('The selected backup contains an invalid story entry.');
  }
}

export async function exportOfflineLibraryBackup(destinationDirectory: Directory): Promise<File> {
  ensureDirectory(destinationDirectory);

  const stories = await listOfflineStories();
  const exportFile = new File(
    destinationDirectory.uri,
    `hvbrowser-offline-library-${new Date().toISOString().slice(0, 10)}.zip`,
  );
  exportFile.create({ overwrite: true, intermediates: true });

  const outputHandle = exportFile.open();

  try {
    await new Promise<void>(async (resolve, reject) => {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }

        if (chunk?.length) {
          outputHandle.writeBytes(chunk);
        }

        if (final) {
          resolve();
        }
      });

      try {
        const manifest: OfflineLibraryBackupManifest = {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          storyKeys: stories.map((story) => getStoryKey(story.id)),
          totalStories: stories.length,
        };
        pushTextToZip(zip, 'manifest.json', JSON.stringify(manifest, null, 2));

        for (const story of stories) {
          const chapters = await listOfflineChapterBackupRecordsByStory(story.id);
          const assetFiles =
            story.assetRootUri && new Directory(story.assetRootUri).exists
              ? listFilesRecursively(new Directory(story.assetRootUri))
              : [];
          const backupStory = buildBackupStory(story, chapters, assetFiles);
          const storyDirectory = getStoryDirectoryPath(backupStory.storyKey);

          pushTextToZip(
            zip,
            joinArchivePath(storyDirectory, 'story.json'),
            JSON.stringify(backupStory, null, 2),
          );

          for (const chapter of chapters) {
            if (chapter.downloadStatus !== 'downloaded') {
              continue;
            }

            const fullChapter = await getOfflineChapterById(chapter.id);
            if (!fullChapter?.originalHtml) {
              continue;
            }

            pushTextToZip(
              zip,
              joinArchivePath(storyDirectory, 'chapters', `${chapter.id}.html`),
              rewriteHtmlForBackup(
                fullChapter.originalHtml,
                backupStory.storyKey,
                story.assetRootUri,
              ),
            );
          }

          for (const asset of assetFiles) {
            await pushFileToZip(
              zip,
              joinArchivePath(storyDirectory, 'assets', asset.relativePath),
              asset.file,
            );
          }
        }

        zip.end();
      } catch (error) {
        try {
          zip.terminate();
        } catch {
          // noop
        }
        reject(error);
      }
    });
  } catch (error) {
    if (exportFile.exists) {
      exportFile.delete();
    }
    throw error;
  } finally {
    outputHandle.close();
  }

  return exportFile;
}

export async function importOfflineLibraryBackup(
  backupFile: File,
): Promise<OfflineLibraryImportResult> {
  const handle = backupFile.open();
  const existingStories = await listOfflineStories();
  const storyContexts = new Map<string, StoryImportContext>();
  let manifest: OfflineLibraryBackupManifest | null = null;
  let processingQueue = Promise.resolve();
  const result: OfflineLibraryImportResult = {
    importedStories: 0,
    importedChapters: 0,
    queuedChapters: 0,
    assetFiles: 0,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const unzip = new Unzip();
      let pendingEntries = 0;
      let inputCompleted = false;
      let failed = false;
      let settled = false;

      const fail = (error: unknown) => {
        if (failed) {
          return;
        }
        failed = true;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const maybeFinish = () => {
        if (settled || failed || !inputCompleted || pendingEntries > 0) {
          return;
        }

        settled = true;
        processingQueue.then(() => resolve()).catch(fail);
      };

      unzip.onfile = (entry) => {
        pendingEntries += 1;
        const chunks: Uint8Array[] = [];
        let totalLength = 0;

        entry.ondata = (error, chunk, final) => {
          if (error) {
            fail(error);
            return;
          }

          if (chunk?.length) {
            chunks.push(chunk);
            totalLength += chunk.length;
          }

          if (!final) {
            return;
          }

          const bytes = concatChunks(chunks, totalLength);
          processingQueue = processingQueue.then(async () => {
            if (entry.name === 'manifest.json') {
              const parsed = JSON.parse(fromUtf8Bytes(bytes)) as unknown;
              assertBackupManifest(parsed);
              manifest = parsed;
              return;
            }

            if (!manifest) {
              throw new Error('The selected backup is missing its manifest header.');
            }

            if (entry.name.endsWith('/story.json')) {
              const parsed = JSON.parse(fromUtf8Bytes(bytes)) as unknown;
              assertBackupStory(parsed);
              const context = await prepareStoryImportContext(parsed, existingStories);
              storyContexts.set(parsed.storyKey, context);
              result.importedStories += 1;

              for (const chapter of parsed.chapters) {
                if (chapter.contentPath) {
                  continue;
                }

                const importResult = await importBackupChapter(context, chapter, null);
                if (importResult.imported) {
                  result.importedChapters += 1;
                }
                if (importResult.queued) {
                  result.queuedChapters += 1;
                }
              }
              return;
            }

            const storyKey = getStoryKeyFromArchivePath(entry.name);
            if (!storyKey) {
              return;
            }

            const context = storyContexts.get(storyKey);
            if (!context) {
              throw new Error(`Backup story context is missing for ${storyKey}.`);
            }

            if (entry.name.includes('/assets/')) {
              const relativePath = getRelativeArchivePath(entry.name, 3);
              const wroteAsset = await writeImportedAsset(context, relativePath, bytes);
              if (wroteAsset) {
                result.assetFiles += 1;
              }
              return;
            }

            if (entry.name.includes('/chapters/')) {
              const chapter = context.chapterByContentPath.get(entry.name);
              if (!chapter) {
                throw new Error(`Backup chapter metadata is missing for ${entry.name}.`);
              }

              const importResult = await importBackupChapter(
                context,
                chapter,
                fromUtf8Bytes(bytes),
              );
              if (importResult.imported) {
                result.importedChapters += 1;
              }
              if (importResult.queued) {
                result.queuedChapters += 1;
              }
            }
          });

          pendingEntries -= 1;
          maybeFinish();
        };

        entry.start();
      };

      try {
        const totalSize = handle.size ?? backupFile.size;
        while ((handle.offset ?? 0) < totalSize) {
          const remaining = totalSize - (handle.offset ?? 0);
          const chunk = handle.readBytes(Math.min(ZIP_CHUNK_SIZE, remaining));
          unzip.push(chunk, (handle.offset ?? 0) >= totalSize);
        }
        inputCompleted = true;
        maybeFinish();
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    handle.close();
  }

  if (!manifest) {
    throw new Error('The selected backup did not contain a manifest.');
  }

  return result;
}
