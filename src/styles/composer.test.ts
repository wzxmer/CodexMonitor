// @ts-nocheck -- Node types are intentionally not enabled for the frontend project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("composer select interaction styles", () => {
  const composerCss = readFileSync(new URL("./composer.css", import.meta.url), "utf8");

  it("uses a single background-only hover state on select pills", () => {
    const hoverRule = composerCss.match(
      /\.composer-select-wrap:has\(\.composer-select-trigger:hover:not\(:disabled\)\)\s*\{([\s\S]*?)\n\}/,
    );

    expect(hoverRule).not.toBeNull();
    expect(hoverRule?.[1]).toContain("background:");
    expect(hoverRule?.[1]).not.toContain("transform:");
    expect(hoverRule?.[1]).not.toContain("box-shadow:");
  });

  it("prevents inner triggers and the refresh action from inheriting elevation", () => {
    expect(composerCss).toContain(".composer-select-trigger:hover:not(:disabled)");
    expect(composerCss).toContain(".composer-select-trigger:active:not(:disabled)");
    expect(composerCss).toContain(".composer-model-refresh:active:not(:disabled)");

    const elevationOverrides = composerCss.match(/transform: none;\s*box-shadow: none;/g);
    expect(elevationOverrides?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the model caret clear of refresh and fast controls", () => {
    expect(composerCss).toContain(
      ".composer-select-wrap--model:has(.composer-model-refresh):not(:has(.composer-fast-indicator))::after",
    );
    expect(composerCss).toContain(
      ".composer-select-wrap--model:has(.composer-model-refresh):has(.composer-fast-indicator)::after",
    );
  });
});
