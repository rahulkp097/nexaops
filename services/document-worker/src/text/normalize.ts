// Strips ASCII control characters (keeping \n and \t, handled separately
// below) that sometimes leak into extracted PDF/DOCX text.
function stripControlChars(text: string): string {
  let result = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f && ch !== '\n' && ch !== '\t';
    if (!isControl) {
      result += ch;
    }
  }
  return result;
}

export function normalizeText(text: string): string {
  return stripControlChars(text.replace(/\r\n?/g, '\n'))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
