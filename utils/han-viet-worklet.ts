import { convertTextToHanViet } from './han-viet-converter';
import { scheduleReaderWorkletTask } from './reader-worklet-runtime';
import { convertHtmlPageToHvWorklet } from './reader-worklet-tasks';

const CONVERSION_WORKLET_TIMEOUT_MS = 12000;

export function convertHtmlPageToHVInBackground(
  htmlContent: string,
  dictionary: Record<string, string>,
): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      resolve(result);
    };

    const fallback = (message?: string) => {
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
    );

    if (!scheduled) {
      fallback();
      return;
    }

    fallbackTimer = setTimeout(
      () => fallback(`timed out after ${CONVERSION_WORKLET_TIMEOUT_MS}ms`),
      CONVERSION_WORKLET_TIMEOUT_MS,
    );
  });
}
