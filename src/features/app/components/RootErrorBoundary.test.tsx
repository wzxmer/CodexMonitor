/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootErrorBoundary } from "./RootErrorBoundary";

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  captureException: captureExceptionMock,
}));

function BrokenView(): ReactNode {
  throw new Error("render failed");
}

describe("RootErrorBoundary", () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "zh-CN",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a reload fallback and reports uncaught render errors", () => {
    render(
      <RootErrorBoundary>
        <BrokenView />
      </RootErrorBoundary>,
    );

    expect(screen.getByText("界面加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "render failed" }),
      expect.any(Object),
    );
  });
});
