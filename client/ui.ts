import type { PluginTheme } from "@getpaseo/plugin";
import { Platform, StyleSheet, type PressableStateCallbackType, type TextStyle, type ViewStyle } from "react-native";

/** The iOS type ramp the studio keeps to. */
export const FONT = { body: 17, subhead: 15, footnote: 13, caption: 11 } as const;
/** Text in a grouped card's rows: the iPhone's 17 pt body, the desktop's 14. */
export const ROW_FONT = Platform.OS === "web" ? 14 : 17;
export const SPACE = { large: 16, medium: 12, small: 8 } as const;
/** Between two grouped cards, header to footer. */
export const GROUP_GAP = 24;
/** iOS rows are at least this tall: the smallest comfortable touch target. */
export const ROW_HEIGHT = 44;
/** A control that would change nothing now: dimmed and left alone, as iOS shows one. */
export const INERT_OPACITY = 0.4;

/** Pressable state on the web also carries `hovered`, which React Native's types leave out. */
export type PressState = PressableStateCallbackType & { hovered?: boolean };

/** A colour at this opacity: "#RGB" and "#RRGGBB" become "#RRGGBBAA"; anything else comes back as it is. */
export function alpha(color: string, opacity: number): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return color;
  return `${hex}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
}

/** iOS's systemFill: a slider's rail, a switch's off track, the selected segment. */
export const systemFill = (theme: PluginTheme) => alpha(theme.colors.foregroundMuted, 0.3);

/** A grouped inset card, as in iOS Settings. */
export function cardStyle(theme: PluginTheme): ViewStyle {
  return {
    borderRadius: 12,
    backgroundColor: theme.colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  };
}

/** The uppercase heading above a card. */
export function sectionHeaderStyle(theme: PluginTheme): TextStyle {
  return {
    color: theme.colors.foregroundMuted,
    fontSize: FONT.footnote,
    lineHeight: 18,
    fontWeight: "400",
    letterSpacing: 0,
    textTransform: "uppercase",
    paddingHorizontal: SPACE.large,
  };
}

/** The line between rows of a card, inset like iOS's. */
export function separatorStyle(theme: PluginTheme): ViewStyle {
  return { height: StyleSheet.hairlineWidth, marginLeft: SPACE.large, backgroundColor: theme.colors.border };
}

/** Press feedback: a quiet highlight, never a scale. */
export const highlight = (theme: PluginTheme, { pressed, hovered }: PressState): ViewStyle | null =>
  pressed || hovered ? { backgroundColor: theme.colors.surface2 } : null;
