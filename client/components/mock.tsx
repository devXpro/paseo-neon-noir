import { useMemo } from "react";
import { Platform, StyleSheet, Text, View, type DimensionValue } from "react-native";
import type { ThemeColors } from "../../shared/engine.ts";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

/**
 * Paseo in miniature, in a theme's own colours: the sidebar on the background with its selected
 * row in `control`; the workspace on `raised` with the user's message in a `border` bubble, the
 * largest tinted shape in a real chat, then lines of text in foreground, muted and ring, and an
 * accent button whose label is the background, as Paseo paints its buttons. `scale` 1 is a tile.
 * Decoration only: hidden from screen readers.
 */
export function Mock({
  colors,
  radius,
  scale = 1,
  aspectRatio = 1.5,
}: {
  colors: ThemeColors;
  radius: number;
  scale?: number;
  aspectRatio?: number;
}) {
  const styles = useMemo(() => {
    const bar = (width: DimensionValue, height: number, color: string) => ({
      width,
      height: height * scale,
      borderRadius: (height * scale) / 2,
      backgroundColor: color,
    });
    return StyleSheet.create({
      root: {
        flexDirection: "row",
        aspectRatio,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: colors.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
      sidebar: {
        width: "31%",
        paddingTop: 7 * scale,
        paddingHorizontal: 4 * scale,
        gap: 4 * scale,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: colors.border,
      },
      sidebarLine: bar("72%", 3, colors.mutedForeground),
      sidebarLineShort: bar("54%", 3, colors.mutedForeground),
      selectedRow: {
        height: 9 * scale,
        borderRadius: 2.5 * scale,
        justifyContent: "center",
        paddingHorizontal: 3 * scale,
        backgroundColor: colors.control,
      },
      selectedLine: bar("70%", 3, colors.foreground),
      workspace: { flex: 1, padding: 7 * scale, gap: 4 * scale, backgroundColor: colors.raised },
      bubble: {
        alignSelf: "flex-end",
        width: "52%",
        height: 10 * scale,
        borderRadius: 5 * scale,
        justifyContent: "center",
        paddingHorizontal: 4 * scale,
        backgroundColor: colors.border,
      },
      bubbleLine: bar("78%", 2.5, colors.foreground),
      title: bar("74%", 3, colors.foreground),
      body: bar("58%", 3, colors.mutedForeground),
      note: bar("40%", 3, colors.ring),
      button: {
        alignSelf: "flex-end",
        marginTop: "auto",
        width: "40%",
        height: 10 * scale,
        borderRadius: 5 * scale,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accent,
      },
      buttonLabel: bar("52%", 2.5, colors.background),
    });
  }, [colors, radius, scale, aspectRatio]);

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.sidebar}>
        <View style={styles.sidebarLine} />
        <View style={styles.selectedRow}>
          <View style={styles.selectedLine} />
        </View>
        <View style={styles.sidebarLineShort} />
        <View style={styles.sidebarLine} />
      </View>
      <View style={styles.workspace}>
        <View style={styles.bubble}>
          <View style={styles.bubbleLine} />
        </View>
        <View style={styles.title} />
        <View style={styles.body} />
        <View style={styles.note} />
        <View style={styles.button}>
          <View style={styles.buttonLabel} />
        </View>
      </View>
    </View>
  );
}

/**
 * The hero's mock: the same window drawn with live text, so the look's type contrast reads as it
 * will in a chat. A message bubble in `border`, an answer with bold and a code chip on `control`,
 * a muted status line, a timestamp in `ring`, an accent button labelled in the background.
 * `fonts` sets its text and its code chip in a preset's pair; null keeps the system's.
 */
export function HeroMock({
  colors,
  fonts,
}: {
  colors: ThemeColors;
  fonts?: { ui: string | null; code: string | null };
}) {
  const ui = fonts?.ui ?? undefined;
  const code = fonts?.code ?? MONO;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flexDirection: "row",
          borderRadius: 10,
          overflow: "hidden",
          backgroundColor: colors.background,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        sidebar: {
          width: "30%",
          paddingVertical: 10,
          paddingHorizontal: 6,
          gap: 2,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: colors.border,
        },
        sideItem: { paddingHorizontal: 6, paddingVertical: 3, fontFamily: ui, fontSize: 11, color: colors.mutedForeground },
        sideSelected: { borderRadius: 5, backgroundColor: colors.control },
        sideSelectedText: { fontFamily: ui, fontSize: 11, color: colors.foreground },
        workspace: { flex: 1, padding: 10, gap: 7, backgroundColor: colors.raised },
        bubble: {
          alignSelf: "flex-end",
          maxWidth: "85%",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 12,
          backgroundColor: colors.border,
        },
        text: { fontFamily: ui, fontSize: 13, lineHeight: 17, color: colors.foreground },
        bold: { fontWeight: "700" },
        answer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
        together: { flexDirection: "row", alignItems: "center", gap: 4 },
        chip: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.control },
        code: { fontFamily: code, fontSize: 12, lineHeight: 16, color: colors.foreground },
        status: { fontFamily: ui, fontSize: 12, lineHeight: 16, color: colors.mutedForeground },
        footer: { marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        time: { fontFamily: ui, fontSize: 11, lineHeight: 14, color: colors.ring },
        button: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.accent },
        buttonLabel: { fontFamily: ui, fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.background },
      }),
    [colors, ui, code],
  );
  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.sidebar}>
        <Text style={styles.sideItem} numberOfLines={1}>
          Inbox
        </Text>
        <View style={styles.sideSelected}>
          <Text style={[styles.sideItem, styles.sideSelectedText]} numberOfLines={1}>
            neon-noir
          </Text>
        </View>
        <Text style={styles.sideItem} numberOfLines={1}>
          paseo
        </Text>
        <Text style={styles.sideItem} numberOfLines={1}>
          voice
        </Text>
      </View>
      <View style={styles.workspace}>
        <View style={styles.bubble}>
          <Text style={styles.text} numberOfLines={1}>
            Make it darker
          </Text>
        </View>
        <View style={styles.answer}>
          <Text style={[styles.text, styles.bold]}>Done.</Text>
          <Text style={styles.text}>Lowered</Text>
          {/* Wraps as one: the code chip never stands alone on the last line. */}
          <View style={styles.together}>
            <Text style={styles.text}>the</Text>
            <View style={styles.chip}>
              <Text style={styles.code}>background</Text>
            </View>
          </View>
        </View>
        <Text style={styles.status} numberOfLines={1}>
          Thinking · 3 files
        </Text>
        <View style={styles.footer}>
          <Text style={styles.time}>2m</Text>
          <View style={styles.button}>
            <Text style={styles.buttonLabel}>Allow</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
