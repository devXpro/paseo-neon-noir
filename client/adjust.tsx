import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { View } from "react-native";
import type { ThemeColors } from "../shared/engine.ts";
import type { Preset } from "../shared/presets.ts";
import { KNOBS, type KnobGroup, type KnobSpec, type Knobs } from "../shared/settings.ts";
import { snap } from "./components/slider.tsx";
import { hueColour, spectrumGradient } from "./hues.ts";
import { ActionRow, Group, SliderRow, SwitchRow } from "./style/rows.tsx";
import { GROUP_GAP } from "./ui.ts";
import type { KnobId } from "./use-studio.ts";

/** The second colour's group has no header: its switch row says what it is. */
const GROUPS: readonly { id: KnobGroup; title?: string; footer?: string }[] = [
  { id: "accent", title: "Accent" },
  { id: "background", title: "Background" },
  { id: "text", title: "Text" },
  { id: "second", footer: "Timestamps, placeholders, scrollbars and focus rings." },
];
const SECOND_COLOUR = "Second Colour";

/** A knob that changes nothing while another one is at 0: the tint's colour without tint, a hue without saturation. */
const inert = (knob: KnobSpec, knobs: Knobs) =>
  (knob.id === "field" && knobs.tint === 0) || (knob.id === "hue" && knobs.neon === 0);

/** An offset hue snaps to the accent's own from this close. */
const MAGNET = { at: 0, within: 4 } as const;

const percent = (knob: KnobSpec) => (value: number) => `${Math.round(((value - knob.min) / (knob.max - knob.min)) * 100)}%`;
const midpoint = (knob: KnobSpec) => snap((knob.min + knob.max) / 2, knob.min, knob.max, knob.step);

/**
 * The value a nullable knob had before it was switched off, per preset, so switching it back on
 * restores it; kept outside the panel, which a repaint remounts.
 */
const remembered = new Map<string, number>();

/**
 * The knobs in their groups, each a slider in KNOBS order. A hue slider shows the spectrum: the
 * accent's runs round the whole circle, the tint's and the second colour's are offsets centred on
 * the accent and turn with it. The second colour has a switch; off is a neutral grey.
 */
export function AdjustPanel({
  theme,
  preset,
  knobs,
  colors,
  edited,
  onStart,
  onMove,
  onEnd,
  onSet,
  onReset,
}: {
  theme: PluginTheme;
  preset: Preset;
  knobs: Knobs;
  colors: ThemeColors;
  /** The knobs differ from the preset's own: Reset has something to do. */
  edited: boolean;
  onStart(): void;
  onMove(id: KnobId, value: number): void;
  onEnd(id: KnobId, value: number): void;
  onSet(id: KnobId, value: number | null): void;
  onReset(): void;
}) {
  const offsetGradient = useMemo(() => spectrumGradient(knobs.hue - 180), [knobs.hue]);
  const absolute = useMemo(() => ({ gradient: spectrumGradient(0), edge: hueColour(0), thumb: colors.accent }), [colors.accent]);

  const slider = (knob: KnobSpec) => {
    const value = knobs[knob.id];
    const key = `${preset.id}:${knob.id}`;
    if (value !== null) remembered.set(key, value);
    const resting = value ?? remembered.get(key) ?? midpoint(knob);
    const spectrum =
      knob.hue === "absolute"
        ? absolute
        : knob.hue === "offset"
          ? {
              gradient: offsetGradient,
              edge: hueColour(knobs.hue + 180),
              // The ring is a colour of its own; the tint barely shows on the background, so its hue does.
              thumb: knob.id === "ring" ? colors.ring : hueColour(knobs.hue + resting),
            }
          : undefined;
    return (
      <SliderRow
        key={knob.id}
        theme={theme}
        label={knob.label}
        value={resting}
        min={knob.min}
        max={knob.max}
        step={knob.step}
        format={spectrum ? undefined : percent(knob)}
        spectrum={spectrum}
        magnet={knob.hue === "offset" ? MAGNET : undefined}
        disabled={inert(knob, knobs)}
        onStart={onStart}
        onMove={(next) => onMove(knob.id, next)}
        onEnd={(next) => onEnd(knob.id, next)}
      />
    );
  };

  return (
    <View style={{ gap: GROUP_GAP }}>
      {GROUPS.map((group) => {
        const members = KNOBS.filter((knob) => knob.group === group.id);
        const toggled = members.find((knob) => knob.nullable === true);
        return (
          <Group key={group.id} theme={theme} title={group.title} footer={group.footer}>
            {toggled === undefined ? null : (
              <SwitchRow
                theme={theme}
                label={SECOND_COLOUR}
                value={knobs[toggled.id] !== null}
                onChange={(on) => {
                  const key = `${preset.id}:${toggled.id}`;
                  onSet(toggled.id, on ? (remembered.get(key) ?? midpoint(toggled)) : null);
                }}
              />
            )}
            {members.map((knob) => (knob.nullable === true && knobs[knob.id] === null ? null : slider(knob)))}
          </Group>
        );
      })}
      <Group theme={theme}>
        <ActionRow theme={theme} label={`Reset to ${preset.name}`} disabled={!edited} onPress={onReset} />
      </Group>
    </View>
  );
}
