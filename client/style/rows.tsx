import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Children, Fragment, useMemo, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Slider, type SliderProps } from "../components/slider.tsx";
import { Toggle } from "../components/toggle.tsx";
import {
  FONT,
  INERT_OPACITY,
  ROW_FONT,
  ROW_HEIGHT,
  SPACE,
  cardStyle,
  highlight,
  sectionHeaderStyle,
  separatorStyle,
  type PressState,
} from "../ui.ts";

/**
 * A slider row on the desktop is one line, as in macOS's settings: the label, the slider, the
 * value. On the phone the label and the value sit above a full-width slider, as on iOS.
 */
const INLINE_SLIDERS = Platform.OS === "web";
const INLINE_LABEL_WIDTH = 92;
const INLINE_VALUE_WIDTH = 40;

function useRowStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        group: { gap: SPACE.small },
        header: sectionHeaderStyle(theme),
        footer: { paddingHorizontal: SPACE.large, fontSize: FONT.footnote, lineHeight: 18, color: theme.colors.foregroundMuted },
        card: cardStyle(theme),
        separator: separatorStyle(theme),
        row: {
          minHeight: ROW_HEIGHT,
          paddingHorizontal: SPACE.large,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACE.medium,
        },
        pressable: { borderRadius: 12 },
        label: { flexShrink: 1, fontSize: ROW_FONT, color: theme.colors.foreground },
        detail: { fontSize: ROW_FONT, color: theme.colors.foregroundMuted, fontVariant: ["tabular-nums"] },
        sliderRow: { paddingHorizontal: SPACE.large, paddingTop: 11, paddingBottom: 2 },
        sliderLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.medium },
        sliderInline: { minHeight: ROW_HEIGHT, paddingHorizontal: SPACE.large, flexDirection: "row", alignItems: "center", gap: SPACE.medium },
        inlineLabel: { width: INLINE_LABEL_WIDTH, fontSize: ROW_FONT, color: theme.colors.foreground },
        inlineSlider: { flex: 1, minWidth: 0 },
        inlineValue: { width: INLINE_VALUE_WIDTH, textAlign: "right" },
        accent: { fontSize: ROW_FONT, color: theme.colors.accent },
        danger: { fontSize: ROW_FONT, color: theme.colors.statusDanger },
        muted: { color: theme.colors.foregroundMuted },
        inert: { opacity: INERT_OPACITY },
        stepper: {
          flexDirection: "row",
          alignItems: "center",
          height: 32,
          borderRadius: 8,
          backgroundColor: theme.colors.surface2,
          overflow: "hidden",
        },
        stepperButton: { width: 44, height: 32, alignItems: "center", justifyContent: "center" },
        stepperDivider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: theme.colors.border },
        stepperLeft: { flexShrink: 1, gap: 2 },
      }),
    [theme],
  );
}

/** A heading, a grouped card with inset lines between its rows, and a footnote under it. */
export function Group({
  theme,
  title,
  footer,
  children,
}: {
  theme: PluginTheme;
  title?: string;
  footer?: string | null;
  children: ReactNode;
}) {
  const styles = useRowStyles(theme);
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title === undefined ? null : (
        <Text style={styles.header} accessibilityRole="header">
          {title}
        </Text>
      )}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function SwitchRow({
  theme,
  label,
  value,
  onChange,
}: {
  theme: PluginTheme;
  label: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  const styles = useRowStyles(theme);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Toggle value={value} label={label} theme={theme} onValueChange={onChange} />
    </View>
  );
}

/** One choice of several: a check mark on the right, as in iOS Settings. */
export function CheckRow({
  theme,
  label,
  detail,
  selected,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  detail?: string;
  selected: boolean;
  onPress(): void;
}) {
  const styles = useRowStyles(theme);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={(state: PressState) => [styles.row, styles.pressable, highlight(theme, state)]}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.small }}>
        {detail === undefined ? null : <Text style={styles.detail}>{detail}</Text>}
        <View style={{ width: 18, alignItems: "center" }}>
          {selected ? <Icon name="Check" size={18} color={theme.colors.accent} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * A label, its slider and the value read out in muted tabular figures; a hue slider reads out
 * nothing, its thumb shows the colour. Saves when the finger lifts.
 */
export function SliderRow({
  theme,
  label,
  value,
  min,
  max,
  step,
  format,
  spectrum,
  magnet,
  disabled = false,
  onStart,
  onMove,
  onEnd,
}: {
  theme: PluginTheme;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as it reads; left out for a hue. */
  format?: (value: number) => string;
  spectrum?: SliderProps["spectrum"];
  magnet?: SliderProps["magnet"];
  /** Nothing it could do now: the row is dimmed and the slider left alone. */
  disabled?: boolean;
  onStart(): void;
  onMove(value: number): void;
  onEnd(value: number): void;
}) {
  const styles = useRowStyles(theme);
  const text = format ? format(value) : `${Math.round(value)}°`;
  const dim = disabled ? styles.inert : null;
  const slider = (
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      label={label}
      valueText={text}
      spectrum={spectrum}
      magnet={magnet}
      disabled={disabled}
      theme={theme}
      onStart={onStart}
      onChange={onMove}
      onEnd={onEnd}
    />
  );
  if (INLINE_SLIDERS) {
    return (
      <View style={styles.sliderInline}>
        <Text style={[styles.inlineLabel, dim]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.inlineSlider}>{slider}</View>
        {/* Kept for a hue too, so every slider in a card ends at one edge. */}
        <Text style={[styles.detail, styles.inlineValue, dim]} numberOfLines={1}>
          {format ? text : ""}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderLine}>
        <Text style={[styles.label, dim]}>{label}</Text>
        {format ? <Text style={[styles.detail, dim]}>{text}</Text> : null}
      </View>
      {slider}
    </View>
  );
}

/** An iOS stepper: minus and plus in one rounded control, the value beside the label. */
export function StepperRow({
  theme,
  label,
  value,
  note,
  min,
  max,
  onChange,
}: {
  theme: PluginTheme;
  label: string;
  value: number;
  /** Under the label, e.g. "Paseo's default". */
  note?: string;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  const styles = useRowStyles(theme);
  const button = (glyph: "Minus" | "Plus", next: number, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${glyph === "Minus" ? "Smaller" : "Larger"} ${label.toLowerCase()}`}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={() => onChange(next)}
      style={(state: PressState) => [styles.stepperButton, enabled ? highlight(theme, state) : null]}
    >
      <Icon name={glyph} size={16} color={enabled ? theme.colors.foreground : theme.colors.border} />
    </Pressable>
  );
  return (
    <View style={styles.row} accessibilityLabel={`${label}, ${value} points`}>
      <View style={styles.stepperLeft}>
        <Text style={styles.label}>
          {label} <Text style={styles.detail}>{value} pt</Text>
        </Text>
        {note === undefined ? null : <Text style={[styles.footer, { paddingHorizontal: 0 }]}>{note}</Text>}
      </View>
      <View style={styles.stepper}>
        {button("Minus", value - 1, value > min)}
        <View style={styles.stepperDivider} />
        {button("Plus", value + 1, value < max)}
      </View>
    </View>
  );
}

export function ActionRow({
  theme,
  label,
  tone = "accent",
  disabled = false,
  trailing,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  tone?: "accent" | "danger";
  disabled?: boolean;
  /** Muted text on the right, e.g. the current state. */
  trailing?: string;
  onPress(): void;
}) {
  const styles = useRowStyles(theme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state: PressState) => [styles.row, styles.pressable, disabled ? null : highlight(theme, state)]}
    >
      <Text style={[tone === "danger" ? styles.danger : styles.accent, disabled && styles.muted]}>{label}</Text>
      {trailing === undefined ? null : <Text style={styles.detail}>{trailing}</Text>}
    </Pressable>
  );
}

/** A label and its current value, nothing to press. */
export function ValueRow({ theme, label, value }: { theme: PluginTheme; label: string; value: string }) {
  const styles = useRowStyles(theme);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.detail}>{value}</Text>
    </View>
  );
}

/** A plain line of text inside a card: an empty list, a state. */
export function NoteRow({ theme, text }: { theme: PluginTheme; text: string }) {
  const styles = useRowStyles(theme);
  return (
    <View style={styles.row}>
      <Text style={[styles.detail, { flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}
