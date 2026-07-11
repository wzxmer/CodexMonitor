import type { SendMessageResult, WorkspaceInfo } from "@/types";
import type { MessageReferenceResponse } from "@services/tauri";
import type { ThreadDerivationMetadata } from "@threads/utils/threadStorage";
import {
  buildSmartReferencePrompt,
  toMarkdownQuote,
  type MessageReferenceAction,
} from "../utils/messageReferences";

type Args = {
  action: MessageReferenceAction;
  workspace: WorkspaceInfo;
  sourceThreadId: string;
  createSnapshot: (content: string, sourceTitle: string) => Promise<MessageReferenceResponse>;
  insertCurrent: (text: string) => void;
  startThreadForWorkspace: (workspaceId: string, options?: { activate?: boolean }) => Promise<string | null>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
    options?: { skipPromptExpansion?: boolean },
  ) => Promise<SendMessageResult>;
  persistDerivation: (
    workspaceId: string,
    threadId: string,
    metadata: ThreadDerivationMetadata,
  ) => void;
  startError: string;
  sendError: string;
  now?: () => number;
};

export async function applyMessageReference(args: Args): Promise<string | null> {
  const content = (args.action.selectedText ?? args.action.sourceText).trim();
  const sourceTitle = args.action.selectedText
    ? "Selected message content"
    : "Referenced message";
  const prompt = args.action.mode === "smart"
    ? buildSmartReferencePrompt({
        ...(await args.createSnapshot(content, sourceTitle)),
        sourceTitle,
        sourceRole: args.action.sourceRole,
      })
    : toMarkdownQuote(content);

  if (args.action.destination === "current") {
    args.insertCurrent(prompt);
    return null;
  }

  const threadId = await args.startThreadForWorkspace(args.workspace.id, { activate: false });
  if (!threadId) throw new Error(args.startError);
  const result = await args.sendUserMessageToThread(args.workspace, threadId, prompt, [], {
    skipPromptExpansion: true,
  });
  if (result.status !== "sent") throw new Error(args.sendError);
  args.persistDerivation(args.workspace.id, threadId, {
    derivationKind: args.action.selectedText ? "selection" : "message",
    sourceName: args.workspace.name,
    sourceTitle,
    sourceWorkspaceId: args.workspace.id,
    sourceThreadId: args.sourceThreadId,
    sourceMessageId: args.action.messageId,
    sourceMessageRole: args.action.sourceRole,
    createdAt: (args.now ?? Date.now)(),
  });
  return threadId;
}
