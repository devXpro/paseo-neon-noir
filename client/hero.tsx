import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../shared/engine.ts";
import type { Preset } from "../shared/presets.ts";
import { fontById } from "../shared/style.ts";
import { HeroMock, Mock } from "./components/mock.tsx";
import { useFontPreview } from "./style/gallery.tsx";
import type { StyleRuntime } from "./style/runtime.ts";
import { FONT, SPACE, cardStyle, type PressState } from "./ui.ts";

/** The compact hero is one 88 pt row; its window is a tile's, 64 × 43. */
const COMPACT_HEIGHT = 88;
const MINI = { width: 64, height: 43 } as const;
const HERO_MOCK_WIDTH = 300;

/** The last two words held together, so a wrapped tagline never ends on one word alone. */
const withoutOrphan = (text: string) => text.replace(/ (?=\S+$)/, "\u00A0");

/**
 * The look being edited: a mock in its colours beside the preset's name and tagline. It follows
 * every edit at once, a frame ahead of the app's own repaint. Compact, it is one row with a small
 * window; wide, the window is drawn with live text. The name and the mock's text are set in the
 * preset's font pair, once loaded, so the preset shows its typography too.
 */
export function Hero({
  theme,
  runtime,
  preset,
  colors,
  edited,
  compact,
}: {
  theme: PluginTheme;
  runtime: StyleRuntime;
  preset: Preset;
  colors: ThemeColors;
  edited: boolean;
  compact: boolean;
}) {
  const uiFamily = useFontPreview(runtime, fontById(preset.fonts.ui), true, true);
  const codeFamily = useFontPreview(runtime, fontById(preset.fonts.code), !compact);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: cardStyle(theme),
        body: compact
          ? {
              // The card's hairlines count toward the row's 88.
              minHeight: COMPACT_HEIGHT - 2 * StyleSheet.hairlineWidth,
              flexDirection: "row",
              alignItems: "center",
              gap: SPACE.medium,
              paddingHorizontal: SPACE.large,
              paddingVertical: SPACE.medium,
            }
          : { flexDirection: "row", alignItems: "center", gap: SPACE.large, padding: SPACE.large },
        mock: compact ? { width: MINI.width } : { width: HERO_MOCK_WIDTH, maxWidth: "55%" },
        text: { flex: 1, minWidth: 0, gap: compact ? 2 : 4 },
        nameLine: { flexDirection: "row", alignItems: "baseline", gap: SPACE.small },
        name: {
          flexShrink: 1,
          fontSize: compact ? 17 : 22,
          lineHeight: compact ? 22 : 28,
          fontWeight: "600",
          color: theme.colors.foreground,
        },
        edited: { fontSize: FONT.footnote, color: theme.colors.foregroundMuted },
        tagline: { fontSize: compact ? 13 : 15, lineHeight: compact ? 18 : 20, color: theme.colors.foregroundMuted },
      }),
    [theme, compact],
  );
  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <View style={styles.mock}>
          {compact ? (
            <Mock colors={colors} scale={MINI.width / 100} radius={6} aspectRatio={MINI.width / MINI.height} />
          ) : (
            <HeroMock colors={colors} fonts={{ ui: uiFamily, code: codeFamily }} />
          )}
        </View>
        <View style={styles.text}>
          <View style={styles.nameLine}>
            <Text
              style={[styles.name, uiFamily === null ? null : { fontFamily: uiFamily }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {preset.name}
            </Text>
            {edited ? <Text style={styles.edited}>Edited</Text> : null}
          </View>
          <Text style={styles.tagline} numberOfLines={compact ? 2 : 3}>
            {withoutOrphan(preset.tagline)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A slim line above the hero: what to do, or what went wrong, with at most one action. */
export function Banner({
  theme,
  tone,
  text,
  action,
}: {
  theme: PluginTheme;
  tone: "hint" | "error";
  text: string;
  action?: { label: string; onPress(): void };
}) {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        banner: {
          ...cardStyle(theme),
          minHeight: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.small,
          paddingHorizontal: SPACE.medium,
          paddingVertical: SPACE.small,
        },
        text: { flex: 1, fontSize: FONT.footnote, color: theme.colors.foreground },
        action: { paddingHorizontal: SPACE.small, paddingVertical: 4, borderRadius: 6 },
        actionPressed: { backgroundColor: theme.colors.surface2 },
        actionLabel: { fontSize: FONT.footnote, fontWeight: "600", color: theme.colors.accent },
      }),
    [theme],
  );
  return (
    <View style={styles.banner} accessibilityRole={tone === "error" ? "alert" : "summary"}>
      <Icon
        name={tone === "error" ? "CircleAlert" : "Info"}
        size={15}
        color={tone === "error" ? theme.colors.statusDanger : theme.colors.statusWarning}
      />
      <Text style={styles.text}>{text}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={action.onPress}
          style={({ pressed, hovered }: PressState) => [styles.action, (pressed || hovered) && styles.actionPressed]}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
