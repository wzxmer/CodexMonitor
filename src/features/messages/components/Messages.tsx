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
import { formatCount, parseReasoning } from "../utils/messageRenderUtils";
import {
  DiffRow,
  ExploreRow,
  MessageRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  UserInputRow,
  WorkingIndicator,
} from "./MessageRows";
import { useMessagesViewState } from "./useMessagesViewState";

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
  title: string;
  subtitle: string;
  swatch: string;
  settings: Parameters<NonNullable<MessagesProps["onUpdateConversationStyle"]>>[0];
}> = [
  {
    id: "native-white",
    title: "原生纯白",
    subtitle: "纯白背景，橙色点缀",
    swatch: "linear-gradient(135deg, #ffffff 0%, #ffffff 62%, #f28b3c 100%)",
    settings: {
      theme: "light",
      themeAccent: "codex",
      messageReadingStyle: "codex",
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
    title: "原生亮色",
    subtitle: "暖白护眼，橙色强调",
    swatch: "linear-gradient(135deg, #fffaf5 0%, #f4efe8 58%, #f28b3c 100%)",
    settings: {
      theme: "light",
      themeAccent: "codex",
      messageReadingStyle: "codex",
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
    title: "原生暗色",
    subtitle: "深底低刺激",
    swatch: "linear-gradient(135deg, #171513 0%, #25201b 62%, #f28b3c 100%)",
    settings: {
      theme: "dark",
      themeAccent: "codex",
      messageReadingStyle: "codex",
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
    title: "CLI 暗黑",
    subtitle: "黑橙终端感",
    swatch: "linear-gradient(135deg, #070604 0%, #15100b 55%, #ff9f43 100%)",
    settings: {
      theme: "dark",
      themeAccent: "orange",
      messageReadingStyle: "cli",
      messageCanvasColor: "#070604",
      messageUserBubbleColor: "#3a210c",
      messageUserTextColor: "#fff3df",
      messageAssistantBubbleColor: "#0a0805",
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
  onUpdateConversationStyle,
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onQuoteMessage,
  onResendUserMessage,
}: MessagesProps) {
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

  const renderItem = (item: ConversationItem) => {
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
          <div className="messages-tool-controls" aria-label="对话阅读样式">
            <div className="messages-reading-segmented" role="group" aria-label="阅读样式">
              {(["bubble", "codex", "cli"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={messageReadingStyle === style ? "is-selected" : ""}
                  onClick={() => updateConversationStyle({ messageReadingStyle: style })}
                >
                  {style === "bubble" ? "气泡" : style === "codex" ? "原生" : "CLI"}
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
              aria-label={`工具调用自动收起：${isToolGroupsAutoCollapsed ? "开" : "关"}`}
              title={`工具调用自动收起：${isToolGroupsAutoCollapsed ? "开" : "关"}`}
            >
              自动收起：{isToolGroupsAutoCollapsed ? "开" : "关"}
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
                样式
              </button>
              {stylePanelOpen && (
                <div className="messages-style-popover" role="dialog" aria-label="对话样式">
                  <div className="messages-style-section">
                    <div className="messages-style-section-title">风格方案</div>
                    <div
                      className="messages-scheme-presets"
                      role="group"
                      aria-label="风格方案"
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
                              {preset.title}
                            </span>
                            <span className="messages-scheme-preset-subtitle">
                              {preset.subtitle}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="messages-style-section">
                    <div className="messages-style-section-title">AI 主题</div>
                    <div className="messages-color-presets" role="group" aria-label="AI 主题">
                      {[
                        { label: "默认蓝", bg: "#f7f9fc", accent: "#7dadff", text: "#263040" },
                        { label: "青绿", bg: "#f0faf6", accent: "#4aa389", text: "#24332f" },
                        { label: "柔紫", bg: "#f7f2ff", accent: "#9a7bd8", text: "#302a3d" },
                        { label: "暖棕", bg: "#fff6ee", accent: "#d18455", text: "#3b2d25" },
                      ].map((preset) => (
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
                    <div className="messages-style-section-title">我的消息</div>
                    <div className="messages-color-presets" role="group" aria-label="我的消息配色">
                      {[
                        { label: "暖杏", color: "#f3d6ad", text: "#332519" },
                        { label: "浅蓝", color: "#d9ebff", text: "#102033" },
                        { label: "浅绿", color: "#dff3e8", text: "#183126" },
                        { label: "浅紫", color: "#eadcf8", text: "#2e2140" },
                        { label: "浅粉", color: "#f6e2e2", text: "#3a2222" },
                      ].map((preset) => (
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
                      <span>AI 背景</span>
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
                      <span>AI 文字</span>
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
                      <span>我的背景</span>
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
                      <span>我的文字</span>
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
                      <span>AI 强调</span>
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
                    <span>字体</span>
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
                    <span>字号 {messageFontSize}px</span>
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
                    <span>字重 {messageFontWeight}</span>
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
        {groupedItems.map((entry) => {
          if (entry.kind === "processGroup") {
            const { group } = entry;
            const isCollapsed = collapsedToolGroups.has(group.id);
            const summaryParts = [];
            if (group.toolCount > 0) {
              summaryParts.push(formatCount(group.toolCount, "次工具调用", "次工具调用"));
            }
            if (group.messageCount > 0) {
              summaryParts.push(formatCount(group.messageCount, "条过程消息", "条过程消息"));
            }
            const summaryText = summaryParts.length > 0 ? summaryParts.join(", ") : "过程消息";
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
                    aria-label={isCollapsed ? "展开过程消息" : "收起过程消息"}
                  >
                    <span className="tool-group-chevron" aria-hidden>
                      <ChevronIcon size={14} />
                    </span>
                    <span className="tool-group-summary">{summaryText}</span>
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
                              {processEntry.group.items.map(renderItem)}
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
              summaryParts.push(formatCount(group.toolCount, "次工具调用", "次工具调用"));
            }
            if (group.messageCount > 0) {
              summaryParts.push(formatCount(group.messageCount, "条消息", "条消息"));
            }
            const summaryText = summaryParts.length > 0 ? summaryParts.join(", ") : "过程消息";
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
                    aria-label={isCollapsed ? "展开工具调用" : "收起工具调用"}
                  >
                    <span className="tool-group-chevron" aria-hidden>
                      <ChevronIcon size={14} />
                    </span>
                    <span className="tool-group-summary">{summaryText}</span>
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="tool-group-body" id={groupBodyId}>
                    {group.items.map(renderItem)}
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
            {threadId ? "发送提示词给 Agent。" : "发送提示词，启动新 Agent。"}
          </div>
        )}
        {!items.length && !userInputNode && !isThinking && isLoadingMessages && (
          <div className="empty messages-empty">
            <div className="messages-loading-indicator" role="status" aria-live="polite">
              <span className="working-spinner" aria-hidden />
              <span className="messages-loading-label">加载中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
