import { describe, expect, it } from "vitest";
import { resolveCodexProviderBaseUrl } from "./providerProfiles";

describe("resolveCodexProviderBaseUrl", () => {
  it("prefers explicit URLs and supplies known provider defaults", () => {
    expect(resolveCodexProviderBaseUrl("deepseek", null)).toBe(
      "https://api.deepseek.com/v1",
    );
    expect(resolveCodexProviderBaseUrl("openrouter", " https://proxy.example/v1 ")).toBe(
      "https://proxy.example/v1",
    );
    expect(resolveCodexProviderBaseUrl("custom", null)).toBeNull();
  });
});
