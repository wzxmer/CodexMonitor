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

  it("allows light conversation presets to override only the input surface", () => {
    expect(composerCss).toContain(
      "background: var(--composer-input-background, var(--cm-surface-panel-elevated));",
    );
  });

  it("lets text attachments use the composer width and wrap controls when needed", () => {
    const textAttachmentRule = composerCss.match(
      /\.composer-attachment\.is-text-attachment\s*\{([\s\S]*?)\n\}/,
    );
    expect(textAttachmentRule?.[1]).toContain("width: min(100%, 720px)");
    expect(textAttachmentRule?.[1]).toContain("max-width: 100%");
    expect(composerCss).toContain(
      ".composer-attachment.is-text-attachment .composer-attachment-main",
    );
    expect(composerCss).toContain("flex-wrap: wrap");
    expect(composerCss).toContain(
      ".composer-attachment.is-text-attachment .composer-attachment-name",
    );
  });
});
