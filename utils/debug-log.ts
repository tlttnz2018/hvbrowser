/* eslint-disable no-console */

export function logReaderDebug(event: string, details?: Record<string, unknown>) {
  if (!__DEV__) {
    return;
  }

  const timestamp = new Date().toISOString();
  if (details) {
    console.log(`[HVDEBUG] ${timestamp} ${event}`, details);
    return;
  }

  console.log(`[HVDEBUG] ${timestamp} ${event}`);
}

export function getDebugLength(value: string | null | undefined) {
  return value?.length ?? 0;
}

export function getDebugCount(value: Record<string, unknown> | null | undefined) {
  return value ? Object.keys(value).length : 0;
}

export function getDebugDuration(startedAt: number) {
  return Math.round(Date.now() - startedAt);
}
