// @ts-nocheck -- Node types are intentionally not enabled for the frontend project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("main topbar layout styles", () => {
  const mainCss = readFileSync(new URL("./main.css", import.meta.url), "utf8");

  it("reserves Windows caption controls in every compact layout", () => {
    const compactTopbarRule = mainCss.match(
      /\.app\.layout-compact \.main-topbar\s*\{([\s\S]*?)\n\}/,
    );

    expect(compactTopbarRule?.[1]).toContain("--window-caption-width");
    expect(compactTopbarRule?.[1]).toContain("--window-caption-gap");
    expect(mainCss).not.toContain(
      ".app.layout-compact.right-panel-collapsed .main-topbar",
    );
  });
});
