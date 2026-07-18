import { Directory, File } from 'expo-file-system';
import { Alert, Platform } from 'react-native';

import {
  deleteEpubImportJob,
  deleteOfflineStory,
  getEpubImportJobById,
  getOfflineStoryById,
  listPendingEpubImportJobs,
  updateEpubImportJob,
} from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import {
  basenameFromUri,
  cleanupWorkspace,
  copyPickedEpubToWorkspace,
  getEpubSourceFile,
  getEpubUnzippedDirectory,
  getEpubWorkspaceDirectory,
  importEpubChaptersFromWorkspace,
  parseEpubPackage,
  unzipEpubToWorkspace,
} from './epub-import';

let epubImportLoopPromise: Promise<void> | null = null;

interface PickedDocumentAsset {
  uri: string;
  name?: string;
}

function isWorkspaceAvailable(jobId: number) {
  return getEpubUnzippedDirectory(jobId).exists;
}

async function runSingleEpubImport(jobId: number) {
  let job = await getEpubImportJobById(jobId);
  if (!job) {
    return;
  }
  const canResumeImportedWorkspace =
    ['importing', 'paused'].includes(job.status) &&
    (job.checkpointChapterIndex ?? -1) >= 0 &&
    isWorkspaceAvailable(job.id);

  useAppStore.getState().markEpubImportJobStarted(job.id);

  const existingSourceFile = getEpubSourceFile(job.id);
  const sourceFile =
    job.sourceFileUri && existingSourceFile.exists
      ? existingSourceFile
      : await copyPickedEpubToWorkspace(job);

  job =
    (await updateEpubImportJob(job.id, {
      status: 'extracting',
      sourceFileUri: sourceFile.uri,
      workspaceUri: getEpubWorkspaceDirectory(job.id).uri,
      errorMessage: null,
    })) ?? job;
  useAppStore.getState().markEpubImportJobProgress(job);

  const unzippedDirectory = getEpubUnzippedDirectory(job.id);
  if (!canResumeImportedWorkspace) {
    await unzipEpubToWorkspace(sourceFile, unzippedDirectory);
  }

  job =
    (await updateEpubImportJob(job.id, {
      status: 'parsing',
      workspaceUri: getEpubWorkspaceDirectory(job.id).uri,
      errorMessage: null,
    })) ?? job;
  useAppStore.getState().markEpubImportJobProgress(job);

  const parsed = await parseEpubPackage(unzippedDirectory);
  job =
    (await updateEpubImportJob(job.id, {
      totalChapters: parsed.chapterDescriptors.length,
      status: 'importing',
      errorMessage: null,
    })) ?? job;
  useAppStore.getState().markEpubImportJobProgress(job);

  const result = await importEpubChaptersFromWorkspace(job, parsed);
  await cleanupWorkspace(getEpubWorkspaceDirectory(job.id));

  const completedJob =
    (await updateEpubImportJob(result.job.id, {
      status: 'completed',
      sourceFileUri: null,
      workspaceUri: null,
      errorMessage: null,
    })) ?? result.job;

  useAppStore.getState().markEpubImportJobCompleted(completedJob);
  await useAppStore.getState().refreshOfflineLibrary();
}

async function runEpubImportQueue() {
  useAppStore.getState().setEpubImportQueueRunning(true);

  while (true) {
    const jobs = await listPendingEpubImportJobs();
    const nextJob = jobs[0];

    if (!nextJob) {
      useAppStore.getState().setEpubImportQueueRunning(false);
      return;
    }

    try {
      await runSingleEpubImport(nextJob.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'EPUB import failed.';
      const failedJob =
        (await updateEpubImportJob(nextJob.id, {
          status: 'failed',
          errorMessage: message,
        })) ?? null;

      if (failedJob) {
        useAppStore.getState().markEpubImportJobFailed(failedJob.id, message);
      } else {
        useAppStore.getState().markEpubImportJobFailed(nextJob.id, message);
      }
      useAppStore.getState().setEpubImportQueueRunning(false);
      Alert.alert('EPUB import failed', message);
      return;
    }
  }
}

export async function ensureEpubImportQueueRunning() {
  if (epubImportLoopPromise) {
    return epubImportLoopPromise;
  }

  epubImportLoopPromise = runEpubImportQueue().finally(() => {
    epubImportLoopPromise = null;
  });

  return epubImportLoopPromise;
}

async function pickEpubDocument(): Promise<PickedDocumentAsset | null> {
  try {
    const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/epub+zip',
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });

    return result.canceled ? null : result.assets[0];
  } catch {
    const pickedFile = await File.pickFileAsync(undefined, 'application/epub+zip');
    const file = Array.isArray(pickedFile) ? pickedFile[0] : pickedFile;
    return file ? { uri: file.uri } : null;
  }
}

export async function queueEpubImportFromPicker() {
  if (Platform.OS === 'web') {
    Alert.alert('Unsupported on web', 'EPUB import currently works on iOS and Android only.');
    return null;
  }
  const file = await pickEpubDocument();

  if (!file) {
    return null;
  }

  const job = await useAppStore.getState().enqueueEpubImportJob({
    fileName: file.name || basenameFromUri(file.uri) || 'book.epub',
    pickedFileUri: file.uri,
  });
  await ensureEpubImportQueueRunning();
  return job;
}

export async function retryEpubImportJob(id: number) {
  const nextJob =
    (await updateEpubImportJob(id, {
      status: 'queued',
      errorMessage: null,
    })) ?? null;
  if (nextJob) {
    useAppStore.getState().markEpubImportJobProgress(nextJob);
  }
  await ensureEpubImportQueueRunning();
}

export async function removeEpubImportJobWithArtifacts(id: number) {
  const job = await getEpubImportJobById(id);
  if (job?.workspaceUri) {
    await cleanupWorkspace(getEpubWorkspaceDirectory(id));
  }
  if (job?.storyId) {
    const story = await getOfflineStoryById(job.storyId);
    if (story?.assetRootUri) {
      const assetDirectory = new Directory(story.assetRootUri);
      if (assetDirectory.exists) {
        assetDirectory.delete();
      }
    }
    await deleteOfflineStory(job.storyId);
  }
  await deleteEpubImportJob(id);
  await useAppStore.getState().refreshOfflineLibrary();
}
