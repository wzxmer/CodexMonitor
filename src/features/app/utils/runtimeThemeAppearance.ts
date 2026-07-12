import type { AppSettings, ThemePreference } from "@/types";
import { CONVERSATION_STYLE_PRESETS } from "@/features/messages/utils/conversationStylePresets";

type ResolvedTheme = Exclude<ThemePreference, "system">;

export type ConversationAppearance = Pick<
  AppSettings,
  | "messageCanvasColor"
  | "messageUserBubbleColor"
  | "messageUserTextColor"
  | "messageAssistantBubbleColor"
  | "messageAssistantAccentColor"
  | "messageAssistantTextColor"
> & {
  composerInputBackgroundColor?: string;
};

const WHITE_COMPOSER_CANVAS_COLORS = new Set(
  CONVERSATION_STYLE_PRESETS.filter(
    (preset) => preset.id === "native-white" || preset.id === "native-light",
  ).map((preset) => preset.settings.messageCanvasColor.toLowerCase()),
);

function resolveComposerInputBackgroundColor(messageCanvasColor: string): string | undefined {
  return WHITE_COMPOSER_CANVAS_COLORS.has(messageCanvasColor.toLowerCase())
    ? "#ffffff"
    : undefined;
}

const blackOrangePreset = CONVERSATION_STYLE_PRESETS.find(
  (preset) => preset.id === "cli-ember",
)?.settings;

export function resolveRuntimeThemeAppearance(
  settings: AppSettings,
  resolvedTheme: ResolvedTheme,
): {
  themeAccent: AppSettings["themeAccent"];
  conversationAppearance: ConversationAppearance;
} {
  const conversationAppearance: ConversationAppearance = {
    messageCanvasColor: settings.messageCanvasColor,
    messageUserBubbleColor: settings.messageUserBubbleColor,
    messageUserTextColor: settings.messageUserTextColor,
    messageAssistantBubbleColor: settings.messageAssistantBubbleColor,
    messageAssistantAccentColor: settings.messageAssistantAccentColor,
    messageAssistantTextColor: settings.messageAssistantTextColor,
    composerInputBackgroundColor: resolveComposerInputBackgroundColor(
      settings.messageCanvasColor,
    ),
  };

  if (settings.theme !== "system" || resolvedTheme !== "dark" || !blackOrangePreset) {
    return {
      themeAccent: settings.themeAccent,
      conversationAppearance,
    };
  }

  return {
    themeAccent: "orange",
    conversationAppearance: {
      messageCanvasColor: blackOrangePreset.messageCanvasColor,
      messageUserBubbleColor: blackOrangePreset.messageUserBubbleColor,
      messageUserTextColor: blackOrangePreset.messageUserTextColor,
      messageAssistantBubbleColor: blackOrangePreset.messageAssistantBubbleColor,
      messageAssistantAccentColor: blackOrangePreset.messageAssistantAccentColor,
      messageAssistantTextColor: blackOrangePreset.messageAssistantTextColor,
      composerInputBackgroundColor: resolveComposerInputBackgroundColor(
        blackOrangePreset.messageCanvasColor,
      ),
    },
  };
}
