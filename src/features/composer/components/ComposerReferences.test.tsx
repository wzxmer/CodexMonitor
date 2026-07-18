// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import type { ComposerReference } from "@/types";
import { LONG_REFERENCE_CHARACTER_THRESHOLD } from "@/features/messages/utils/messageReferences";
import { ComposerReferences } from "./ComposerReferences";

const makeReference = (id: string, content: string, collapsed = false): ComposerReference => ({
  id,
  sourceTitle: id,
  sourceRole: "assistant",
  content,
  prompt: `> ${content}\n\n`,
  mode: "full",
  collapsed,
});

describe("ComposerReferences", () => {
  it("renders long references collapsed and exposes focused management controls", () => {
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    const onMove = vi.fn();
    render(
      <I18nProvider preference="zh">
        <ComposerReferences
          references={[makeReference("ref-1", "x".repeat(LONG_REFERENCE_CHARACTER_THRESHOLD), true)]}
          onToggle={onToggle}
          onRemove={onRemove}
          onMove={onMove}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText(/xxx/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ref-1/ }));
    expect(onToggle).toHaveBeenCalledWith("ref-1");
    fireEvent.click(screen.getByRole("button", { name: "移除引用" }));
    expect(onRemove).toHaveBeenCalledWith("ref-1");
  });

  it("moves one reference without changing rendered content", () => {
    const onMove = vi.fn();
    render(
      <I18nProvider preference="en">
        <ComposerReferences
          references={[makeReference("first", "alpha"), makeReference("second", "beta")]}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onMove={onMove}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Move reference down" })[0]);
    expect(onMove).toHaveBeenCalledWith(0, 1);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
  });
});
