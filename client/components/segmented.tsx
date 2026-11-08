import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FONT, alpha, systemFill, type PressState } from "../ui.ts";

const HEIGHT = 32;
const INSET = 2;
const RADIUS = HEIGHT / 2;

/**
 * An iOS segmented control: a capsule of equal segments, the selected one filled with systemFill
 * and in semibold, no hairlines.
 */
export function Segmented<Value extends string>({
  options,
  value,
  theme,
  onChange,
}: {
  options: readonly { value: Value; label: string }[];
  value: Value;
  theme: PluginTheme;
  onChange(value: Value): void;
}) {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        track: {
          flexDirection: "row",
          height: HEIGHT,
          padding: INSET,
          borderRadius: RADIUS,
          backgroundColor: alpha(theme.colors.foregroundMuted, 0.12),
        },
        segment: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: RADIUS - INSET },
        selected: { backgroundColor: systemFill(theme) },
        hovered: { backgroundColor: alpha(theme.colors.foregroundMuted, 0.18) },
        label: { fontSize: FONT.footnote, fontWeight: "400", color: theme.colors.foreground },
        selectedLabel: { fontWeight: "600" },
      }),
    [theme],
  );
  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => onChange(option.value)}
            style={({ pressed, hovered }: PressState) => [
              styles.segment,
              selected ? styles.selected : pressed || hovered ? styles.hovered : null,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
