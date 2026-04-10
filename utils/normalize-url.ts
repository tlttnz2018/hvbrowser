function extractContextUrl(url: string): string {
  const pathArray = url.split('/');
  if (pathArray.length > 4) {
    pathArray.splice(-1, 1);
  }

  const protocol = pathArray.splice(0, 1);
  const contextUrl = protocol + '//' + pathArray.join('/');
  return contextUrl.replace('///', '//');
}

export function extractBaseUrl(url: string): string {
  const pathArray = url.split('/');
  const protocol = pathArray[0];
  return protocol + '//' + pathArray[2];
}

export function absolute(current: string, relative: string): string {
  if ('string' !== typeof relative || !relative) {
    return relative;
  } else if (relative.match(/^[a-z]+:\/\//i)) {
    return relative;
  } else if (relative.match(/^\/\//)) {
    const protocolMatch = current.match(/^([a-z]+:)/i);
    return (protocolMatch?.[1] || 'https:') + relative;
  } else if (relative.match(/^[a-z]+:/i)) {
    return relative;
  } else if (relative.match(/^(www\.|m\.|sj\.|wap\.)/)) {
    const protocolMatch = current.match(/^([a-z]+:)/i);
    return (protocolMatch?.[1] || 'https:') + '//' + relative;
  }

  const contextUrl = extractContextUrl(current);
  const rootUrl = extractBaseUrl(current);
  const base = relative.match(/^\//) ? rootUrl : contextUrl;

  const stack = base.split('/');

  let lastSegment = stack.pop()!;
  if (!lastSegment.match(/(html|aspx|htm|php)/)) {
    stack.push(lastSegment);
  }

  let parts = relative.split('/');
  if (relative.match(/^\//)) {
    parts.splice(0, 1);
  }

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '.') continue;
    if (parts[i] === '..') stack.pop();
    else stack.push(parts[i]);
  }

  return stack.join('/').replace('///', '//');
}

export function fixUrl(currentUrl: string, nextUrl: string): string {
  let url = nextUrl;
  if (!!currentUrl) {
    url = absolute(currentUrl, url);
  }
  return url;
}
