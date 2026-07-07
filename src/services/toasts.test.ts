import { describe, expect, it, vi } from "vitest";
import { pushErrorToast, subscribeErrorToasts } from "./toasts";

describe("error toasts", () => {
  it("publishes error toasts to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorToasts(listener);

    const id = pushErrorToast({
      title: "Test error",
      message: "Something went wrong",
      durationMs: 1234,
    });

    expect(id).toMatch(/^error-toast-/);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        title: "Test error",
        message: "Something went wrong",
        durationMs: 1234,
      }),
    );

    unsubscribe();
  });

  it("suppresses missing git repository toasts", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorToasts(listener);

    const id = pushErrorToast({
      title: "Git error",
      message:
        "could not find repository at 'C:/Codex'; class=Repository (6); code=NotFound (-3)",
    });

    expect(id).toMatch(/^error-toast-/);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("suppresses libgit2 notfound repository toasts", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorToasts(listener);

    pushErrorToast({
      title: "Git error",
      message: "class=Repository (6); code=NotFound (-3)",
    });

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});

