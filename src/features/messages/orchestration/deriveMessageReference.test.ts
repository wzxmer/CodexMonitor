import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import { applyMessageReference } from "./deriveMessageReference";

const workspace = {
  id: "workspace-1",
  name: "Workspace",
  path: "D:/Project/Workspace",
  connected: true,
  settings: {},
} as WorkspaceInfo;

function baseArgs() {
  return {
    workspace,
    sourceThreadId: "thread-source",
    createSnapshot: vi.fn(async () => ({
      referenceId: "reference-1",
      path: "D:/Codex/references/reference-1/content.md",
      characterCount: 12,
      estimatedTokens: 3,
    })),
    insertCurrent: vi.fn(),
    startThreadForWorkspace: vi.fn(async () => "thread-derived"),
    sendUserMessageToThread: vi.fn(async () => ({ status: "sent" as const })),
    persistDerivation: vi.fn(),
    startError: "start failed",
    sendError: "send failed",
    now: () => 123,
  };
}

describe("applyMessageReference", () => {
  it("inserts a full selected quote into the current conversation", async () => {
    const args = baseArgs();
    const result = await applyMessageReference({
      ...args,
      action: {
        messageId: "message-1",
        sourceRole: "assistant",
        sourceText: "whole message",
        selectedText: "selected text",
        mode: "full",
        destination: "current",
      },
    });

    expect(result).toBeNull();
    expect(args.insertCurrent).toHaveBeenCalledWith("> selected text\n\n");
    expect(args.createSnapshot).not.toHaveBeenCalled();
  });

  it("stores a smart reference before deriving a new conversation", async () => {
    const args = baseArgs();
    const result = await applyMessageReference({
      ...args,
      action: {
        messageId: "message-1",
        sourceRole: "assistant",
        sourceText: "large source content",
        selectedText: null,
        mode: "smart",
        destination: "new",
      },
    });

    expect(result).toBe("thread-derived");
    expect(args.createSnapshot).toHaveBeenCalledWith("large source content", "Referenced message");
    expect(args.sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-derived",
      expect.stringContaining("path=\"D:/Codex/references/reference-1/content.md\""),
      [],
      { skipPromptExpansion: true },
    );
    expect(args.sendUserMessageToThread).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining("large source content"),
      expect.anything(),
      expect.anything(),
    );
    expect(args.persistDerivation).toHaveBeenCalledWith(
      "workspace-1",
      "thread-derived",
      expect.objectContaining({
        derivationKind: "message",
        sourceThreadId: "thread-source",
        sourceMessageId: "message-1",
      }),
    );
  });

  it("does not persist derivation when sending fails", async () => {
    const args = baseArgs();
    const sendUserMessageToThread = vi.fn(async () => ({ status: "blocked" as const }));

    await expect(applyMessageReference({
      ...args,
      sendUserMessageToThread,
      action: {
        messageId: "message-1",
        sourceRole: "user",
        sourceText: "source",
        selectedText: null,
        mode: "full",
        destination: "new",
      },
    })).rejects.toThrow("send failed");
    expect(args.persistDerivation).not.toHaveBeenCalled();
  });
});
