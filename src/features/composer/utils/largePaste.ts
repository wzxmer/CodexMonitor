export const LARGE_PASTE_CHARACTER_THRESHOLD = 12_000;
export const LARGE_PASTE_LINE_THRESHOLD = 200;
export const LARGE_PASTE_MAX_UTF8_BYTES = 1024 * 1024;

export type LargePasteAnalysis = {
  characterCount: number;
  lineCount: number;
  utf8Bytes: number;
  shouldAttach: boolean;
  exceedsMaximum: boolean;
};

export function normalizeLargePasteText(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

export function analyzeLargePaste(value: string): LargePasteAnalysis {
  const normalized = normalizeLargePasteText(value);
  const characterCount = Array.from(normalized).length;
  const lineCount = normalized ? normalized.split("\n").length : 0;
  const utf8Bytes = new TextEncoder().encode(normalized).byteLength;
  return {
    characterCount,
    lineCount,
    utf8Bytes,
    shouldAttach:
      characterCount >= LARGE_PASTE_CHARACTER_THRESHOLD ||
      lineCount >= LARGE_PASTE_LINE_THRESHOLD,
    exceedsMaximum: utf8Bytes > LARGE_PASTE_MAX_UTF8_BYTES,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function createPastedTextAttachment(
  value: string,
  now = new Date(),
) {
  const normalized = normalizeLargePasteText(value);
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    "-",
    String(now.getMilliseconds()).padStart(3, "0"),
  ].join("");
  const fileName = `pasted-text-${timestamp}.txt`;
  const encodedName = encodeURIComponent(fileName);
  const bytes = new TextEncoder().encode(normalized);
  return `data:text/plain;charset=utf-8;name="${encodedName}";base64,${bytesToBase64(bytes)}`;
}