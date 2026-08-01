import { Platform } from 'react-native';
import {
  createWorkletRuntime,
  runOnRuntime,
  type WorkletFunction,
  type WorkletRuntime,
} from 'react-native-worklets';

import { logReaderDebug } from './debug-log';

let readerRuntime: WorkletRuntime | null | undefined;
let hasLoggedRuntimeError = false;

function warnReaderWorkletRuntime(error: unknown) {
  if (!__DEV__ || hasLoggedRuntimeError) {
    return;
  }

  hasLoggedRuntimeError = true;
  logReaderDebug('worklet.runtime.unavailable', {
    platform: Platform.OS,
    error: error instanceof Error ? error.message : String(error),
  });
  console.warn('Reader Worklet runtime is unavailable; using React Native thread fallback.', error);
}

export function getReaderWorkletRuntime(): WorkletRuntime | null {
  if (Platform.OS === 'web') {
    logReaderDebug('worklet.runtime.skip-web');
    return null;
  }

  if (readerRuntime !== undefined) {
    logReaderDebug('worklet.runtime.cached', { available: !!readerRuntime });
    return readerRuntime;
  }

  try {
    logReaderDebug('worklet.runtime.create.start', { platform: Platform.OS });
    readerRuntime = createWorkletRuntime({
      name: 'hvbrowser-reader',
      initializer: () => {
        'worklet';
      },
    });
    logReaderDebug('worklet.runtime.create.success');
  } catch (error) {
    readerRuntime = null;
    warnReaderWorkletRuntime(error);
  }

  return readerRuntime;
}

export function warmReaderWorkletRuntime(): boolean {
  const runtime = getReaderWorkletRuntime();

  if (!runtime) {
    logReaderDebug('worklet.runtime.warm.skip-no-runtime');
    return false;
  }

  try {
    logReaderDebug('worklet.runtime.warm.dispatch');
    runOnRuntime(runtime, () => {
      'worklet';
    })();
    logReaderDebug('worklet.runtime.warm.dispatched');
    return true;
  } catch (error) {
    readerRuntime = null;
    warnReaderWorkletRuntime(error);
    return false;
  }
}

export function scheduleReaderWorkletTask<Input, Result>(
  task: (
    input: Input,
    onSuccess: (result: Result) => void,
    onError: (message: string) => void,
  ) => void,
  input: Input,
  onSuccess: (result: Result) => void,
  onError: (message: string) => void,
  label = task.name || 'anonymous',
): boolean {
  const runtime = getReaderWorkletRuntime();

  if (!runtime) {
    logReaderDebug('worklet.task.skip-no-runtime', { label });
    return false;
  }

  try {
    logReaderDebug('worklet.task.dispatch', { label });
    const scheduledTask = (workletInput: Input) => {
      'worklet';
      task(workletInput, onSuccess, onError);
    };

    runOnRuntime(runtime, scheduledTask as WorkletFunction<[Input], void>)(input);
    logReaderDebug('worklet.task.dispatched', { label });
    return true;
  } catch (error) {
    readerRuntime = null;
    warnReaderWorkletRuntime(error);
    logReaderDebug('worklet.task.dispatch-error', {
      label,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
