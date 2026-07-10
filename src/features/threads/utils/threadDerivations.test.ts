// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadThreadDerivations, saveThreadDerivation } from "./threadStorage";

describe("thread derivation storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists source session provenance by destination thread", () => {
    saveThreadDerivation("ws-1", "thread-new", {
      sourceSessionKey: "source-a:thread-a",
      sourceName: "Primary",
      sourceTitle: "Original",
      createdAt: 10,
    });
    expect(loadThreadDerivations()["ws-1:thread-new"]).toEqual({
      sourceSessionKey: "source-a:thread-a",
      sourceName: "Primary",
      sourceTitle: "Original",
      createdAt: 10,
    });
  });
});
