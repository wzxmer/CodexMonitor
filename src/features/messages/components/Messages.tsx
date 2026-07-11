import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Search from "lucide-react/dist/esm/icons/search";
import X from "lucide-react/dist/esm/icons/x";
import type {
  ConversationItem,
  MessageReadingStyle,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
  ThemeAccentPreference,
  ThemePreference,
} from "../../../types";
import { PlanReadyFollowupMessage } from "../../app/components/PlanReadyFollowupMessage";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import {
  formatCount,
  countDiffLineChanges,
  getConversationItemSearchText,
  parseReasoning,
  type MessageListBaseEntry,
  type MessageListEntry,
} from "../utils/messageRenderUtils";
import { CONVERSATION_STYLE_PRESETS } from "../utils/conversationStylePresets";
import {
  toMarkdownQuote,
  type MessageReferenceAction,
} from "../utils/messageReferences";
import { useI18n } from "@/features/i18n/I18nProvider";
import {
  DiffRow,
  ExploreRow,
  MessageRow,
  ProcessRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  UserInputRow,
  WorkingIndicator,
} from "./MessageRows";
import { useMessagesViewState } from "./useMessagesViewState";

function getSearchTargetForEntry(entry: MessageListEntry) {
  if (entry.kind === "processGroup") {
    return `process-group-${entry.group.id}`;
  }
  if (entry.kind === "toolGroup") {
    return `tool-group-${entry.group.id}`;
  }
  return `item-${entry.item.id}`;
}

function baseEntryContainsItem(entry: MessageListBaseEntry, itemId: string) {
  return entry.kind === "toolGroup"
    ? entry.group.items.some((item) => item.id === itemId)
    : entry.item.id === itemId;
}

function getSearchTargetForItem(entries: MessageListEntry[], itemId: string) {
  const entry = entries.find((candidate) => {
    if (candidate.kind === "processGroup") {
      return candidate.group.entries.some((processEntry) =>
        baseEntryContainsItem(processEntry, itemId),
      );
    }
    return baseEntryContainsItem(candidate, itemId);
  });
  return entry ? getSearchTargetForEntry(entry) : null;
}

function isNativeColorPickerBlur(event: ReactFocusEvent<HTMLElement>) {
  return event.target instanceof HTMLInputElement
    && event.target.type === "color"
    && event.relatedTarget === null;
}

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  isLoadingMessages?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  showPollingFetchStatus?: boolean;
  pollingIntervalMs?: number;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  codeBlockCopyUseModifier?: boolean;
  showMessageFilePath?: boolean;
  defaultToolGroupsCollapsed?: boolean;
  messageReadingStyle?: MessageReadingStyle;
  messageCanvasColor?: string;
  messageUserBubbleColor?: string;
  messageUserTextColor?: string;
  messageAssistantBubbleColor?: string;
  messageAssistantAccentColor?: string;
  messageAssistantTextColor?: string;
  chatHistoryScrollbackItems?: number | null;
  interruptedStatus?: { timestamp: number } | null;
  activeTurnDiff?: string | null;
  onUpdateConversationStyle?: (next: {
    theme?: ThemePreference;
    themeAccent?: ThemeAccentPreference;
    messageReadingStyle?: MessageReadingStyle;
    messageCanvasColor?: string;
    messageUserBubbleColor?: string;
    messageUserTextColor?: string;
    messageAssistantBubbleColor?: string;
    messageAssistantAccentColor?: string;
    messageAssistantTextColor?: string;
    messageToolGroupsCollapsedByDefault?: boolean;
  }) => void;
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onOpenThreadLink?: (threadId: string, workspaceId?: string | null) => void;
  onQuoteMessage?: (text: string) => void;
  onReferenceMessage?: (action: MessageReferenceAction) => void;
  onResendUserMessage?: (
    text: string,
    images?: string[],
    options?: { replaceMessageId?: string },
  ) => void;
};

export function getRetryableUserMessageId(
  items: ConversationItem[],
  interruptedStatus?: { timestamp: number } | null,
) {
  let lastUserMessageId: string | null = null;
  let hasAssistantMessageAfterLastUser = false;
  for (const item of items) {
    if (item.kind !== "message") {
      continue;
    }
    if (item.role === "user") {
      lastUserMessageId = item.id;
      hasAssistantMessageAfterLastUser = false;
      continue;
    }
    if (lastUserMessageId) {
      hasAssistantMessageAfterLastUser = true;
    }
  }
  if (!lastUserMessageId) {
    return null;
  }
  if (interruptedStatus) {
    return lastUserMessageId;
  }
  if (!hasAssistantMessageAfterLastUser) {
    return null;
  }
  const lastAssistantMessage = [...items]
    .reverse()
    .find(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
  return lastAssistantMessage?.text.trim().startsWith("Turn failed")
    ? lastUserMessageId
    : null;
}

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  isLoadingMessages = false,
  processingStartedAt = null,
  lastDurationMs = null,
  showPollingFetchStatus = false,
  pollingIntervalMs = 12000,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  codeBlockCopyUseModifier = false,
  showMessageFilePath = true,
  defaultToolGroupsCollapsed = false,
  messageReadingStyle = "bubble",
  messageCanvasColor = "#eef1f6",
  messageUserBubbleColor = "#d9ebff",
  messageUserTextColor = "#102033",
  messageAssistantBubbleColor = "#f7f9fc",
  messageAssistantAccentColor = "#8aa8d8",
  messageAssistantTextColor = "#263040",
  chatHistoryScrollbackItems = null,
  interruptedStatus = null,
  activeTurnDiff = null,
  onUpdateConversationStyle,
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onQuoteMessage,
  onReferenceMessage,
  onResendUserMessage,
}: MessagesProps) {
  const { t } = useI18n();
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchThreadId, setSearchThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [searchNavigationVersion, setSearchNavigationVersion] = useState(0);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTargetRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledSearchNavigationVersionRef = useRef(0);
  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );
  const handleOpenThreadLink = useCallback(
    (threadId: string) => {
      onOpenThreadLink?.(threadId, workspaceId ?? null);
    },
    [onOpenThreadLink, workspaceId],
  );

  const hasActiveUserInputRequest = activeUserInputRequestId !== null;
  const retryableUserMessageId = useMemo(
    () => getRetryableUserMessageId(items, interruptedStatus),
    [interruptedStatus, items],
  );
  const hasVisibleUserInputRequest = hasActiveUserInputRequest && Boolean(onUserInputSubmit);
  const userInputNode =
    hasActiveUserInputRequest && onUserInputSubmit ? (
      <RequestUserInputMessage
        requests={userInputRequests}
        activeThreadId={threadId}
        activeWorkspaceId={workspaceId}
        onSubmit={onUserInputSubmit}
      />
    ) : null;
  const {
    bottomRef,
    containerRef,
    updateAutoScroll,
    requestAutoScroll,
    showScrollToLatest,
    scrollToLatest,
    hiddenBeforeCount,
    hiddenAfterCount,
    loadEarlierHistory,
    loadLaterHistory,
    revealHistoryItemAtIndex,
    revealGroupedItem,
    expandedItems,
    toggleExpanded,
    collapsedToolGroups,
    toggleToolGroup,
    isToolGroupsAutoCollapsed,
    setToolGroupsAutoCollapsed,
    copiedMessageId,
    handleCopyMessage,
    reasoningMetaById,
    latestReasoningLabel,
    groupedItems,
    planFollowup,
    dismissPlanFollowup,
  } = useMessagesViewState({
    items,
    threadId,
    isThinking,
    activeUserInputRequestId,
    hasVisibleUserInputRequest,
    defaultToolGroupsCollapsed,
    chatHistoryScrollbackItems,
    onPlanAccept,
    onPlanSubmitChanges,
    onQuoteMessage,
  });
  const handleReferenceMessage = useCallback(
    (action: MessageReferenceAction) => {
      if (onReferenceMessage) {
        onReferenceMessage(action);
        return;
      }
      if (action.destination === "current" && onQuoteMessage) {
        onQuoteMessage(toMarkdownQuote(action.selectedText ?? action.sourceText));
      }
    },
    [onQuoteMessage, onReferenceMessage],
  );
  const isSearchActiveForThread = searchOpen && searchThreadId === threadId;
  const searchMatches = useMemo(() => {
    if (!isSearchActiveForThread) {
      return [];
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return items.flatMap((item, itemIndex) =>
      getConversationItemSearchText(item).toLowerCase().includes(query)
        ? [{ itemId: item.id, itemIndex }]
        : [],
    );
  }, [isSearchActiveForThread, items, searchQuery]);
  const activeSearchMatch =
    searchMatches.length > 0
      ? searchMatches[Math.min(activeSearchIndex, searchMatches.length - 1)]
      : null;
  const activeSearchTargetId = activeSearchMatch
    ? getSearchTargetForItem(groupedItems, activeSearchMatch.itemId)
    : null;
  const activeSearchDisplayIndex =
    searchMatches.length > 0
      ? Math.min(activeSearchIndex, searchMatches.length - 1) + 1
      : 0;

  useEffect(() => {
    setSearchOpen(false);
    setSearchThreadId(null);
    setSearchQuery("");
    setActiveSearchIndex(0);
  }, [threadId]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [searchOpen]);

  useEffect(() => {
    if (!stylePanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && styleMenuRef.current?.contains(target)) {
        return;
      }
      setStylePanelOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [stylePanelOpen]);

  useEffect(() => {
    if (!activeSearchMatch) {
      return;
    }
    revealHistoryItemAtIndex(activeSearchMatch.itemIndex);
    revealGroupedItem(activeSearchMatch.itemId);
  }, [activeSearchMatch, revealGroupedItem, revealHistoryItemAtIndex]);

  useEffect(() => {
    if (
      handledSearchNavigationVersionRef.current === searchNavigationVersion
    ) {
      return;
    }
    if (!isSearchActiveForThread || !activeSearchTargetId) {
      return;
    }
    const node = searchTargetRefs.current[activeSearchTargetId];
    if (!node) {
      return;
    }
    handledSearchNavigationVersionRef.current = searchNavigationVersion;
    const frameId = window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSearchTargetId, isSearchActiveForThread, searchNavigationVersion]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        if (searchThreadId !== threadId) {
          setSearchThreadId(threadId);
          setSearchQuery("");
          setActiveSearchIndex(0);
        }
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, searchThreadId, threadId]);

  const registerSearchTarget = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (node) {
        searchTargetRefs.current[id] = node;
      } else {
        delete searchTargetRefs.current[id];
      }
    },
    [],
  );

  const moveSearch = useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) {
        return;
      }
      setActiveSearchIndex((current) =>
        (current + direction + searchMatches.length) % searchMatches.length,
      );
      setSearchNavigationVersion((current) => current + 1);
    },
    [searchMatches.length],
  );

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setActiveSearchIndex(0);
    setSearchNavigationVersion((current) => current + 1);
  }, []);

  const handleSearchInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        moveSearch(event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSearchOpen(false);
      }
    },
    [moveSearch],
  );
  const messagesStyle = useMemo(
    () =>
      ({
        "--conversation-canvas": messageCanvasColor,
        "--conversation-user-color": messageUserBubbleColor,
        "--conversation-user-text": messageUserTextColor,
        "--conversation-assistant-bg": messageAssistantBubbleColor,
        "--conversation-assistant-accent": messageAssistantAccentColor,
        "--conversation-assistant-text": messageAssistantTextColor,
      }) as CSSProperties,
    [
      messageAssistantAccentColor,
      messageAssistantBubbleColor,
      messageAssistantTextColor,
      messageCanvasColor,
      messageUserBubbleColor,
      messageUserTextColor,
    ],
  );

  const updateConversationStyle = useCallback(
    (next: Parameters<NonNullable<typeof onUpdateConversationStyle>>[0]) => {
      onUpdateConversationStyle?.(next);
    },
    [onUpdateConversationStyle],
  );

  const applyAssistantTheme = useCallback(
    (backgroundColor: string, textColor: string, accentColor: string) => {
      updateConversationStyle({
        messageAssistantBubbleColor: backgroundColor,
        messageAssistantAccentColor: accentColor,
        messageAssistantTextColor: textColor,
      });
    },
    [updateConversationStyle],
  );

  const applyUserTheme = useCallback(
    (backgroundColor: string, textColor: string) => {
      updateConversationStyle({
        messageUserBubbleColor: backgroundColor,
        messageUserTextColor: textColor,
      });
    },
    [updateConversationStyle],
  );

  const toggleToolAutoCollapse = useCallback(() => {
    const nextValue = !isToolGroupsAutoCollapsed;
    setToolGroupsAutoCollapsed(nextValue);
    updateConversationStyle({
      messageToolGroupsCollapsedByDefault: nextValue,
    });
  }, [isToolGroupsAutoCollapsed, setToolGroupsAutoCollapsed, updateConversationStyle]);

  const planFollowupNode =
    planFollowup.shouldShow && onPlanAccept && onPlanSubmitChanges ? (
      <PlanReadyFollowupMessage
        onAccept={() => {
          dismissPlanFollowup();
          onPlanAccept();
        }}
        onSubmitChanges={(changes) => {
          dismissPlanFollowup();
          onPlanSubmitChanges(changes);
        }}
      />
    ) : null;
  const toolGroupCount = groupedItems.filter(
    (entry) => entry.kind === "toolGroup" || entry.kind === "processGroup",
  ).length;
  const stoppedAssistantMessageId = useMemo(() => {
    if (!interruptedStatus) {
      return null;
    }
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const candidate = items[index];
      if (candidate.kind === "message" && candidate.role === "assistant") {
        return candidate.id;
      }
    }
    return null;
  }, [interruptedStatus, items]);
  const toolAutoCollapseStatus = isToolGroupsAutoCollapsed
    ? t("messages.on")
    : t("messages.off");
  const activeTurnLineChangeStats = useMemo(
    () => countDiffLineChanges(activeTurnDiff),
    [activeTurnDiff],
  );
  const lineChangeStatsGroupId = useMemo(() => {
    if (!activeTurnLineChangeStats) {
      return null;
    }
    for (let index = groupedItems.length - 1; index >= 0; index -= 1) {
      const entry = groupedItems[index];
      if (entry?.kind === "processGroup" || entry?.kind === "toolGroup") {
        return entry.group.id;
      }
    }
    return null;
  }, [activeTurnLineChangeStats, groupedItems]);
  const renderLineChangeStats = useCallback(() => {
    if (!activeTurnLineChangeStats) {
      return null;
    }
    return (
      <span className="tool-group-line-change-stats" aria-label="Line changes">
        {activeTurnLineChangeStats.additions > 0 && (
          <span className="tool-group-line-change-stat tool-group-line-change-stat-add">
            +{activeTurnLineChangeStats.additions}
          </span>
        )}
        {activeTurnLineChangeStats.deletions > 0 && (
          <span className="tool-group-line-change-stat tool-group-line-change-stat-delete">
            -{activeTurnLineChangeStats.deletions}
          </span>
        )}
      </span>
    );
  }, [activeTurnLineChangeStats]);
  const statusSeparator = t("messages.statusSeparator");
  const assistantColorPresets = [
    { label: t("color.defaultBlue"), bg: "#f7f9fc", accent: "#7dadff", text: "#263040" },
    { label: t("color.teal"), bg: "#f0faf6", accent: "#4aa389", text: "#24332f" },
    { label: t("color.softPurple"), bg: "#f7f2ff", accent: "#9a7bd8", text: "#302a3d" },
    { label: t("color.warmBrown"), bg: "#fff6ee", accent: "#d18455", text: "#3b2d25" },
  ];
  const userColorPresets = [
    { label: t("color.apricot"), color: "#f3d6ad", text: "#332519" },
    { label: t("color.lightBlue"), color: "#d9ebff", text: "#102033" },
    { label: t("color.lightGreen"), color: "#dff3e8", text: "#183126" },
    { label: t("color.lightPurple"), color: "#eadcf8", text: "#2e2140" },
    { label: t("color.lightPink"), color: "#f6e2e2", text: "#3a2222" },
  ];

  const renderItem = (
    item: ConversationItem,
    options?: { suppressCliTimestamp?: boolean },
  ) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      return (
        <MessageRow
          key={item.id}
          item={item}
          isCopied={isCopied}
          onCopy={handleCopyMessage}
          onReference={
            onReferenceMessage || onQuoteMessage ? handleReferenceMessage : undefined
          }
          onResendUserMessage={
            onResendUserMessage && item.id === retryableUserMessageId
              ? (message, text) =>
                  onResendUserMessage(text, message.images ?? [])
              : undefined
          }
          codeBlockCopyUseModifier={codeBlockCopyUseModifier}
          showMessageFilePath={showMessageFilePath}
          interrupted={
            stoppedAssistantMessageId === item.id
              ? {
                  label: t("messages.sessionStopped"),
                }
              : null
          }
          suppressCliTimestamp={options?.suppressCliTimestamp}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
        />
      );
    }
    if (item.kind === "reasoning") {
      const isExpanded = expandedItems.has(item.id);
      const parsed = reasoningMetaById.get(item.id) ?? parseReasoning(item);
      return (
        <ReasoningRow
          key={item.id}
          item={item}
          parsed={parsed}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
        />
      );
    }
    if (item.kind === "review") {
      return (
        <ReviewRow
          key={item.id}
          item={item}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
        />
      );
    }
    if (item.kind === "userInput") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <UserInputRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
        />
      );
    }
    if (item.kind === "diff") {
      return <DiffRow key={item.id} item={item} />;
    }
    if (item.kind === "tool") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <ToolRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
          onRequestAutoScroll={requestAutoScroll}
        />
      );
    }
    if (item.kind === "explore") {
      return <ExploreRow key={item.id} item={item} />;
    }
    if (item.kind === "process") {
      return <ProcessRow key={item.id} item={item} />;
    }
    return null;
  };

  return (
    <div
      className={`messages messages-full messages-reading-${messageReadingStyle}`}
      ref={containerRef}
      onScroll={updateAutoScroll}
      style={messagesStyle}
    >
      <div className="messages-inner">
        {isSearchActiveForThread && (
          <div className="messages-session-search" role="search">
            <Search size={14} aria-hidden />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              onKeyDown={handleSearchInputKeyDown}
              aria-label={t("messages.searchCurrentSession")}
              placeholder={t("messages.searchCurrentSession")}
            />
            <span className="messages-session-search-count" aria-live="polite">
              {searchQuery.trim()
                ? t("messages.searchCount")
                    .replace(
                      "{current}",
                      String(activeSearchDisplayIndex),
                    )
                    .replace("{total}", String(searchMatches.length))
                : t("messages.searchHint")}
            </span>
            <button
              type="button"
              className="ghost messages-session-search-icon-button"
              onClick={() => moveSearch(-1)}
              disabled={searchMatches.length === 0}
              aria-label={t("messages.searchPrevious")}
              title={t("messages.searchPrevious")}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="ghost messages-session-search-icon-button"
              onClick={() => moveSearch(1)}
              disabled={searchMatches.length === 0}
              aria-label={t("messages.searchNext")}
              title={t("messages.searchNext")}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="ghost messages-session-search-icon-button"
              onClick={() => setSearchOpen(false)}
              aria-label={t("messages.searchClose")}
              title={t("messages.searchClose")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {(toolGroupCount > 0 || threadId || items.length > 0) && (
          <div className="messages-tool-controls" aria-label={t("messages.readingStyle")}>
            <div
              className="messages-reading-segmented"
              role="group"
              aria-label={t("messages.readingStyleShort")}
            >
              {(["bubble", "native", "cli"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={messageReadingStyle === style ? "is-selected" : ""}
                  onClick={() => updateConversationStyle({ messageReadingStyle: style })}
                >
                  {style === "bubble"
                    ? t("messages.style.bubble")
                    : style === "native"
                      ? t("messages.style.native")
                      : "CLI"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`ghost messages-toggle-pill${
                isToolGroupsAutoCollapsed ? " is-active" : ""
              }`}
              onClick={toggleToolAutoCollapse}
              aria-pressed={isToolGroupsAutoCollapsed}
              aria-label={`${t("messages.toolAutoCollapse")}${statusSeparator}${toolAutoCollapseStatus}`}
              title={`${t("messages.toolAutoCollapse")}${statusSeparator}${toolAutoCollapseStatus}`}
            >
              {t("messages.autoCollapse")}
              {statusSeparator}
              {toolAutoCollapseStatus}
            </button>
            <div
              ref={styleMenuRef}
              className="messages-style-menu"
              onBlur={(event) => {
                if (isNativeColorPickerBlur(event)) {
                  return;
                }
                const nextTarget = event.relatedTarget;
                if (
                  nextTarget instanceof Node &&
                  event.currentTarget.contains(nextTarget)
                ) {
                  return;
                }
                setStylePanelOpen(false);
              }}
            >
              <button
                type="button"
                className="ghost messages-toggle-pill"
                onClick={() => setStylePanelOpen((open) => !open)}
                aria-expanded={stylePanelOpen}
              >
                {t("messages.style")}
              </button>
              {stylePanelOpen && (
                <div
                  className="messages-style-popover"
                  role="dialog"
                  aria-label={t("messages.styleDialog")}
                >
                  <div className="messages-style-section">
                    <div className="messages-style-section-title">
                      {t("messages.styleScheme")}
                    </div>
                    <div
                      className="messages-scheme-presets"
                      role="group"
                      aria-label={t("messages.styleScheme")}
                    >
                      {CONVERSATION_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="messages-scheme-preset"
                          style={{ "--preset-color": preset.swatch } as CSSProperties}
                          onClick={() => updateConversationStyle(preset.settings)}
                        >
                          <span
                            className="messages-scheme-preset-swatch"
                            style={{ background: preset.swatch }}
                            aria-hidden
                          />
                          <span className="messages-scheme-preset-copy">
                            <span className="messages-scheme-preset-title">
                              {t(preset.messageTitleKey)}
                            </span>
                            <span className="messages-scheme-preset-subtitle">
                              {t(preset.messageSubtitleKey)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="messages-style-section">
                    <div className="messages-style-section-title">
                      {t("messages.aiTheme")}
                    </div>
                    <div
                      className="messages-color-presets"
                      role="group"
                      aria-label={t("messages.aiTheme")}
                    >
                      {assistantColorPresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="messages-color-preset"
                          style={{ "--preset-color": preset.accent } as CSSProperties}
                          onClick={() =>
                            applyAssistantTheme(preset.bg, preset.text, preset.accent)
                          }
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="messages-style-section">
                    <div className="messages-style-section-title">
                      {t("messages.myMessage")}
                    </div>
                    <div
                      className="messages-color-presets"
                      role="group"
                      aria-label={t("messages.myMessageColors")}
                    >
                      {userColorPresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="messages-color-preset"
                          style={{ "--preset-color": preset.color } as CSSProperties}
                          onClick={() => applyUserTheme(preset.color, preset.text)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="messages-style-field-grid">
                    <label>
                      <span>{t("messages.aiBackground")}</span>
                      <input
                        type="color"
                        value={messageAssistantBubbleColor}
                        onChange={(event) =>
                          updateConversationStyle({
                            messageAssistantBubbleColor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t("messages.aiText")}</span>
                      <input
                        type="color"
                        value={messageAssistantTextColor}
                        onChange={(event) =>
                          updateConversationStyle({
                            messageAssistantTextColor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t("messages.myBackground")}</span>
                      <input
                        type="color"
                        value={messageUserBubbleColor}
                        onChange={(event) =>
                          updateConversationStyle({
                            messageUserBubbleColor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t("messages.myText")}</span>
                      <input
                        type="color"
                        value={messageUserTextColor}
                        onChange={(event) =>
                          updateConversationStyle({
                            messageUserTextColor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t("messages.aiAccent")}</span>
                      <input
                        type="color"
                        value={messageAssistantAccentColor}
                        onChange={(event) =>
                          updateConversationStyle({
                            messageAssistantAccentColor: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {hiddenBeforeCount > 0 && (
          <button
            type="button"
            className="messages-history-notice"
            onClick={loadEarlierHistory}
          >
            {t("messages.historyEarlierNotice").replace(
              "{count}",
              String(hiddenBeforeCount),
            )}
          </button>
        )}
        {groupedItems.map((entry) => {
          const searchTarget = getSearchTargetForEntry(entry);
          const isActiveSearchMatch = activeSearchTargetId === searchTarget;
          const isUserMessageSearchTarget =
            entry.kind === "item" &&
            entry.item.kind === "message" &&
            entry.item.role === "user";
          const searchTargetClassName = `messages-search-target${
            isActiveSearchMatch ? " is-active-search-match" : ""
          }${isUserMessageSearchTarget ? " is-user-message-search-target" : ""}`;
          if (entry.kind === "processGroup") {
            const { group } = entry;
            const isCollapsed = collapsedToolGroups.has(group.id);
            const summaryParts = [];
            if (group.toolCount > 0) {
              summaryParts.push(
                formatCount(
                  group.toolCount,
                  t("messages.toolCallSingular"),
                  t("messages.toolCallPlural"),
                ),
              );
            }
            if (group.messageCount > 0) {
              summaryParts.push(
                formatCount(
                  group.messageCount,
                  t("messages.processMessageSingular"),
                  t("messages.processMessagePlural"),
                ),
              );
            }
            const summaryText =
              summaryParts.length > 0 ? summaryParts.join(", ") : t("messages.processMessages");
            const groupBodyId = `tool-group-${group.id}`;
            const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <div
                key={`process-group-${group.id}`}
                ref={registerSearchTarget(searchTarget)}
                className={`tool-group process-group ${searchTargetClassName} ${
                  isCollapsed ? "tool-group-collapsed" : ""
                }`}
              >
                <div className="tool-group-header">
                  <button
                    type="button"
                    className="tool-group-toggle"
                    onClick={() => toggleToolGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={groupBodyId}
                    aria-label={
                      isCollapsed ? t("messages.expandProcess") : t("messages.collapseProcess")
                    }
                  >
                    <span className="tool-group-chevron" aria-hidden>
                      <ChevronIcon size={14} />
                    </span>
                    <span className="tool-group-summary-content">
                      <span className="tool-group-summary">{summaryText}</span>
                      {group.id === lineChangeStatsGroupId && renderLineChangeStats()}
                    </span>
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="tool-group-body" id={groupBodyId}>
                    {group.entries.map((processEntry) => {
                      if (processEntry.kind === "toolGroup") {
                        return (
                          <div
                            key={`nested-tool-group-${processEntry.group.id}`}
                            className="tool-group process-group-nested"
                          >
                            <div className="tool-group-body">
                              {processEntry.group.items.map((nestedItem) =>
                                renderItem(nestedItem),
                              )}
                            </div>
                          </div>
                        );
                      }
                      return renderItem(processEntry.item);
                    })}
                  </div>
                )}
              </div>
            );
          }
          if (entry.kind === "toolGroup") {
            const { group } = entry;
            const isCollapsed = collapsedToolGroups.has(group.id);
            const summaryParts = [];
            if (group.toolCount > 0) {
              summaryParts.push(
                formatCount(
                  group.toolCount,
                  t("messages.toolCallSingular"),
                  t("messages.toolCallPlural"),
                ),
              );
            }
            if (group.messageCount > 0) {
              summaryParts.push(
                formatCount(
                  group.messageCount,
                  t("messages.messageSingular"),
                  t("messages.messagePlural"),
                ),
              );
            }
            const summaryText =
              summaryParts.length > 0 ? summaryParts.join(", ") : t("messages.processMessages");
            const groupBodyId = `tool-group-${group.id}`;
            const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <div
                key={`tool-group-${group.id}`}
                ref={registerSearchTarget(searchTarget)}
                className={`tool-group ${searchTargetClassName} ${
                  isCollapsed ? "tool-group-collapsed" : ""
                }`}
              >
                <div className="tool-group-header">
                  <button
                    type="button"
                    className="tool-group-toggle"
                    onClick={() => toggleToolGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={groupBodyId}
                    aria-label={
                      isCollapsed ? t("messages.expandTools") : t("messages.collapseTools")
                    }
                  >
                    <span className="tool-group-chevron" aria-hidden>
                      <ChevronIcon size={14} />
                    </span>
                    <span className="tool-group-summary-content">
                      <span className="tool-group-summary">{summaryText}</span>
                      {group.id === lineChangeStatsGroupId && renderLineChangeStats()}
                    </span>
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="tool-group-body" id={groupBodyId}>
                    {group.items.map((item) => renderItem(item))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div
              key={`item-search-${entry.item.id}`}
              ref={registerSearchTarget(searchTarget)}
              className={searchTargetClassName}
            >
              {renderItem(entry.item)}
            </div>
          );
        })}
        {hiddenAfterCount > 0 && (
          <button
            type="button"
            className="messages-history-notice"
            onClick={loadLaterHistory}
          >
            {t("messages.historyLaterNotice").replace(
              "{count}",
              String(hiddenAfterCount),
            )}
          </button>
        )}
        {planFollowupNode}
        {userInputNode}
        <WorkingIndicator
          isThinking={isThinking}
          processingStartedAt={processingStartedAt}
          lastDurationMs={lastDurationMs}
          hasItems={items.length > 0}
          reasoningLabel={latestReasoningLabel}
          showPollingFetchStatus={showPollingFetchStatus}
          pollingIntervalMs={pollingIntervalMs}
        />
        {!items.length && !userInputNode && !isThinking && !isLoadingMessages && (
          <div className="empty messages-empty">
            {threadId ? t("messages.emptyExistingThread") : t("messages.emptyNewThread")}
          </div>
        )}
        {!items.length && !userInputNode && !isThinking && isLoadingMessages && (
          <div className="empty messages-empty">
            <div className="messages-loading-indicator" role="status" aria-live="polite">
              <span className="working-spinner" aria-hidden />
              <span className="messages-loading-label">{t("messages.loading")}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {showScrollToLatest && (
        <button
          type="button"
          className="messages-scroll-latest-button"
          onClick={scrollToLatest}
          aria-label={t("messages.scrollToLatest")}
          title={t("messages.scrollToLatest")}
        >
          <span aria-hidden>↓</span>
          <span>{t("messages.latest")}</span>
        </button>
      )}
    </div>
  );
});
