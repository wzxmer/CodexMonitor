import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestReleaseUpdate } from "./postUpdateRelease";

const checksum = "a".repeat(64);

function response(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => payload } as Response;
}

describe("fetchLatestReleaseUpdate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back from GitHub to Tencent and Aliyun mirror metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("GitHub unavailable"))
      .mockResolvedValueOnce(response({
        version: "9.9.9",
        assets: [{
          name: "CodexMonitor_9.9.9_x64.msi",
          size: 100,
          sha256: checksum,
          url: "https://cos.example.com/v9.9.9/CodexMonitor_9.9.9_x64.msi",
        }],
      }))
      .mockResolvedValueOnce(response({
        version: "9.9.9",
        assets: [{
          name: "CodexMonitor_9.9.9_x64.msi",
          size: 100,
          sha256: checksum,
          url: "https://oss.example.com/v9.9.9/CodexMonitor_9.9.9_x64.msi",
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const update = await fetchLatestReleaseUpdate("1.0.0", "windows", [
      "https://cos.example.com/latest.json",
      "https://oss.example.com/latest.json",
    ]);

    expect(update?.asset.urls).toEqual([
      "https://cos.example.com/v9.9.9/CodexMonitor_9.9.9_x64.msi",
      "https://oss.example.com/v9.9.9/CodexMonitor_9.9.9_x64.msi",
    ]);
    expect(update?.asset.sha256).toBe(checksum);
  });

  it("keeps GitHub first and appends a verified mirror route", async () => {
    const githubUrl =
      "https://github.com/wzxmer/CodexMonitor/releases/download/v9.9.9/CodexMonitor_9.9.9_x64.msi";
    const mirrorUrl = "https://cos.example.com/v9.9.9/CodexMonitor_9.9.9_x64.msi";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        tag_name: "v9.9.9",
        assets: [{ name: "CodexMonitor_9.9.9_x64.msi", browser_download_url: githubUrl, size: 100 }],
      }))
      .mockResolvedValueOnce(response({
        version: "9.9.9",
        assets: [{
          name: "CodexMonitor_9.9.9_x64.msi",
          size: 100,
          sha256: checksum,
          url: mirrorUrl,
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const update = await fetchLatestReleaseUpdate("1.0.0", "windows", [
      "https://cos.example.com/latest.json",
    ]);

    expect(update?.asset.urls).toEqual([githubUrl, mirrorUrl]);
    expect(update?.asset.sha256).toBe(checksum);
  });
});
