/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useThemePreference } from "./useThemePreference";

describe("useThemePreference", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    delete document.documentElement.dataset.theme;
  });

  it("tracks system color-scheme changes without replacing the system preference", () => {
    let matches = false;
    let changeListener: ((event: MediaQueryListEvent) => void) | null = null;
    const mediaQuery = {
      get matches() {
        return matches;
      },
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn((_type, listener) => {
        changeListener = listener as (event: MediaQueryListEvent) => void;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQuery),
    });

    const { result } = renderHook(() => useThemePreference("system"));
    expect(result.current).toBe("light");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    matches = true;
    act(() => {
      changeListener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
