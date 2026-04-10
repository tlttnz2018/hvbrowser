declare module 'encoding-japanese' {
  type EncodingName = 'UTF8' | 'UTF16' | 'UTF16BE' | 'UTF16LE' | 'UNICODE' | 'SJIS' | 'EUCJP' | 'JIS' | 'ASCII' | 'BINARY' | 'BINARY' | string;

  export function detect(data: Uint8Array | number[] | string, encodings?: EncodingName | EncodingName[]): EncodingName | false;
  export function convert(data: Uint8Array | number[], to: EncodingName, from?: EncodingName): Uint8Array;

  const encoding: {
    detect: typeof detect;
    convert: typeof convert;
  };
  export default encoding;
}
