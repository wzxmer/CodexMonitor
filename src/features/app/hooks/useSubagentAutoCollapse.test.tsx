// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSubagentAutoCollapse } from "./useSubagentAutoCollapse";

const rows = [
  { thread: { id: "parent" }, depth: 0, workspaceId: "ws-1" },
  { thread: { id: "child" }, depth: 1, workspaceId: "ws-1" },
];

describe("useSubagentAutoCollapse", () => {
  it("collapses completed sub-agent groups by default", () => {
    const { result } = renderHook(() => useSubagentAutoCollapse(rows, {}));

    expect(result.current.isCollapsed("ws-1", "parent")).toBe(true);
  });

  it("keeps groups expanded while a child is running", () => {
    const { result } = renderHook(() =>
      useSubagentAutoCollapse(rows, { child: { isProcessing: true } }),
    );

    expect(result.current.isCollapsed("ws-1", "parent")).toBe(false);
  });

  it("keeps manual expansion after the child completes", () => {
    const { result, rerender } = renderHook(
      ({ running }) =>
        useSubagentAutoCollapse(
          rows,
          running ? { child: { isProcessing: true } } : {},
        ),
      { initialProps: { running: false } },
    );

    act(() => {
      result.current.toggle("ws-1", "parent");
    });
    expect(result.current.isCollapsed("ws-1", "parent")).toBe(false);

    rerender({ running: true });
    rerender({ running: false });

    expect(result.current.isCollapsed("ws-1", "parent")).toBe(false);
  });
});
