import { describe, expect, it } from "vitest";
import { formatLocalDateTime } from "./time";

describe("formatLocalDateTime", () => {
  it("formats a local timestamp to the minute", () => {
    const timestamp = new Date(2026, 6, 19, 9, 5, 7).getTime();

    expect(formatLocalDateTime(timestamp)).toBe("2026-07-19 09:05");
  });

  it("includes seconds for detail surfaces", () => {
    const timestamp = new Date(2026, 6, 19, 9, 5, 7).getTime();

    expect(formatLocalDateTime(timestamp, { includeSeconds: true })).toBe(
      "2026-07-19 09:05:07",
    );
  });

  it("rejects invalid timestamps", () => {
    expect(formatLocalDateTime(Number.NaN)).toBeNull();
  });
});
