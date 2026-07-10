import { describe, expect, it } from "vitest";
import windowsConfig from "../../src-tauri/tauri.windows.conf.json";

describe("Windows window configuration", () => {
  it("keeps the native window opaque", () => {
    expect(windowsConfig.app.windows[0].transparent).toBe(false);
  });
});
