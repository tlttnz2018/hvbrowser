const TITLE_LENGTH = 150;
const DESCRIPTION_LENGTH = 150;
const TRACKING_QUERY_PREFIXES = ['utm_', 'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'spm'];

export function truncateBookmarkTitle(title: string): string {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return '';
  }

  if (normalizedTitle.length <= TITLE_LENGTH) {
    return normalizedTitle;
  }

  return `${normalizedTitle.slice(0, TITLE_LENGTH).trimEnd()}...`;
}

export function truncateBookmarkDescription(description: string): string {
  const normalizedDescription = description.trim();

  if (!normalizedDescription) {
    return '';
  }

  if (normalizedDescription.length <= DESCRIPTION_LENGTH) {
    return normalizedDescription;
  }

  return `${normalizedDescription.slice(0, DESCRIPTION_LENGTH).trimEnd()}...`;
}

export function sanitizeBookmarkUrl(input: string): string {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    return '';
  }

  try {
    const parsed = new URL(normalizedInput);
    const paramsToDelete: string[] = [];

    parsed.searchParams.forEach((_, key) => {
      if (
        TRACKING_QUERY_PREFIXES.some(
          (prefix) => key.toLowerCase() === prefix || key.toLowerCase().startsWith(prefix),
        )
      ) {
        paramsToDelete.push(key);
      }
    });

    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }

    if (!parsed.search) {
      parsed.search = '';
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return normalizedInput;
  }
}

export function urlsMatchForBookmark(candidateUrl: string, currentUrl: string): boolean {
  return sanitizeBookmarkUrl(candidateUrl) === sanitizeBookmarkUrl(currentUrl);
}

export function getBookmarkImage(url: string): string | null {
  const piaotiaMatch = url.match(
    /^https?:\/\/(?:www\.)?piaotia\.com\/bookinfo\/(\d+)\/(\d+)\.html$/i,
  );

  if (piaotiaMatch) {
    const [, categoryId, bookId] = piaotiaMatch;
    return `https://www.piaotia.com/files/article/image/${categoryId}/${bookId}/${bookId}s.jpg`;
  }

  return null;
}

export function getBookmarkFavicon(url: string): string | null {
  try {
    const bookmarkUrl = new URL(url);
    return `${bookmarkUrl.origin}/favicon.ico`;
  } catch {
    return null;
  }
}
