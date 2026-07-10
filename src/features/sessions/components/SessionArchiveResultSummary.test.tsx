// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionArchiveResultSummary } from "./SessionArchiveResultSummary";

afterEach(cleanup);

describe("SessionArchiveResultSummary", () => {
  it("shows partial failures and dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <SessionArchiveResultSummary
        result={{
          results: [
            { sourceId: "source-a", threadId: "thread-a", success: true, archivedAt: 1, error: null },
            { sourceId: "source-a", threadId: "thread-b", success: false, archivedAt: null, error: "upstream failed" },
          ],
          successCount: 1,
          failureCount: 1,
        }}
        sources={[{ id: "source-a", name: "Primary", codexHomePath: "C:/codex", enabled: true, isCurrent: true, isDefault: true, discoveredAt: 1, lastScanAt: null, status: "ready", error: null }]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/Primary · thread-b: upstream failed/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
