// @ts-nocheck -- Node types are intentionally not enabled for the frontend project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global font styles", () => {
  it("uses the runtime UI font variable at the document root", () => {
    const themeCss = readFileSync(new URL("./themes.dark.css", import.meta.url), "utf8");
    expect(themeCss).toContain(":root {\n  font-family: var(--ui-font-family);");
  });

  it("uses the composed code font stack for terminal content", () => {
    const terminalCss = readFileSync(new URL("./terminal.css", import.meta.url), "utf8");
    expect(terminalCss).toContain("--terminal-font-family: var(--code-font-family);");
  });

  it("derives interface typography from the runtime UI font size", () => {
    const baseCss = readFileSync(new URL("./base.css", import.meta.url), "utf8");
    const typographyCss = readFileSync(
      new URL("./ui-typography.css", import.meta.url),
      "utf8",
    );
    expect(baseCss).toContain("--ui-font-size-sm:");
    expect(baseCss).toContain("--ui-font-size-control:");
    expect(typographyCss).toContain(".sidebar");
    expect(typographyCss).toContain(".settings-overlay");
    expect(typographyCss).toContain(".composer");
    expect(typographyCss).toContain(".file-tree-panel");
    expect(typographyCss).toContain(".terminal-header");
    expect(typographyCss).toContain(".diff-viewer");
    expect(typographyCss).toContain("font-size: var(--ui-font-size-md)");
  });
});
