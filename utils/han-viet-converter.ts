export function convertTextToHanViet(text: string, dictionary: Record<string, string>): string {
  'worklet';

  const converts: string[] = [];
  for (let idx = 0; idx < text.length; idx += 1) {
    const ch = text[idx];
    const hvWord = dictionary[ch];
    converts.push(hvWord ? `${hvWord} ` : ch);
  }
  return converts.join('');
}
