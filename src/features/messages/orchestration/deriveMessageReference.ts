import type { WorkspaceInfo } from "@/types";
import type { MessageReferenceResponse } from "@services/tauri";
import type { ThreadDerivationMetadata } from "@threads/utils/threadStorage";
import type { ComposerReference } from "@/types";
import {
  buildSmartReferencePrompt,
  LONG_REFERENCE_CHARACTER_THRESHOLD,
  toMarkdownQuote,
  type MessageReferenceAction,
} from "../utils/messageReferences";

type Args = {
  action: MessageReferenceAction;
  workspace: WorkspaceInfo;
  sourceThreadId: string;
  createSnapshot: (content: string, sourceTitle: string) => Promise<MessageReferenceResponse>;
  insertCurrent: (text: string) => void;
  onReferenceCreated?: (reference: ComposerReference) => void;
  insertNew: (threadId: string, text: string) => void;
  onNewReferenceCreated?: (threadId: string, reference: ComposerReference) => void;
  startThreadForWorkspace: (workspaceId: string, options?: { activate?: boolean }) => Promise<string | null>;
  persistDerivation: (
    workspaceId: string,
    threadId: string,
    metadata: ThreadDerivationMetadata,
  ) => void;
  startError: string;
  now?: () => number;
};

export async function applyMessageReference(args: Args): Promise<string | null> {
  const content = args.action.selectedText ?? args.action.sourceText;
  if (!content.trim()) return null;
  const sourceTitle = args.action.selectedText
    ? "Selected message content"
    : "Referenced message";
  const snapshot = args.action.mode === "smart" ? await args.createSnapshot(content, sourceTitle) : null;
  const prompt = args.action.mode === "smart"
    ? buildSmartReferencePrompt({
        ...snapshot!,
        sourceTitle,
        sourceRole: args.action.sourceRole,
      })
    : toMarkdownQuote(content);
  const reference: ComposerReference = {
    id: `${args.action.messageId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceTitle,
    sourceRole: args.action.sourceRole,
    content,
    prompt,
    mode: args.action.mode,
    ...(snapshot ? { referenceId: snapshot.referenceId, path: snapshot.path } : {}),
    collapsed: content.length >= LONG_REFERENCE_CHARACTER_THRESHOLD,
  };

  if (args.action.destination === "current") {
    args.insertCurrent(prompt);
    args.onReferenceCreated?.(reference);
    return null;
  }

  const threadId = await args.startThreadForWorkspace(args.workspace.id, { activate: false });
  if (!threadId) throw new Error(args.startError);
  args.insertNew(threadId, prompt);
  args.onNewReferenceCreated?.(threadId, reference);
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
