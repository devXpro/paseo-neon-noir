import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, type ViewStyle } from "react-native";
import { systemFill } from "../ui.ts";

const WIDTH = 51;
const HEIGHT = 31;
const KNOB = 27;
const INSET = (HEIGHT - KNOB) / 2;
const KNOB_COLOR = "#FFFFFF";
const WEB_KNOB: ViewStyle | null =
  Platform.OS === "web" ? { boxShadow: "0 1px 2px rgba(0, 0, 0, 0.3), 0 3px 8px rgba(0, 0, 0, 0.25)" } : null;

/**
 * An iOS switch drawn in Views, so the desktop shows the phone's control: React Native Web's own
 * Switch is a Material one. 51 × 31 with a 27 pt white knob, the track in systemFill when off and
 * the accent when on; the knob is finished like the slider's thumb.
 */
export function Toggle({
  value,
  label,
  theme,
  onValueChange,
}: {
  value: boolean;
  label: string;
  theme: PluginTheme;
  onValueChange(value: boolean): void;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    // The native driver cannot animate colour, and the knob and the track ride one value.
    const animation = Animated.timing(progress, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [progress, value]);

  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [systemFill(theme), theme.colors.accent] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, WIDTH - KNOB - INSET * 2] });
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
    >
      <Animated.View style={[styles.track, { backgroundColor }]}>
        <Animated.View
          style={[styles.knob, WEB_KNOB, { borderColor: theme.colors.border, transform: [{ translateX }] }]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, padding: INSET },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: KNOB_COLOR,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
