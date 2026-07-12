import { describe, expect, it } from "vitest";
import {
  buildSmartReferencePrompt,
  buildContentReferencePrompt,
  defaultReferenceMode,
  estimateReferenceTokens,
  toMarkdownQuote,
} from "./messageReferences";

describe("messageReferences", () => {
  it("defaults short content to full and long content to smart", () => {
    expect(defaultReferenceMode("short text")).toBe("full");
    expect(defaultReferenceMode("x".repeat(8_000))).toBe("smart");
  });

  it("estimates multibyte content without treating it as free", () => {
    expect(estimateReferenceTokens("测试内容")).toBeGreaterThan(1);
  });

  it("formats full quotes and lightweight smart prompts", () => {
    expect(toMarkdownQuote("a\nb")).toBe("> a\n> b\n\n");
    const prompt = buildSmartReferencePrompt({
      referenceId: "ref-1",
      path: "C:/refs/ref-1.md",
      sourceTitle: "Source thread",
      sourceRole: "assistant",
      characterCount: 20_000,
      estimatedTokens: 5_000,
      instruction: "Continue the design.",
    });
    expect(prompt).toContain('id="ref-1"');
    expect(prompt).toContain("Read the referenced Markdown file only when");
    expect(prompt).not.toContain("x".repeat(1_000));
    expect(prompt).toContain("Continue the design.");
  });

  it("formats lightweight content references without inline content", () => {
    const prompt = buildContentReferencePrompt({
      referenceId: "ref-attachment",
      path: "C:/refs/ref-attachment/content.md",
      sourceKind: "log",
      sourceName: 'build".log',
      characterCount: 40_000,
      estimatedTokens: 10_000,
    });

    expect(prompt).toContain("<content_reference");
    expect(prompt).toContain('source_kind="log"');
    expect(prompt).toContain('source_name="build&quot;.log"');
    expect(prompt).not.toContain("x".repeat(1_000));
  });
});
