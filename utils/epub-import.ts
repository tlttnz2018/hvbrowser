import { render } from 'dom-serializer';
import type { Element } from 'domhandler';
import { findAll, getAttributeValue, isTag, textContent } from 'domutils';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync as legacyCopyAsync } from 'expo-file-system/legacy';
import { XMLParser } from 'fast-xml-parser';
import { Unzip, UnzipInflate } from 'fflate';
import { parseDocument } from 'htmlparser2';

import {
  type EpubImportJobRecord,
  getOfflineStoryById,
  OfflineChapterRecord,
  OfflineStoryRecord,
  saveOfflineChapter,
  updateEpubImportJob,
  upsertOfflineStory,
} from '../db/offline';

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
});

const ZIP_CHUNK_SIZE = 256 * 1024;
const EPUB_CACHE_ROOT = new Directory(Paths.cache, 'epub-imports');
const EPUB_ASSET_ROOT = new Directory(Paths.document, 'epubs');

export interface EpubChapterDescriptor {
  chapterUrl: string;
  sourceUri: string;
  label: string;
  order: number;
}

export interface ParsedEpubPackage {
  title: string;
  author: string | null;
  coverImageSourceUri: string | null;
  rootFileUri: string;
  chapterDescriptors: EpubChapterDescriptor[];
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value == null ? [] : [value];
}

function stripHash(value: string) {
  return value.replace(/#.*$/, '');
}

function normalizeText(value: string | undefined | null, fallback = '') {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed || fallback;
}

export function basenameFromUri(uri: string) {
  const pathname = uri.replace(/[?#].*$/, '');
  const parts = pathname.split('/');
  return parts[parts.length - 1] || 'file';
}

function ensureDirectory(directory: Directory) {
  directory.create({ idempotent: true, intermediates: true });
}

async function yieldToApp() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function getEpubWorkspaceDirectory(jobId: number) {
  return new Directory(EPUB_CACHE_ROOT, String(jobId));
}

export function getEpubSourceFile(jobId: number) {
  return new File(getEpubWorkspaceDirectory(jobId), 'source.epub');
}

export function getEpubUnzippedDirectory(jobId: number) {
  return new Directory(getEpubWorkspaceDirectory(jobId), 'unzipped');
}

export function getEpubAssetDirectory(storyId: number) {
  return new Directory(EPUB_ASSET_ROOT, String(storyId), 'assets');
}

function resolveUri(baseUri: string, relative: string) {
  return new URL(relative, baseUri).toString();
}

function resolveFragment(target: string) {
  const hashIndex = target.indexOf('#');
  return hashIndex >= 0 ? target.slice(hashIndex) : '';
}

function resolveFilePath(baseFileUri: string, target: string) {
  return stripHash(resolveUri(baseFileUri, target));
}

function getXmlNodeText(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (!node || typeof node !== 'object') {
    return '';
  }

  const record = node as Record<string, unknown>;
  if (typeof record['#text'] === 'string') {
    return record['#text'];
  }
  if (typeof record.text === 'string') {
    return record.text;
  }
  return '';
}

function getPackageMetadataValue(metadata: Record<string, unknown>, key: string) {
  const entry = metadata[key];
  const first = asArray(entry)[0];
  return normalizeText(getXmlNodeText(first));
}

async function extractZipEntryToFile(source: File, target: File) {
  ensureDirectory(target.parentDirectory);
  if (target.exists) {
    target.delete();
  }

  await legacyCopyAsync({
    from: source.uri,
    to: target.uri,
  });
}

export async function cleanupWorkspace(directory: Directory | null | undefined) {
  if (directory?.exists) {
    directory.delete();
  }
}

export async function copyPickedEpubToWorkspace(job: EpubImportJobRecord) {
  const workspace = getEpubWorkspaceDirectory(job.id);
  ensureDirectory(EPUB_CACHE_ROOT);
  ensureDirectory(workspace);

  const sourceFile = getEpubSourceFile(job.id);
  if (sourceFile.exists) {
    return sourceFile;
  }

  const pickedFile = new File(job.pickedFileUri);
  if (!pickedFile.exists) {
    throw new Error('Selected EPUB file is no longer available on this device.');
  }

  await extractZipEntryToFile(pickedFile, sourceFile);
  await updateEpubImportJob(job.id, {
    sourceFileUri: sourceFile.uri,
    workspaceUri: workspace.uri,
  });

  return sourceFile;
}

export async function unzipEpubToWorkspace(sourceFile: File, destination: Directory) {
  if (destination.exists) {
    destination.delete();
  }
  ensureDirectory(destination);

  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);

    let pendingEntries = 0;
    let inputCompleted = false;
    let failed = false;

    const maybeFinish = () => {
      if (!failed && inputCompleted && pendingEntries === 0) {
        resolve();
      }
    };

    const fail = (error: Error) => {
      if (failed) {
        return;
      }
      failed = true;
      reject(error);
    };

    unzip.onfile = (entry) => {
      if (failed) {
        return;
      }

      const entryPath = entry.name.replace(/^\/+/, '');
      if (!entryPath) {
        return;
      }

      if (entryPath.endsWith('/')) {
        ensureDirectory(new Directory(destination, entryPath));
        return;
      }

      const targetFile = new File(destination, entryPath);
      ensureDirectory(targetFile.parentDirectory);
      targetFile.create({ overwrite: true, intermediates: true });
      const handle = targetFile.open();
      pendingEntries += 1;

      entry.ondata = (error, chunk, final) => {
        if (error) {
          try {
            handle.close();
          } catch {
            // ignore secondary close errors
          }
          fail(error);
          return;
        }

        if (chunk?.length) {
          handle.writeBytes(chunk);
        }

        if (final) {
          handle.close();
          pendingEntries -= 1;
          maybeFinish();
        }
      };

      entry.start();
    };

    const handle = sourceFile.open();

    try {
      const totalSize = handle.size ?? sourceFile.size;
      let offset = 0;

      while (offset < totalSize) {
        const remaining = totalSize - offset;
        const nextChunk = handle.readBytes(Math.min(ZIP_CHUNK_SIZE, remaining));
        offset += nextChunk.length;
        unzip.push(nextChunk, offset >= totalSize);
      }

      inputCompleted = true;
      maybeFinish();
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Unable to unzip EPUB archive.'));
    } finally {
      handle.close();
    }
  });
}

function parseContainerRootFileUri(unzippedDirectory: Directory) {
  const containerFile = new File(unzippedDirectory, 'META-INF', 'container.xml');
  if (!containerFile.exists) {
    throw new Error('EPUB is missing META-INF/container.xml.');
  }

  const parsed = XML_PARSER.parse(containerFile.textSync()) as {
    container?: {
      rootfiles?: {
        rootfile?: { 'full-path'?: string } | Array<{ 'full-path'?: string }>;
      };
    };
  };
  const rootfile = asArray(parsed.container?.rootfiles?.rootfile)[0];
  const fullPath = normalizeText(rootfile?.['full-path']);

  if (!fullPath) {
    throw new Error('EPUB container.xml is missing a rootfile path.');
  }

  return resolveUri(`${unzippedDirectory.uri}/`, fullPath);
}

function readNavLabels(navUri: string): Map<string, string> {
  const navFile = new File(navUri);
  if (!navFile.exists) {
    return new Map();
  }

  const doc = parseDocument(navFile.textSync(), { decodeEntities: true });
  const anchors = findAll((node) => isTag(node) && node.name === 'a', doc.children) as Element[];
  const labels = new Map<string, string>();

  for (const anchor of anchors) {
    const href = getAttributeValue(anchor, 'href');
    if (!href) {
      continue;
    }

    const target = stripHash(resolveUri(navUri, href));
    const label = normalizeText(textContent(anchor));
    if (label) {
      labels.set(target, label);
    }
  }

  return labels;
}

function flattenNavPoints(navPoints: unknown): Array<Record<string, unknown>> {
  const points = asArray(navPoints as Record<string, unknown> | Array<Record<string, unknown>>);
  return points.flatMap((point) => [
    point,
    ...flattenNavPoints((point as Record<string, unknown>).navPoint),
  ]);
}

function readNcxLabels(ncxUri: string): Map<string, string> {
  const ncxFile = new File(ncxUri);
  if (!ncxFile.exists) {
    return new Map();
  }

  const parsed = XML_PARSER.parse(ncxFile.textSync()) as {
    ncx?: { navMap?: { navPoint?: unknown } };
  };
  const labels = new Map<string, string>();

  for (const navPoint of flattenNavPoints(parsed.ncx?.navMap?.navPoint)) {
    const content = navPoint.content as Record<string, string> | undefined;
    const navLabel = navPoint.navLabel as Record<string, unknown> | undefined;
    const src = normalizeText(content?.src);
    const label = normalizeText(getXmlNodeText(navLabel?.text));

    if (src && label) {
      labels.set(stripHash(resolveUri(ncxUri, src)), label);
    }
  }

  return labels;
}

function getDocumentTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return normalizeText(titleMatch?.[1]);
}

export async function parseEpubPackage(unzippedDirectory: Directory): Promise<ParsedEpubPackage> {
  const rootFileUri = parseContainerRootFileUri(unzippedDirectory);
  const rootFile = new File(rootFileUri);
  if (!rootFile.exists) {
    throw new Error('EPUB package file is missing.');
  }

  const packageXml = XML_PARSER.parse(rootFile.textSync()) as {
    package?: {
      metadata?: Record<string, unknown>;
      manifest?: { item?: Array<Record<string, string>> | Record<string, string> };
      spine?: { itemref?: Array<Record<string, string>> | Record<string, string>; toc?: string };
    };
  };
  const metadata = packageXml.package?.metadata ?? {};
  const manifestItems = asArray(packageXml.package?.manifest?.item);
  const spineItems = asArray(packageXml.package?.spine?.itemref);
  const opfDirectoryUri = rootFile.parentDirectory.uri.endsWith('/')
    ? rootFile.parentDirectory.uri
    : `${rootFile.parentDirectory.uri}/`;

  const manifestById = new Map(
    manifestItems.map((item) => [
      item.id,
      {
        href: normalizeText(item.href),
        mediaType: normalizeText(item['media-type']),
        properties: normalizeText(item.properties).split(/\s+/).filter(Boolean),
      },
    ]),
  );

  const navManifestEntry = manifestItems.find((item) =>
    normalizeText(item.properties).split(/\s+/).includes('nav'),
  );
  const navUri = navManifestEntry
    ? resolveUri(opfDirectoryUri, normalizeText(navManifestEntry.href))
    : null;
  const ncxItemId = normalizeText(packageXml.package?.spine?.toc);
  const ncxManifestEntry = ncxItemId ? manifestById.get(ncxItemId) : null;
  const ncxUri = ncxManifestEntry?.href ? resolveUri(opfDirectoryUri, ncxManifestEntry.href) : null;

  const labelLookup = new Map<string, string>();
  if (navUri) {
    for (const [key, value] of readNavLabels(navUri)) {
      labelLookup.set(key, value);
    }
  }
  if (ncxUri) {
    for (const [key, value] of readNcxLabels(ncxUri)) {
      if (!labelLookup.has(key)) {
        labelLookup.set(key, value);
      }
    }
  }

  const title = getPackageMetadataValue(metadata, 'dc:title') || basenameFromUri(rootFileUri);
  const author = getPackageMetadataValue(metadata, 'dc:creator') || null;
  const coverMeta = asArray(metadata.meta).find(
    (item) => (item as Record<string, string>)?.name === 'cover',
  ) as Record<string, string> | undefined;
  const coverId = normalizeText(coverMeta?.content);
  const coverManifestEntry =
    (coverId ? manifestById.get(coverId) : null) ||
    Array.from(manifestById.values()).find((item) => item.properties.includes('cover-image')) ||
    null;
  const coverImageSourceUri = coverManifestEntry?.href
    ? resolveUri(opfDirectoryUri, coverManifestEntry.href)
    : null;

  const chapterDescriptors = spineItems
    .map((item, index) => {
      const manifestEntry = manifestById.get(item.idref);
      if (!manifestEntry) {
        return null;
      }

      const fileUri = resolveUri(opfDirectoryUri, manifestEntry.href);
      const mediaType = manifestEntry.mediaType;
      if (
        mediaType &&
        !['application/xhtml+xml', 'text/html', 'application/xml'].includes(mediaType) &&
        !/\.(xhtml|html|htm)$/i.test(fileUri)
      ) {
        return null;
      }

      const sourceFile = new File(fileUri);
      const fallbackLabel = `Section ${index + 1}`;
      const label =
        labelLookup.get(stripHash(fileUri)) ||
        (sourceFile.exists ? getDocumentTitle(sourceFile.textSync()) : '') ||
        basenameFromUri(fileUri) ||
        fallbackLabel;

      return {
        chapterUrl: '',
        sourceUri: fileUri,
        label: normalizeText(label, fallbackLabel),
        order: index + 1,
      } satisfies EpubChapterDescriptor;
    })
    .filter((entry): entry is EpubChapterDescriptor => entry !== null);

  return {
    title,
    author,
    coverImageSourceUri,
    rootFileUri,
    chapterDescriptors,
  };
}

function buildChapterIndexMap(
  storyId: number,
  chapters: EpubChapterDescriptor[],
): {
  chapterUrlByFileUri: Map<string, string>;
  chapterLabelByFileUri: Map<string, string>;
} {
  const chapterUrlByFileUri = new Map<string, string>();
  const chapterLabelByFileUri = new Map<string, string>();

  chapters.forEach((chapter, index) => {
    const chapterUrl = `epub://story/${storyId}/chapter/${index + 1}`;
    chapter.chapterUrl = chapterUrl;
    chapterUrlByFileUri.set(stripHash(chapter.sourceUri), chapterUrl);
    chapterLabelByFileUri.set(stripHash(chapter.sourceUri), chapter.label);
  });

  return { chapterUrlByFileUri, chapterLabelByFileUri };
}

function rewriteAnchorHref(
  href: string,
  chapterFileUri: string,
  chapterUrlByFileUri: Map<string, string>,
) {
  if (!href || /^javascript:/i.test(href) || /^data:/i.test(href)) {
    return href;
  }
  if (/^[a-z][a-z0-9+\-.]*:/i.test(href) && !href.startsWith('file:')) {
    return href;
  }
  if (href.startsWith('#')) {
    return href;
  }

  const targetUri = resolveUri(chapterFileUri, href);
  const targetWithoutHash = stripHash(targetUri);
  const matchingChapterUrl = chapterUrlByFileUri.get(targetWithoutHash);
  if (!matchingChapterUrl) {
    return href;
  }

  return `${matchingChapterUrl}${resolveFragment(targetUri)}`;
}

async function persistAssetUri(
  assetUri: string,
  assetRoot: Directory,
  assetCache: Map<string, string>,
): Promise<string> {
  const cached = assetCache.get(assetUri);
  if (cached) {
    return cached;
  }

  const source = new File(assetUri);
  if (!source.exists) {
    return assetUri;
  }

  const pathname = new URL(assetUri).pathname;
  const relativePath =
    pathname.split('/unzipped/')[1]?.replace(/^\/+/, '') || basenameFromUri(assetUri);
  const target = new File(assetRoot, relativePath);
  ensureDirectory(target.parentDirectory);
  if (!target.exists) {
    await legacyCopyAsync({
      from: source.uri,
      to: target.uri,
    });
  }

  assetCache.set(assetUri, target.uri);
  return target.uri;
}

async function rewriteChapterHtml(
  rawHtml: string,
  chapterFileUri: string,
  assetRoot: Directory,
  chapterUrlByFileUri: Map<string, string>,
  assetCache: Map<string, string>,
): Promise<string> {
  const document = parseDocument(rawHtml, {
    decodeEntities: false,
    lowerCaseAttributeNames: false,
    recognizeSelfClosing: true,
  });
  const tags = findAll((node) => isTag(node), document.children) as Element[];

  for (const tag of tags) {
    if (tag.name === 'img' || tag.name === 'image') {
      const sourceAttr = tag.attribs.src ? 'src' : tag.attribs['xlink:href'] ? 'xlink:href' : null;
      if (sourceAttr) {
        const rawSrc = tag.attribs[sourceAttr];
        if (rawSrc && !/^data:/i.test(rawSrc)) {
          const resolvedAssetUri = resolveFilePath(chapterFileUri, rawSrc);
          tag.attribs[sourceAttr] = await persistAssetUri(resolvedAssetUri, assetRoot, assetCache);
        }
      }
    }

    if (tag.name === 'a' && tag.attribs.href) {
      tag.attribs.href = rewriteAnchorHref(tag.attribs.href, chapterFileUri, chapterUrlByFileUri);
    }
  }

  return render(document, { encodeEntities: 'utf8' });
}

async function importCoverImage(
  storyId: number,
  coverImageSourceUri: string | null,
  assetCache: Map<string, string>,
) {
  if (!coverImageSourceUri) {
    return null;
  }

  const assetRoot = getEpubAssetDirectory(storyId);
  ensureDirectory(assetRoot);
  return await persistAssetUri(coverImageSourceUri, assetRoot, assetCache);
}

export async function ensureEpubStoryForJob(
  job: EpubImportJobRecord,
  parsed: ParsedEpubPackage,
): Promise<OfflineStoryRecord> {
  if (job.storyId) {
    const existingStory = await getOfflineStoryById(job.storyId);
    if (existingStory) {
      return existingStory;
    }
  }

  const story = await upsertOfflineStory({
    name: parsed.title,
    sourceType: 'epub',
    author: parsed.author,
    sourceFileName: job.fileName,
  });
  await updateEpubImportJob(job.id, { storyId: story.id });
  return story;
}

export async function importEpubChaptersFromWorkspace(
  job: EpubImportJobRecord,
  parsed: ParsedEpubPackage,
): Promise<{
  job: EpubImportJobRecord;
  story: OfflineStoryRecord;
  chapters: OfflineChapterRecord[];
}> {
  const story = await ensureEpubStoryForJob(job, parsed);
  const assetRoot = getEpubAssetDirectory(story.id);
  ensureDirectory(assetRoot);
  const assetCache = new Map<string, string>();
  const { chapterUrlByFileUri } = buildChapterIndexMap(story.id, parsed.chapterDescriptors);
  const coverImageUri = await importCoverImage(story.id, parsed.coverImageSourceUri, assetCache);

  const refreshedStory = await upsertOfflineStory({
    id: story.id,
    name: parsed.title,
    sourceType: 'epub',
    author: parsed.author,
    coverImageUri,
    sourceFileName: job.fileName,
    assetRootUri: assetRoot.uri,
  });

  let nextJob =
    (await updateEpubImportJob(job.id, {
      storyId: refreshedStory.id,
      totalChapters: parsed.chapterDescriptors.length,
      status: 'importing',
      errorMessage: null,
    })) ?? job;
  const importedChapters: OfflineChapterRecord[] = [];
  const startIndex = Math.max(0, (nextJob.checkpointChapterIndex ?? -1) + 1);

  for (let index = startIndex; index < parsed.chapterDescriptors.length; index += 1) {
    const descriptor = parsed.chapterDescriptors[index];
    const chapterFile = new File(descriptor.sourceUri);
    if (!chapterFile.exists) {
      throw new Error(`EPUB chapter is missing: ${descriptor.label}`);
    }

    const originalHtml = await rewriteChapterHtml(
      chapterFile.textSync(),
      descriptor.sourceUri,
      assetRoot,
      chapterUrlByFileUri,
      assetCache,
    );

    const chapter = await saveOfflineChapter({
      storyId: refreshedStory.id,
      chapterName: descriptor.label,
      chapterUrl: descriptor.chapterUrl,
      chapterOrder: descriptor.order,
      originalHtml,
      convertedHvHtml: '',
      downloadStatus: 'downloaded',
      downloadError: null,
      downloadedAt: new Date().toISOString(),
    });
    importedChapters.push(chapter);

    nextJob =
      (await updateEpubImportJob(job.id, {
        storyId: refreshedStory.id,
        totalChapters: parsed.chapterDescriptors.length,
        importedChapters: index + 1,
        checkpointChapterIndex: index,
        status: 'importing',
        errorMessage: null,
      })) ?? nextJob;

    await yieldToApp();
  }

  nextJob =
    (await updateEpubImportJob(job.id, {
      storyId: refreshedStory.id,
      totalChapters: parsed.chapterDescriptors.length,
      importedChapters: parsed.chapterDescriptors.length,
      checkpointChapterIndex: parsed.chapterDescriptors.length - 1,
      status: 'completed',
      errorMessage: null,
    })) ?? nextJob;

  return {
    job: nextJob,
    story: refreshedStory,
    chapters: importedChapters,
  };
}
