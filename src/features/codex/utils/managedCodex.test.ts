import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchManagedCodexPackage } from "./managedCodex";

describe("fetchManagedCodexPackage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to the next manifest route", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("COS unavailable"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: "1.2.3",
          packages: {
            "windows-x86_64": {
              fileName: "codex-cli-1.2.3-windows-x86_64.zip",
              urls: ["https://oss.example.com/codex-cli.zip"],
              size: 100,
              sha256: "a".repeat(64),
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const packageInfo = await fetchManagedCodexPackage("windows-x86_64", [
      "https://cos.example.com/codex-cli-latest.json",
      "https://oss.example.com/codex-cli-latest.json",
    ]);

    expect(packageInfo.version).toBe("1.2.3");
    expect(packageInfo.urls).toEqual(["https://oss.example.com/codex-cli.zip"]);
  });
});
