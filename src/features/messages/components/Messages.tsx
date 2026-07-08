import { memo, useCallback, useMemo, useState, type CSSProperties } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
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
  parseReasoning,
  type MessageListBaseEntry,
  type ProcessGroup,
  type ToolGroup,
} from "../utils/messageRenderUtils";
import { useI18n } from "@/features/i18n/I18nProvider";
import {
  DiffRow,
  ExploreRow,
  formatCliTimestamp,
  MessageRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  UserInputRow,
  WorkingIndicator,
} from "./MessageRows";
import { useMessagesViewState } from "./useMessagesViewState";

function timestampFromItem(item: ConversationItem) {
  if (
    item.kind === "message" &&
    typeof item.createdAt === "number" &&
    Number.isFinite(item.createdAt)
  ) {
    return item.createdAt;
  }
  const match = item.id.match(/\d{13}/);
  if (!match) {
    return null;
  }
  const timestamp = Number(match[0]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function timestampFromToolGroup(group: ToolGroup) {
  for (const item of group.items) {
    const timestamp = timestampFromItem(item);
    if (timestamp !== null) {
      return timestamp;
    }
  }
  return null;
}

function timestampFromBaseEntry(entry: MessageListBaseEntry) {
  if (entry.kind === "item") {
    return timestampFromItem(entry.item);
  }
  return timestampFromToolGroup(entry.group);
}

function timestampFromProcessGroup(group: ProcessGroup) {
  for (const entry of group.entries) {
    const timestamp = timestampFromBaseEntry(entry);
    if (timestamp !== null) {
      return timestamp;
    }
  }
  return null;
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
  messageFontFamily?: string;
  messageFontSize?: number;
  messageFontWeight?: number;
  chatHistoryScrollbackItems?: number | null;
  interruptedStatus?: { timestamp: number } | null;
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
    messageFontFamily?: string;
    messageFontSize?: number;
    messageFontWeight?: number;
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
  onResendUserMessage?: (
    text: string,
    images?: string[],
    options?: { replaceMessageId?: string },
  ) => void;
};

const CONVERSATION_STYLE_PRESETS: Array<{
  id: string;
  titleKey:
    | "stylePreset.nativeWhite.title"
    | "stylePreset.nativeLight.title"
    | "stylePreset.nativeDark.title"
    | "stylePreset.cliEmber.title";
  subtitleKey:
    | "stylePreset.nativeWhite.subtitle"
    | "stylePreset.nativeLight.subtitle"
    | "stylePreset.nativeDark.subtitle"
    | "stylePreset.cliEmber.subtitle";
  swatch: string;
  settings: Parameters<NonNullable<MessagesProps["onUpdateConversationStyle"]>>[0];
}> = [
  {
    id: "native-white",
    titleKey: "stylePreset.nativeWhite.title",
    subtitleKey: "stylePreset.nativeWhite.subtitle",
    swatch: "linear-gradient(135deg, #ffffff 0%, #ffffff 62%, #f28b3c 100%)",
    settings: {
      messageCanvasColor: "#ffffff",
      messageUserBubbleColor: "#fff7ed",
      messageUserTextColor: "#2e2118",
      messageAssistantBubbleColor: "#ffffff",
      messageAssistantAccentColor: "#f28b3c",
      messageAssistantTextColor: "#201a16",
    },
  },
  {
    id: "native-light",
    titleKey: "stylePreset.nativeLight.title",
    subtitleKey: "stylePreset.nativeLight.subtitle",
    swatch: "linear-gradient(135deg, #fffaf5 0%, #f4efe8 58%, #f28b3c 100%)",
    settings: {
      messageCanvasColor: "#fffaf5",
      messageUserBubbleColor: "#fff4e8",
      messageUserTextColor: "#332519",
      messageAssistantBubbleColor: "#ffffff",
      messageAssistantAccentColor: "#f28b3c",
      messageAssistantTextColor: "#2d241d",
    },
  },
  {
    id: "native-dark",
    titleKey: "stylePreset.nativeDark.title",
    subtitleKey: "stylePreset.nativeDark.subtitle",
    swatch: "linear-gradient(135deg, #171513 0%, #25201b 62%, #f28b3c 100%)",
    settings: {
      messageCanvasColor: "#12100e",
      messageUserBubbleColor: "#3a2617",
      messageUserTextColor: "#fff1df",
      messageAssistantBubbleColor: "#181512",
      messageAssistantAccentColor: "#f28b3c",
      messageAssistantTextColor: "#f1e7dc",
    },
  },
  {
    id: "cli-ember",
    titleKey: "stylePreset.cliEmber.title",
    subtitleKey: "stylePreset.cliEmber.subtitle",
    swatch: "linear-gradient(135deg, #151719 0%, #24211d 58%, #ff9f43 100%)",
    settings: {
      messageCanvasColor: "#111315",
      messageUserBubbleColor: "#3a2a1d",
      messageUserTextColor: "#fff3df",
      messageAssistantBubbleColor: "#1b1b1c",
      messageAssistantAccentColor: "#ff9f43",
      messageAssistantTextColor: "#f6e7cf",
    },
  },
];

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
  messageFontFamily = "",
  messageFontSize = 13,
  messageFontWeight = 500,
  chatHistoryScrollbackItems = null,
  interruptedStatus = null,
  onUpdateConversationStyle,
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onQuoteMessage,
  onResendUserMessage,
}: MessagesProps) {
  const { t } = useI18n();
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
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
    expandedItems,
    toggleExpanded,
    collapsedToolGroups,
    toggleToolGroup,
    isToolGroupsAutoCollapsed,
    setToolGroupsAutoCollapsed,
    copiedMessageId,
    handleCopyMessage,
    handleQuoteMessage,
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
    onPlanAccept,
    onPlanSubmitChanges,
    onQuoteMessage,
  });
  const messagesStyle = useMemo(
    () =>
      ({
        "--conversation-canvas": messageCanvasColor,
        "--conversation-user-color": messageUserBubbleColor,
        "--conversation-user-text": messageUserTextColor,
        "--conversation-assistant-bg": messageAssistantBubbleColor,
        "--conversation-assistant-accent": messageAssistantAccentColor,
        "--conversation-assistant-text": messageAssistantTextColor,
        "--conversation-font-family": messageFontFamily || "var(--message-font-family)",
        "--message-font-size": `${messageFontSize}px`,
        "--message-font-weight": `${messageFontWeight}`,
      }) as CSSProperties,
    [
      messageAssistantAccentColor,
      messageAssistantBubbleColor,
      messageAssistantTextColor,
      messageCanvasColor,
      messageFontFamily,
      messageFontSize,
      messageFontWeight,
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
  const showScrollbackNotice =
    typeof chatHistoryScrollbackItems === "number" &&
    chatHistoryScrollbackItems > 0 &&
    items.length > chatHistoryScrollbackItems;
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

  const shouldSuppressGroupedCliTimestamp = (
    item: ConversationItem,
    groupTimestampText: string,
    isFirstInGroup: boolean,
  ) => {
    if (!isFirstInGroup || !groupTimestampText || item.kind !== "message") {
      return false;
    }
    const itemTimestamp = timestampFromItem(item);
    return itemTimestamp !== null && formatCliTimestamp(itemTimestamp) === groupTimestampText;
  };

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
          onQuote={onQuoteMessage ? handleQuoteMessage : undefined}
          onResendUserMessage={
            onResendUserMessage
              ? (message, text) =>
                  onResendUserMessage(text, message.images ?? [], {
                    replaceMessageId: message.id,
                  })
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
              className="messages-style-menu"
              onBlur={(event) => {
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
                              {t(preset.titleKey)}
                            </span>
                            <span className="messages-scheme-preset-subtitle">
                              {t(preset.subtitleKey)}
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
                  <label>
                    <span>{t("messages.font")}</span>
                    <input
                      type="text"
                      value={messageFontFamily}
                      placeholder="Segoe UI, Microsoft YaHei UI"
                      onChange={(event) =>
                        updateConversationStyle({
                          messageFontFamily: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      {t("messages.fontSize")} {messageFontSize}px
                    </span>
                    <input
                      type="range"
                      min={12}
                      max={18}
                      step={1}
                      value={messageFontSize}
                      onChange={(event) =>
                        updateConversationStyle({
                          messageFontSize: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      {t("messages.fontWeight")} {messageFontWeight}
                    </span>
                    <input
                      type="range"
                      min={400}
                      max={650}
                      step={50}
                      value={messageFontWeight}
                      onChange={(event) =>
                        updateConversationStyle({
                          messageFontWeight: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
        {showScrollbackNotice && (
          <div className="messages-history-notice" role="note">
            {t("messages.historyLimitNotice")
              .replace("{count}", String(chatHistoryScrollbackItems))
              .replace("{total}", String(items.length))}
          </div>
        )}
        {groupedItems.map((entry) => {
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
            const groupTimestamp = timestampFromProcessGroup(group);
            const groupTimestampText =
              groupTimestamp === null ? "" : formatCliTimestamp(groupTimestamp);
            const groupBodyId = `tool-group-${group.id}`;
            const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <div
                key={`process-group-${group.id}`}
                className={`tool-group process-group ${
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
                    <span className="tool-group-summary">{summaryText}</span>
                  </button>
                  {groupTimestampText && (
                    <span className="tool-group-timestamp">{groupTimestampText}</span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="tool-group-body" id={groupBodyId}>
                    {group.entries.map((processEntry, processEntryIndex) => {
                      if (processEntry.kind === "toolGroup") {
                        return (
                          <div
                            key={`nested-tool-group-${processEntry.group.id}`}
                            className="tool-group process-group-nested"
                          >
                            <div className="tool-group-body">
                              {processEntry.group.items.map((nestedItem, nestedIndex) =>
                                renderItem(nestedItem, {
                                  suppressCliTimestamp: shouldSuppressGroupedCliTimestamp(
                                    nestedItem,
                                    groupTimestampText,
                                    processEntryIndex === 0 && nestedIndex === 0,
                                  ),
                                }),
                              )}
                            </div>
                          </div>
                        );
                      }
                      return renderItem(processEntry.item, {
                        suppressCliTimestamp: shouldSuppressGroupedCliTimestamp(
                          processEntry.item,
                          groupTimestampText,
                          processEntryIndex === 0,
                        ),
                      });
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
            const groupTimestamp = timestampFromToolGroup(group);
            const groupTimestampText =
              groupTimestamp === null ? "" : formatCliTimestamp(groupTimestamp);
            const groupBodyId = `tool-group-${group.id}`;
            const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <div
                key={`tool-group-${group.id}`}
                className={`tool-group ${isCollapsed ? "tool-group-collapsed" : ""}`}
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
                    <span className="tool-group-summary">{summaryText}</span>
                  </button>
                  {groupTimestampText && (
                    <span className="tool-group-timestamp">{groupTimestampText}</span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="tool-group-body" id={groupBodyId}>
                    {group.items.map((item, index) =>
                      renderItem(item, {
                        suppressCliTimestamp: shouldSuppressGroupedCliTimestamp(
                          item,
                          groupTimestampText,
                          index === 0,
                        ),
                      }),
                    )}
                  </div>
                )}
              </div>
            );
          }
          return renderItem(entry.item);
        })}
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
