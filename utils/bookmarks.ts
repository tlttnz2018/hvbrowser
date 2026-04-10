const TITLE_LENGTH = 150;

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

export function getBookmarkImage(url: string): string | null {
  const piaotiaMatch = url.match(/^https?:\/\/(?:www\.)?piaotia\.com\/bookinfo\/(\d+)\/(\d+)\.html$/i);

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
