import { scheduleOnRN } from 'react-native-worklets';

import type { Theme } from '../theme';
import { convertTextToHanViet } from './han-viet-converter';
import {
  buildReaderSearchIndexes,
  findReaderSegmentSearchMatches,
  type ReaderSearchCollection,
  type ReaderSearchPreparedIndexes,
} from './reader-search';
import {
  buildPresentationHtmlWithChineseDefinitions,
  buildPresentationHtmlWithHvDefinitions,
  type ReaderDefinitionSegment,
  type ReaderHtmlWithDefinitionSegments,
} from './webview-html';

function getWorkletErrorMessage(error: unknown) {
  'worklet';

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

export interface ReaderHtmlSourceWorkletInput {
  mode: 'han-viet' | 'chinese';
  htmlOrig: string;
  fontSize: number;
  dictionary: Record<string, string>;
  readerTheme: Theme['reader'];
  safeAreaBottom: number;
}

export function buildReaderHtmlSourceWorklet(
  input: ReaderHtmlSourceWorkletInput,
  onSuccess: (result: ReaderHtmlWithDefinitionSegments) => void,
  onError: (message: string) => void,
) {
  'worklet';

  try {
    const result =
      input.mode === 'han-viet'
        ? buildPresentationHtmlWithHvDefinitions(
            input.htmlOrig,
            input.fontSize,
            input.dictionary,
            input.readerTheme,
            input.safeAreaBottom,
          )
        : buildPresentationHtmlWithChineseDefinitions(
            input.htmlOrig,
            input.fontSize,
            input.dictionary,
            input.readerTheme,
            input.safeAreaBottom,
          );
    scheduleOnRN(onSuccess, result);
  } catch (error) {
    scheduleOnRN(onError, getWorkletErrorMessage(error));
  }
}

export function buildReaderSearchIndexesWorklet(
  input: {
    segments: Record<number, ReaderDefinitionSegment>;
    dictionary: Record<string, string>;
  },
  onSuccess: (result: ReaderSearchPreparedIndexes) => void,
  onError: (message: string) => void,
) {
  'worklet';

  try {
    scheduleOnRN(onSuccess, buildReaderSearchIndexes(input.segments, input.dictionary));
  } catch (error) {
    scheduleOnRN(onError, getWorkletErrorMessage(error));
  }
}

export function findReaderSegmentSearchMatchesWorklet(
  input: {
    segments: Record<number, ReaderDefinitionSegment>;
    indexes: ReaderSearchPreparedIndexes;
    rawQuery: string;
    requestId: number;
    maxResults?: number;
  },
  onSuccess: (result: ReaderSearchCollection) => void,
  onError: (message: string) => void,
) {
  'worklet';

  try {
    scheduleOnRN(onSuccess, findReaderSegmentSearchMatches(input));
  } catch (error) {
    scheduleOnRN(onError, getWorkletErrorMessage(error));
  }
}

export function findReaderSegmentSearchMatchesWithIndexesWorklet(
  input: {
    segments: Record<number, ReaderDefinitionSegment>;
    dictionary: Record<string, string>;
    rawQuery: string;
    requestId: number;
    maxResults?: number;
  },
  onSuccess: (result: ReaderSearchCollection) => void,
  onError: (message: string) => void,
) {
  'worklet';

  try {
    const indexes = buildReaderSearchIndexes(input.segments, input.dictionary);
    scheduleOnRN(
      onSuccess,
      findReaderSegmentSearchMatches({
        segments: input.segments,
        indexes,
        rawQuery: input.rawQuery,
        requestId: input.requestId,
        maxResults: input.maxResults,
      }),
    );
  } catch (error) {
    scheduleOnRN(onError, getWorkletErrorMessage(error));
  }
}

export function convertHtmlPageToHvWorklet(
  input: {
    htmlContent: string;
    dictionary: Record<string, string>;
  },
  onSuccess: (result: string) => void,
  onError: (message: string) => void,
) {
  'worklet';

  try {
    scheduleOnRN(onSuccess, convertTextToHanViet(input.htmlContent, input.dictionary));
  } catch (error) {
    scheduleOnRN(onError, getWorkletErrorMessage(error));
  }
}
