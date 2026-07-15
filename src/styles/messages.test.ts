// @ts-nocheck -- Node types are intentionally not enabled for the frontend project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("message tool group interaction styles", () => {
  const buttonsCss = readFileSync(new URL("./buttons.css", import.meta.url), "utf8");
  const messagesCss = readFileSync(new URL("./messages.css", import.meta.url), "utf8");
  const messagesSource = readFileSync(
    new URL("../features/messages/components/Messages.tsx", import.meta.url),
    "utf8",
  );

  it("lets composite buttons opt out of global hover and active elevation", () => {
    expect(buttonsCss).toContain(
      'button:not(:where([data-button-elevation="none"])):hover:not(:disabled)',
    );
    expect(buttonsCss).toContain(
      'button:not(:where([data-button-elevation="none"])):active:not(:disabled)',
    );
    expect(buttonsCss).not.toContain('button:not([data-button-elevation="none"])');
    expect(buttonsCss).not.toMatch(/^button:hover:not\(:disabled\)\s*\{/m);
    expect(buttonsCss).not.toMatch(/^button:active:not\(:disabled\)\s*\{/m);
  });

  it("marks every tool group toggle as a non-elevated composite control", () => {
    expect(messagesSource.match(/className="tool-group-toggle"/g)).toHaveLength(2);
    expect(
      messagesSource.match(
        /className="tool-group-toggle"\s+data-button-elevation="none"/g,
      ),
    ).toHaveLength(2);
  });

  it("does not reintroduce local elevation resets in message styles", () => {
    expect(messagesCss).not.toMatch(
      /\.tool-group-toggle:(?:hover|active)[^{]*\{[^}]*(?:transform|box-shadow)/s,
    );
  });
});
