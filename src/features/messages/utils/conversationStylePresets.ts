import type { AppSettings } from "@/types";

export type ConversationStylePreset = {
  id: "native-white" | "native-light" | "native-dark" | "cli-ember";
  messageTitleKey:
    | "stylePreset.nativeWhite.title"
    | "stylePreset.nativeLight.title"
    | "stylePreset.nativeDark.title"
    | "stylePreset.cliEmber.title";
  messageSubtitleKey:
    | "stylePreset.nativeWhite.subtitle"
    | "stylePreset.nativeLight.subtitle"
    | "stylePreset.nativeDark.subtitle"
    | "stylePreset.cliEmber.subtitle";
  swatch: string;
  settings: Pick<
    AppSettings,
    | "theme"
    | "themeAccent"
    | "messageReadingStyle"
    | "messageCanvasColor"
    | "messageUserBubbleColor"
    | "messageUserTextColor"
    | "messageAssistantBubbleColor"
    | "messageAssistantAccentColor"
    | "messageAssistantTextColor"
  >;
};

export const CONVERSATION_STYLE_PRESETS: ConversationStylePreset[] = [
  {
    id: "native-white",
    messageTitleKey: "stylePreset.nativeWhite.title",
    messageSubtitleKey: "stylePreset.nativeWhite.subtitle",
    swatch: "linear-gradient(135deg, #ffffff 0%, #ffffff 62%, #f28b3c 100%)",
    settings: {
      theme: "light",
      themeAccent: "orange",
      messageReadingStyle: "native",
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
    messageTitleKey: "stylePreset.nativeLight.title",
    messageSubtitleKey: "stylePreset.nativeLight.subtitle",
    swatch: "linear-gradient(135deg, #fffaf5 0%, #f4efe8 58%, #f28b3c 100%)",
    settings: {
      theme: "light",
      themeAccent: "orange",
      messageReadingStyle: "native",
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
    messageTitleKey: "stylePreset.nativeDark.title",
    messageSubtitleKey: "stylePreset.nativeDark.subtitle",
    swatch: "linear-gradient(135deg, #171513 0%, #25201b 62%, #f28b3c 100%)",
    settings: {
      theme: "dark",
      themeAccent: "orange",
      messageReadingStyle: "native",
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
    messageTitleKey: "stylePreset.cliEmber.title",
    messageSubtitleKey: "stylePreset.cliEmber.subtitle",
    swatch: "linear-gradient(135deg, #151719 0%, #24211d 58%, #ff9f43 100%)",
    settings: {
      theme: "dark",
      themeAccent: "orange",
      messageReadingStyle: "cli",
      messageCanvasColor: "#111315",
      messageUserBubbleColor: "#3a2a1d",
      messageUserTextColor: "#fff3df",
      messageAssistantBubbleColor: "#1b1b1c",
      messageAssistantAccentColor: "#ff9f43",
      messageAssistantTextColor: "#f6e7cf",
    },
  },
];
