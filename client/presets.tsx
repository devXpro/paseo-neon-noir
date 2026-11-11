import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useCallback, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { resolveTheme, type Mode, type ThemeColors } from "../shared/engine.ts";
import { PRESETS, type Preset } from "../shared/presets.ts";
import { editOf, type Knobs } from "../shared/settings.ts";
import { Mock } from "./components/mock.tsx";
import { FONT, GROUP_GAP, SPACE, cardStyle, sectionHeaderStyle, type PressState } from "./ui.ts";
import type { Edits } from "./use-studio.ts";

/** Each preset's colours with its edits, worked out once per edit: the engine is too slow to run per render. */
const tileColors = new Map<string, { knobs: Knobs | null; mode: Mode; colors: ThemeColors }>();
function colorsOf(preset: Preset, knobs: Knobs | null, mode: Mode): ThemeColors {
  const cached = tileColors.get(preset.id);
  if (cached !== undefined && cached.knobs === knobs && cached.mode === mode) return cached.colors;
  const colors = resolveTheme(preset.id, knobs, mode).colors;
  tileColors.set(preset.id, { knobs, mode, colors });
  return colors;
}

/** The presets filed under their collections, both in PRESETS order. */
function collections(): { name: string; presets: Preset[] }[] {
  const byName = new Map<string, Preset[]>();
  for (const preset of PRESETS) {
    const group = byName.get(preset.collection);
    if (group) group.push(preset);
    else byName.set(preset.collection, [preset]);
  }
  return [...byName].map(([name, presets]) => ({ name, presets }));
}

/** Rows of `columns`, the last padded with nulls so every tile keeps the same width. */
function rows(presets: Preset[], columns: number): (Preset | null)[][] {
  const result: (Preset | null)[][] = [];
  for (let start = 0; start < presets.length; start += columns) {
    const row: (Preset | null)[] = presets.slice(start, start + columns);
    while (row.length < columns) row.push(null);
    result.push(row);
  }
  return result;
}

/**
 * Around each mock: the tile's own padding, a 2 pt ring and a 2 pt gap, 8 in all, so with no gap
 * between tiles and 8 inside the card the mocks sit 16 apart and 16 from the card's edge.
 */
const CARD_PADDING = 8;
const TILE_PADDING = 4;
const RING = 2;
const RING_GAP = 2;
const MOCK_RADIUS = 10;
/** A tile's width at which a column is added: 112 of tile, 16 of gap. */
const COLUMN = 128;

/** How many tiles fit a row this wide, never fewer than three. */
export const gridColumns = (width: number) => Math.max(3, Math.floor((width + 16) / COLUMN));

const Tile = memo(function Tile({
  preset,
  colors,
  selected,
  theme,
  onSelect,
}: {
  preset: Preset;
  colors: ThemeColors;
  selected: boolean;
  theme: PluginTheme;
  onSelect(presetId: string): void;
}) {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        tile: { flex: 1, minWidth: 0, padding: TILE_PADDING },
        ring: {
          padding: RING_GAP,
          borderWidth: RING,
          borderRadius: MOCK_RADIUS + RING_GAP + RING,
          borderColor: "transparent",
        },
        ringHovered: { borderColor: theme.colors.border },
        ringSelected: { borderColor: theme.colors.accent },
        name: {
          marginTop: 6,
          fontSize: FONT.footnote,
          lineHeight: 18,
          fontWeight: "400",
          textAlign: "center",
          color: theme.colors.foregroundMuted,
        },
        nameSelected: { fontWeight: "600", color: theme.colors.foreground },
      }),
    [theme],
  );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={preset.name}
      accessibilityHint={preset.tagline}
      accessibilityState={{ checked: selected }}
      onPress={() => onSelect(preset.id)}
      style={styles.tile}
    >
      {({ pressed, hovered }: PressState) => (
        <>
          <View style={[styles.ring, selected ? styles.ringSelected : pressed || hovered ? styles.ringHovered : null]}>
            <Mock colors={colors} radius={MOCK_RADIUS} />
          </View>
          <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
            {preset.name}
          </Text>
        </>
      )}
    </Pressable>
  );
});

/** Every preset as a tile in its own edited colours, dark or light, filed under its collection; a tap picks it. */
export function PresetGrid({
  theme,
  columns,
  selectedId,
  selectedColors,
  edits,
  mode,
  onSelect,
}: {
  theme: PluginTheme;
  columns: number;
  selectedId: string;
  /** The look being edited, a frame ahead of its saved edit while a slider moves. */
  selectedColors: ThemeColors;
  edits: Edits;
  /** The mode every tile is drawn in: the one the app is painted in. */
  mode: Mode;
  onSelect(presetId: string): void;
}) {
  const groups = useMemo(collections, []);
  // The tiles stay memoised across the studio's renders, a drag's included.
  const select = useRef(onSelect);
  select.current = onSelect;
  const stableSelect = useCallback((presetId: string) => select.current(presetId), []);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        groups: { gap: GROUP_GAP },
        group: { gap: SPACE.small },
        header: sectionHeaderStyle(theme),
        card: { ...cardStyle(theme), padding: CARD_PADDING },
        row: { flexDirection: "row" },
        filler: { flex: 1 },
      }),
    [theme],
  );
  return (
    <View style={styles.groups}>
      {groups.map((group) => (
        <View key={group.name} style={styles.group}>
          <Text style={styles.header} accessibilityRole="header">
            {group.name}
          </Text>
          <View style={styles.card} accessibilityRole="radiogroup" accessibilityLabel={group.name}>
            {rows(group.presets, columns).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((preset, index) =>
                  preset === null ? (
                    <View key={`filler-${index}`} style={styles.filler} />
                  ) : (
                    <Tile
                      key={preset.id}
                      preset={preset}
                      colors={preset.id === selectedId ? selectedColors : colorsOf(preset, editOf(edits, preset.id), mode)}
                      selected={preset.id === selectedId}
                      theme={theme}
                      onSelect={stableSelect}
                    />
                  ),
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
