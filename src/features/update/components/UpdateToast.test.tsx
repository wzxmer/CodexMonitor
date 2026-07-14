// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../hooks/useUpdater";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import { UpdateToast } from "./UpdateToast";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

const openUrlMock = vi.mocked(openUrl);

function renderUpdateToast(element: ReactElement) {
  return render(<I18nProvider preference="en">{element}</I18nProvider>);
}

describe("UpdateToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders available state and handles actions", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    const state: UpdateState = { stage: "available", version: "1.2.3" };

    renderUpdateToast(
      <UpdateToast state={state} onUpdate={onUpdate} onDismiss={onDismiss} />,
    );

    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getAllByText("Update")).toHaveLength(2);
    expect(screen.getByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("A new version is available.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders downloading state with progress", () => {
    const state: UpdateState = {
      stage: "downloading",
      progress: { totalBytes: 1000, downloadedBytes: 500 },
    };

    const { container } = renderUpdateToast(
      <UpdateToast state={state} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText(/Downloading update/)).toBeTruthy();
    expect(screen.getByText("500 B / 1000 B")).toBeTruthy();
    const fill = container.querySelector(".update-toast-progress-fill");
    expect(fill).toBeTruthy();
    if (!fill) {
      throw new Error("Expected progress fill element");
    }
    expect(fill.getAttribute("style")).toContain("width: 50%");
  });

  it("renders error state and lets you dismiss or retry", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    const state: UpdateState = {
      stage: "error",
      error: "Network error",
    };

    renderUpdateToast(
      <UpdateToast state={state} onUpdate={onUpdate} onDismiss={onDismiss} />,
    );

    expect(screen.getByText("Update failed.")).toBeTruthy();
    expect(screen.getByText("Network error")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows the localized mixed-installer safety block", () => {
    const state: UpdateState = {
      stage: "error",
      errorCode: "mixedInstaller",
    };

    renderUpdateToast(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Both MSI and EXE installer records were detected/),
    ).toBeTruthy();
  });

  it("renders post-update loading notice and dismisses", () => {
    const onDismissPostUpdateNotice = vi.fn();
    const state: UpdateState = { stage: "idle" };

    const { container } = renderUpdateToast(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
        postUpdateNotice={{
          stage: "loading",
          version: "1.2.3",
          htmlUrl: "https://github.com/wzxmer/CodexMonitor/releases/tag/v1.2.3",
        }}
        onDismissPostUpdateNotice={onDismissPostUpdateNotice}
      />,
    );
    const scoped = within(container);

    expect(scoped.getByText("What's New")).toBeTruthy();
    expect(scoped.getByText(/Loading release notes/i)).toBeTruthy();
    fireEvent.click(scoped.getByRole("button", { name: "Dismiss" }));
    expect(onDismissPostUpdateNotice).toHaveBeenCalledTimes(1);
  });

  it("renders post-update release notes and opens GitHub link", () => {
    const onDismissPostUpdateNotice = vi.fn();
    const htmlUrl =
      "https://github.com/wzxmer/CodexMonitor/releases/tag/v1.2.3";
    const state: UpdateState = { stage: "idle" };

    const { container } = renderUpdateToast(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
        postUpdateNotice={{
          stage: "ready",
          version: "1.2.3",
          body: "## Highlights\n- Added release notes toast",
          htmlUrl,
        }}
        onDismissPostUpdateNotice={onDismissPostUpdateNotice}
      />,
    );
    const scoped = within(container);

    expect(scoped.getByText("Highlights")).toBeTruthy();
    expect(scoped.getByText("Added release notes toast")).toBeTruthy();

    fireEvent.click(scoped.getByRole("button", { name: "View on GitHub" }));
    expect(openUrlMock).toHaveBeenCalledWith(htmlUrl);

    fireEvent.click(scoped.getByRole("button", { name: "Dismiss" }));
    expect(onDismissPostUpdateNotice).toHaveBeenCalledTimes(1);
  });

  it("renders post-update fallback notice", () => {
    const htmlUrl =
      "https://github.com/wzxmer/CodexMonitor/releases/tag/v1.2.3";
    const state: UpdateState = { stage: "available", version: "9.9.9" };

    const { container } = renderUpdateToast(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
        postUpdateNotice={{
          stage: "fallback",
          version: "1.2.3",
          htmlUrl,
        }}
      />,
    );
    const scoped = within(container);

    expect(
      scoped.getByText("Updated to v1.2.3. Release notes could not be loaded."),
    ).toBeTruthy();
    fireEvent.click(scoped.getByRole("button", { name: "View on GitHub" }));
    expect(openUrlMock).toHaveBeenCalledWith(htmlUrl);
    expect(scoped.queryByText("A new version is available.")).toBeNull();
  });

  it("renders localized update text in the default language", () => {
    render(
      <UpdateToast
        state={{ stage: "available", version: "1.2.3" }}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getAllByText("更新")).toHaveLength(2);
    expect(screen.getByText("发现新版本。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "稍后" })).toBeTruthy();
  });
});
