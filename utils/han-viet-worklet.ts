import { getDebugCount, getDebugDuration, getDebugLength, logReaderDebug } from './debug-log';
import { convertTextToHanViet } from './han-viet-converter';
import { scheduleReaderWorkletTask } from './reader-worklet-runtime';
import { convertHtmlPageToHvWorklet } from './reader-worklet-tasks';

const CONVERSION_WORKLET_TIMEOUT_MS = 12000;

export function convertHtmlPageToHVInBackground(
  htmlContent: string,
  dictionary: Record<string, string>,
): Promise<string> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    logReaderDebug('conversion.start', {
      htmlLength: getDebugLength(htmlContent),
      dictionarySize: getDebugCount(dictionary),
    });

    const finish = (result: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      logReaderDebug('conversion.finish', {
        outputLength: getDebugLength(result),
        durationMs: getDebugDuration(startedAt),
      });
      resolve(result);
    };

    const fallback = (message?: string) => {
      if (settled) {
        return;
      }
      logReaderDebug('conversion.fallback', {
        message: message ?? 'schedule returned false',
        durationMs: getDebugDuration(startedAt),
      });
      if (__DEV__ && message) {
        console.warn('Han-Viet conversion Worklet fallback:', message);
      }
      finish(convertTextToHanViet(htmlContent, dictionary));
    };

    const scheduled = scheduleReaderWorkletTask(
      convertHtmlPageToHvWorklet,
      { htmlContent, dictionary },
      finish,
      fallback,
      'convert-html-to-hv',
    );

    if (!scheduled) {
      fallback();
      return;
    }

    fallbackTimer = setTimeout(
      () => fallback(`timed out after ${CONVERSION_WORKLET_TIMEOUT_MS}ms`),
      CONVERSION_WORKLET_TIMEOUT_MS,
    );
    logReaderDebug('conversion.scheduled', {
      timeoutMs: CONVERSION_WORKLET_TIMEOUT_MS,
      durationMs: getDebugDuration(startedAt),
    });
  });
}
