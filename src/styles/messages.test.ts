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

  it("keeps reading controls in document flow so they cannot cover messages", () => {
    const controlsRule = messagesCss.match(
      /\.messages-tool-controls\s*\{([\s\S]*?)\n\}/,
    );

    expect(controlsRule?.[1]).not.toMatch(/position:\s*(?:sticky|fixed|absolute)/);
    expect(controlsRule?.[1]).not.toMatch(/\btop:/);
  });

  it("keeps horizontal scrolling inside wide content instead of the conversation pane", () => {
    const messagesRule = messagesCss.match(/\.messages\s*\{([\s\S]*?)\n\}/);

    expect(messagesRule?.[1]).toContain("overflow-y: auto");
    expect(messagesRule?.[1]).toContain("overflow-x: hidden");
    expect(messagesCss).toMatch(
      /\.markdown-table-wrap\s*\{[^}]*overflow-x:\s*auto;/s,
    );
  });

  it("anchors child result details to the chat layer and above the composer", () => {
    const drawerRule = messagesCss.match(
      /\.subagent-result-drawer\s*\{([\s\S]*?)\n\}/,
    );

    expect(drawerRule?.[1]).toContain("position: absolute");
    expect(drawerRule?.[1]).toContain("right: 12px");
    expect(drawerRule?.[1]).toContain("calc(100% - 24px)");
    expect(drawerRule?.[1]).not.toContain("100vw");
    expect(drawerRule?.[1]).toContain("--composer-overlay-height");
  });

  it("uses conversation canvas colors for the unframed child result heading", () => {
    const headerRule = messagesCss.match(
      /\.subagent-results-header\s*\{([\s\S]*?)\n\}/,
    );
    const headingRule = messagesCss.match(
      /\.subagent-results-heading\s*\{([\s\S]*?)\n\}/,
    );

    expect(headerRule?.[1]).toContain("color: var(--conversation-assistant-text)");
    expect(headingRule?.[1]).toContain("color: inherit");
  });

  it("keeps checkpoint text paired with the runtime conversation canvas", () => {
    const checkpointRule = messagesCss.match(
      /\.subagent-checkpoint-inline\s*\{([\s\S]*?)\n\}/,
    );
    const checkpointLabelRule = messagesCss.match(
      /\.subagent-checkpoint-inline \.tool-inline-label\s*\{([\s\S]*?)\n\}/,
    );
    const checkpointDetailRule = messagesCss.match(
      /\.subagent-checkpoint-inline \.tool-inline-detail\s*\{([\s\S]*?)\n\}/,
    );

    expect(checkpointRule?.[1]).toContain(
      "color: var(--conversation-assistant-text)",
    );
    expect(checkpointLabelRule?.[1]).toContain(
      "var(--conversation-assistant-text)",
    );
    expect(checkpointDetailRule?.[1]).toContain(
      "color: var(--conversation-assistant-text)",
    );
  });
});

describe("markdown table layout styles", () => {
  const messagesCss = readFileSync(new URL("./messages.css", import.meta.url), "utf8");

  it("keeps generic tables responsive and scopes fixed widths to review tables", () => {
    expect(messagesCss).toMatch(
      /\.markdown \.markdown-table\s*\{[^}]*min-width:\s*100%;[^}]*table-layout:\s*auto;/s,
    );
    expect(messagesCss).toMatch(
      /\.markdown \.markdown-table-structured-review\s*\{[^}]*min-width:\s*760px;[^}]*table-layout:\s*fixed;/s,
    );
    expect(messagesCss).not.toMatch(
      /\.message \.markdown \.markdown-table th:first-child/,
    );
    expect(messagesCss).toMatch(
      /\.markdown \.markdown-table \.markdown-table-cell-numeric\s*\{[^}]*text-align:\s*right;[^}]*font-variant-numeric:\s*tabular-nums;/s,
    );
    expect(messagesCss).toMatch(
      /\.markdown \.markdown-table \.markdown-table-cell-center\s*\{[^}]*text-align:\s*center;/s,
    );
  });
});
