import { OfflineChapterRecord, OfflineStoryRecord } from '../db/offline';

export type OfflinePageRole = 'home page' | 'index page' | 'chapter page' | 'unknown';

export interface ResolvedOfflinePageRole {
  role: OfflinePageRole;
  story: OfflineStoryRecord | null;
  chapter: OfflineChapterRecord | null;
  inferred: boolean;
}

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getCandidateOrigins(
  story: OfflineStoryRecord,
  chapters: OfflineChapterRecord[],
): string[] {
  const originSet = new Set<string>();

  for (const value of [
    story.homePageUrl,
    story.indexPageUrl,
    ...chapters.map((chapter) => chapter.chapterUrl),
  ]) {
    if (!value) {
      continue;
    }

    const origin = getOrigin(value);
    if (origin) {
      originSet.add(origin);
    }
  }

  return [...originSet];
}

export function resolveMostLikelyStoryForUrl(
  currentUrl: string,
  stories: OfflineStoryRecord[],
  chapters: OfflineChapterRecord[],
): OfflineStoryRecord | null {
  const exactStory =
    stories.find(
      (story) => story.homePageUrl === currentUrl || story.indexPageUrl === currentUrl,
    ) ||
    (() => {
      const chapter = chapters.find((item) => item.chapterUrl === currentUrl);
      return chapter ? (stories.find((story) => story.id === chapter.storyId) ?? null) : null;
    })();

  if (exactStory) {
    return exactStory;
  }

  const currentOrigin = getOrigin(currentUrl);
  if (!currentOrigin) {
    return null;
  }

  const storyByOrigin = stories.filter((story) => {
    const storyChapters = chapters.filter((chapter) => chapter.storyId === story.id);
    return getCandidateOrigins(story, storyChapters).includes(currentOrigin);
  });

  return storyByOrigin.length === 1 ? storyByOrigin[0] : null;
}

export function resolveOfflinePageRole(
  currentUrl: string,
  stories: OfflineStoryRecord[],
  chapters: OfflineChapterRecord[],
): ResolvedOfflinePageRole {
  const exactChapter = chapters.find((chapter) => chapter.chapterUrl === currentUrl) ?? null;
  if (exactChapter) {
    return {
      role: 'chapter page',
      story: stories.find((story) => story.id === exactChapter.storyId) ?? null,
      chapter: exactChapter,
      inferred: false,
    };
  }

  const exactIndexStory = stories.find((story) => story.indexPageUrl === currentUrl) ?? null;
  if (exactIndexStory) {
    return {
      role: 'index page',
      story: exactIndexStory,
      chapter: null,
      inferred: false,
    };
  }

  const exactHomeStory = stories.find((story) => story.homePageUrl === currentUrl) ?? null;
  if (exactHomeStory) {
    return {
      role: 'home page',
      story: exactHomeStory,
      chapter: null,
      inferred: false,
    };
  }

  const likelyStory = resolveMostLikelyStoryForUrl(currentUrl, stories, chapters);
  if (likelyStory) {
    return {
      role: 'chapter page',
      story: likelyStory,
      chapter: null,
      inferred: true,
    };
  }

  return {
    role: 'unknown',
    story: null,
    chapter: null,
    inferred: false,
  };
}
