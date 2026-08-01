import { Platform } from 'react-native';
import {
  createWorkletRuntime,
  runOnRuntime,
  type WorkletFunction,
  type WorkletRuntime,
} from 'react-native-worklets';

let readerRuntime: WorkletRuntime | null | undefined;
let hasLoggedRuntimeError = false;

function warnReaderWorkletRuntime(error: unknown) {
  if (!__DEV__ || hasLoggedRuntimeError) {
    return;
  }

  hasLoggedRuntimeError = true;
  console.warn('Reader Worklet runtime is unavailable; using React Native thread fallback.', error);
}

export function getReaderWorkletRuntime(): WorkletRuntime | null {
  if (Platform.OS === 'web') {
    return null;
  }

  if (readerRuntime !== undefined) {
    return readerRuntime;
  }

  try {
    readerRuntime = createWorkletRuntime({
      name: 'hvbrowser-reader',
      initializer: () => {
        'worklet';
      },
    });
  } catch (error) {
    readerRuntime = null;
    warnReaderWorkletRuntime(error);
  }

  return readerRuntime;
}

export function warmReaderWorkletRuntime(): boolean {
  const runtime = getReaderWorkletRuntime();

  if (!runtime) {
    return false;
  }

  try {
    runOnRuntime(runtime, () => {
      'worklet';
    })();
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
): boolean {
  const runtime = getReaderWorkletRuntime();

  if (!runtime) {
    return false;
  }

  try {
    runOnRuntime(
      runtime,
      task as WorkletFunction<[Input, (result: Result) => void, (message: string) => void], void>,
    )(input, onSuccess, onError);
    return true;
  } catch (error) {
    readerRuntime = null;
    warnReaderWorkletRuntime(error);
    onError(error instanceof Error ? error.message : String(error));
    return false;
  }
}
