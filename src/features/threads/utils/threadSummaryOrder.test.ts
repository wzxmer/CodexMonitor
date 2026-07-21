import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "@/types";
import {
  getThreadSummarySortTimestamp,
  insertThreadSummaryBySort,
} from "./threadSummaryOrder";

describe("threadSummaryOrder", () => {
  it("keeps existing relative order when inserting an equal timestamp", () => {
    const threads: ThreadSummary[] = [
      { id: "equal-a", name: "Equal A", updatedAt: 100 },
      { id: "equal-b", name: "Equal B", updatedAt: 100 },
      { id: "older", name: "Older", updatedAt: 50 },
    ];

    insertThreadSummaryBySort(
      threads,
      { id: "equal-new", name: "Equal new", updatedAt: 100 },
      "updated_at",
    );

    expect(threads.map((thread) => thread.id)).toEqual([
      "equal-a",
      "equal-b",
      "equal-new",
      "older",
    ]);
  });

  it("falls back to the alternate timestamp and then zero", () => {
    expect(
      getThreadSummarySortTimestamp(
        { id: "updated-only", name: "Updated only", updatedAt: 200 },
        "created_at",
      ),
    ).toBe(200);
    expect(
      getThreadSummarySortTimestamp(
        { id: "created-only", name: "Created only", createdAt: 150 } as ThreadSummary,
        "updated_at",
      ),
    ).toBe(150);
    expect(
      getThreadSummarySortTimestamp(
        { id: "missing", name: "Missing" } as ThreadSummary,
        "updated_at",
      ),
    ).toBe(0);
  });
});
