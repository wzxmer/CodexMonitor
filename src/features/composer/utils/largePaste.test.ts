import { describe, expect, it } from "vitest";
import {
  LARGE_PASTE_CHARACTER_THRESHOLD,
  LARGE_PASTE_LINE_THRESHOLD,
  analyzeLargePaste,
  createPastedTextAttachment,
  normalizeLargePasteText,
} from "./largePaste";
import { attachmentNameFromDataUrl, decodeTextAttachmentDataUrl } from "@utils/attachments";

describe("largePaste", () => {
  it("normalizes CRLF and counts Unicode code points", () => {
    const result = analyzeLargePaste("你😀\r\n好");
    expect(normalizeLargePasteText("a\r\nb\rc")).toBe("a\nb\nc");
    expect(result.characterCount).toBe(4);
    expect(result.lineCount).toBe(2);
  });

  it("attaches at the character threshold", () => {
    expect(analyzeLargePaste("a".repeat(LARGE_PASTE_CHARACTER_THRESHOLD - 1)).shouldAttach).toBe(false);
    expect(analyzeLargePaste("a".repeat(LARGE_PASTE_CHARACTER_THRESHOLD)).shouldAttach).toBe(true);
  });

  it("attaches at the line threshold", () => {
    expect(analyzeLargePaste(Array(LARGE_PASTE_LINE_THRESHOLD).fill("x").join("\n")).shouldAttach).toBe(true);
  });

  it("creates a named UTF-8 text attachment that round-trips", () => {
    const attachment = createPastedTextAttachment("第一行\r\nsecond", new Date(2026, 6, 11, 9, 8, 7));
    expect(attachmentNameFromDataUrl(attachment)).toBe("pasted-text-20260711-090807-000.txt");
    expect(decodeTextAttachmentDataUrl(attachment)?.text).toBe("第一行\nsecond");
  });
});