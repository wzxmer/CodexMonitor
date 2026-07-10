// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import type { ManagedSession } from "@/types";
import { SessionPermanentDeletePrompt } from "./SessionPermanentDeletePrompt";

afterEach(cleanup);

const session: ManagedSession = { key: "source-a:thread-a", sourceId: "source-a", threadId: "thread-a", sourceKind: null, cwd: null, title: "Archived", preview: null, createdAt: null, updatedAt: null, archivedAt: 1, isArchived: true, parentThreadId: null, isSubagent: false, subagentNickname: null, subagentRole: null, projectExists: false, fileStatus: "mapped", fileConfidence: "exact" };

describe("SessionPermanentDeletePrompt", () => {
  it("requires irreversible acknowledgement and defaults cascade off", () => {
    const onConfirm = vi.fn();
    render(<I18nProvider preference="system"><SessionPermanentDeletePrompt session={session} childCount={2} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} /></I18nProvider>);
    const confirm = screen.getByRole("button", { name: "Delete permanently" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I understand this action cannot be undone"));
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});
