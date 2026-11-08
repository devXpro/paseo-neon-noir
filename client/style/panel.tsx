import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import {
  CODE_SIZE,
  UI_SIZE,
  fontsRpc,
  wallpapersRpc,
  type FxValues,
  type StyleValues,
  type Wallpaper,
} from "../../shared/style.ts";
import { Segmented } from "../components/segmented.tsx";
import { FONT, GROUP_GAP, ROW_FONT, SPACE, type PressState } from "../ui.ts";
import { fontsSupported } from "./fonts.ts";
import { GRADIENTS, type Gradient } from "./fx.ts";
import { FontPicker } from "./gallery.tsx";
import { ActionRow, CheckRow, Group, NoteRow, SliderRow, StepperRow, SwitchRow } from "./rows.tsx";
import { presetPair, type StyleRuntime } from "./runtime.ts";
import { SYNTAX_LABELS, syntaxFor } from "./syntax.ts";

const WEB = Platform.OS === "web";
/** Paseo's own defaults (use-settings/storage.ts), where the device has no size of its own yet. */
const DEFAULT_UI_SIZE = WEB ? 14 : 15;
const DEFAULT_CODE_SIZE = 12;

const KINDS = [
  { value: "none", label: "None" },
  { value: "gradient", label: "Gradient" },
  { value: "image", label: "Image" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

type FxKnob = "blur" | "dim" | "glass" | "scanlines" | "grain" | "vignette" | "glow";
interface KnobSpec {
  id: FxKnob;
  label: string;
  max: number;
  step: number;
  format(value: number): string;
}
const percent = (value: number) => `${Math.round(value * 100)}%`;
const unitKnob = (id: FxKnob, label: string): KnobSpec => ({ id, label, max: 1, step: 0.01, format: percent });
const WALLPAPER_KNOBS: readonly KnobSpec[] = [
  { id: "blur", label: "Blur", max: 40, step: 1, format: (value) => `${value} px` },
  unitKnob("dim", "Dim"),
  unitKnob("glass", "Glass"),
];
const OVERLAY_KNOBS: readonly KnobSpec[] = [
  unitKnob("scanlines", "Scanlines"),
  unitKnob("grain", "Grain"),
  unitKnob("vignette", "Vignette"),
  unitKnob("glow", "Accent Glow"),
];

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Answers kept across the remounts a font change causes; images by the host's folder. */
let availableFonts: Set<string> | null = null;
const imageLists = new Map<string, { folder: string; images: { name: string; path: string; bytes: number }[]; error: string | null }>();

function useAvailableFonts(): { ids: Set<string> | null; error: string | null } {
  const list = useRpc(fontsRpc);
  const [state, setState] = useState<{ ids: Set<string> | null; error: string | null }>({ ids: availableFonts, error: null });
  useEffect(() => {
    if (availableFonts !== null) return;
    let live = true;
    list({})
      .then((result) => {
        if (result.error === null) availableFonts = new Set(result.fonts.map((font) => font.id));
        if (live) setState({ ids: new Set(result.fonts.map((font) => font.id)), error: result.error });
      })
      .catch((error: unknown) => live && setState({ ids: new Set(), error: String(error) }));
    return () => {
      live = false;
    };
  }, [list]);
  return state;
}

function useImages(folder: string | null, active: boolean) {
  const list = useRpc(wallpapersRpc);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (folder === null || !active || imageLists.has(folder)) return;
    let live = true;
    list({})
      .then((result) => imageLists.set(folder, result))
      .catch((error: unknown) => imageLists.set(folder, { folder, images: [], error: String(error) }))
      .finally(() => live && setVersion((current) => current + 1));
    return () => {
      live = false;
    };
  }, [list, folder, active, version]);
  return {
    listing: folder === null ? null : (imageLists.get(folder) ?? null),
    refresh() {
      if (folder !== null) imageLists.delete(folder);
      setVersion((version) => version + 1);
    },
  };
}

function Swatch({
  theme,
  gradient,
  selected,
  onPress,
}: {
  theme: PluginTheme;
  gradient: Gradient;
  selected: boolean;
  onPress(): void;
}) {
  // The web draws the real gradient; a phone has no CSS gradients and shows its brightest colour.
  const fill = useMemo(
    () =>
      (WEB
        ? { backgroundColor: gradient.base, backgroundImage: gradient.layers }
        : { backgroundColor: gradient.glow }) as ViewStyle,
    [gradient],
  );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={gradient.label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4 }}
    >
      {({ hovered }: PressState) => (
        <>
          <View
            style={{
              alignSelf: "stretch",
              padding: 2,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: selected ? theme.colors.accent : hovered ? theme.colors.border : "transparent",
            }}
          >
            <View style={[{ aspectRatio: 1.3, borderRadius: 6, overflow: "hidden" }, fill]} />
          </View>
          <Text style={{ fontSize: FONT.caption, color: theme.colors.foregroundMuted }} numberOfLines={1}>
            {gradient.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * The Style tab: Paseo's syntax colours, fonts and sizes, and the desktop effects. Choices are the
 * host's, shared by every app; Paseo's own settings change only on a device whose studio was used
 * for them, and "Restore Paseo Defaults" gives that device its old ones back.
 */
export function StylePanel({
  theme,
  runtime,
  presetId,
  onDragChange,
}: {
  theme: PluginTheme;
  runtime: StyleRuntime;
  presetId: string;
  onDragChange(dragging: boolean): void;
}) {
  const style = useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
  const available = useAvailableFonts();
  /** Knob positions under a finger, ahead of the save. */
  const [draft, setDraft] = useState<Partial<Record<FxKnob, number>>>({});
  const frame = useRef<number | null>(null);
  const pending = useRef<FxValues | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const values = style.values;
  const images = useImages(style.hostFolder, values?.fx.enabled === true && values.fx.wallpaper.kind === "image");
  const [folderText, setFolderText] = useState(values?.fx.folder ?? "");
  useEffect(() => setFolderText(values?.fx.folder ?? ""), [values?.fx.folder]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: { gap: GROUP_GAP },
        segmentRow: { padding: SPACE.medium },
        swatches: { flexDirection: "row", gap: SPACE.small, padding: SPACE.medium },
        input: {
          minHeight: 44,
          paddingHorizontal: SPACE.large,
          fontSize: ROW_FONT,
          color: theme.colors.foreground,
        },
      }),
    [theme],
  );

  // An unreadable or unreachable document is the studio's banner to tell; this only waits for one.
  if (values === null)
    return style.status === "loading" ? (
      <Group theme={theme}>
        <NoteRow theme={theme} text="Loading…" />
      </Group>
    ) : null;
  const fx = values.fx;
  const fonts = values.fonts;

  const edit = (change: (current: StyleValues) => StyleValues, paseo = false) => void runtime.edit(change, { paseo });
  const editFonts = (patch: Partial<StyleValues["fonts"]>) =>
    edit((current) => ({ ...current, fonts: { ...current.fonts, ...patch } }), true);
  const editFx = (patch: Partial<FxValues>) => edit((current) => ({ ...current, fx: { ...current.fx, ...patch } }));

  // Picking a font by hand is a choice of its own: the next preset leaves it alone.
  const pickFont = (key: "ui" | "mono") => (id: string | null) => editFonts({ [key]: id, follow: false });
  const fontsNote = !fontsSupported
    ? "Fonts load in the desktop app and on iPhone."
    : available.error !== null
      ? available.error
      : Platform.OS === "ios"
        ? "On iPhone, parts of Paseo keep the system font."
        : null;
  const followNote = fonts.enabled
    ? fonts.follow
      ? "Each preset brings its own interface and code fonts; Paseo sets chat text in the interface font too. Picking a font yourself turns this off."
      : "The fonts stay as you picked them when the preset changes."
    : null;

  const knob = (spec: KnobSpec) => (
    <SliderRow
      key={spec.id}
      theme={theme}
      label={spec.label}
      value={draft[spec.id] ?? fx[spec.id]}
      min={0}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onStart={() => onDragChange(true)}
      onMove={(value) => {
        setDraft((current) => ({ ...current, [spec.id]: value }));
        pending.current = { ...fx, ...draft, [spec.id]: value };
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          if (pending.current !== null) runtime.preview(pending.current);
        });
      }}
      onEnd={(value) => {
        onDragChange(false);
        pending.current = null;
        setDraft({});
        editFx({ [spec.id]: value });
      }}
    />
  );

  const setKind = (kind: Kind) => {
    if (kind === fx.wallpaper.kind) return;
    const wallpaper: Wallpaper =
      kind === "none"
        ? { kind }
        : kind === "gradient"
          ? { kind, id: GRADIENTS[0].id }
          : { kind, path: images.listing?.images[0]?.path ?? "" };
    editFx({ wallpaper });
  };

  const commitFolder = () => {
    const folder = folderText.trim();
    if (folder.length === 0 || folder === fx.folder) return;
    editFx({ folder });
  };

  const syntaxNow = SYNTAX_LABELS[syntaxFor(presetId)];
  const uiSize = fonts.uiSize ?? style.device.uiBaseFontSize ?? DEFAULT_UI_SIZE;
  const codeSize = fonts.codeSize ?? style.device.codeFontSize ?? DEFAULT_CODE_SIZE;
  const listing = images.listing;

  return (
    <View style={styles.panel}>
      <Group theme={theme} title="Code" footer={`When on, code uses ${syntaxNow}, this preset's pick.`}>
        <SwitchRow
          theme={theme}
          label="Syntax Colours"
          value={values.syntax}
          onChange={(syntax) => edit((current) => ({ ...current, syntax }), true)}
        />
      </Group>

      <Group theme={theme} title="Fonts" footer={[followNote, fontsNote].filter((note) => note !== null).join(" ") || null}>
        <SwitchRow
          theme={theme}
          label="Custom Fonts"
          value={fonts.enabled}
          // Turned on while following, it starts from this preset's pair.
          onChange={(enabled) => editFonts(enabled && fonts.follow ? { enabled, ...presetPair(presetId) } : { enabled })}
        />
        {fonts.enabled ? (
          <SwitchRow
            theme={theme}
            label="Fonts Follow the Preset"
            value={fonts.follow}
            onChange={(follow) => editFonts(follow ? { follow, ...presetPair(presetId) } : { follow })}
          />
        ) : null}
        {fonts.enabled ? (
          <FontPicker
            theme={theme}
            runtime={runtime}
            label="Interface Font"
            kind="ui"
            chosen={fonts.ui}
            available={available.ids}
            onPick={pickFont("ui")}
          />
        ) : null}
        {fonts.enabled ? (
          <FontPicker
            theme={theme}
            runtime={runtime}
            label="Code Font"
            kind="mono"
            chosen={fonts.mono}
            available={available.ids}
            onPick={pickFont("mono")}
          />
        ) : null}
        {fonts.enabled ? (
          <StepperRow
            theme={theme}
            label="Interface"
            value={uiSize}
            note={fonts.uiSize === null ? "As Paseo has it" : undefined}
            min={UI_SIZE.min}
            max={UI_SIZE.max}
            onChange={(uiSize) => editFonts({ uiSize })}
          />
        ) : null}
        {fonts.enabled ? (
          <StepperRow
            theme={theme}
            label="Code"
            value={codeSize}
            note={fonts.codeSize === null ? "As Paseo has it" : undefined}
            min={CODE_SIZE.min}
            max={CODE_SIZE.max}
            onChange={(codeSize) => editFonts({ codeSize })}
          />
        ) : null}
        {fonts.enabled && (fonts.uiSize !== null || fonts.codeSize !== null) ? (
          <ActionRow theme={theme} label="Use Paseo's Sizes" onPress={() => editFonts({ uiSize: null, codeSize: null })} />
        ) : null}
      </Group>

      <Group
        theme={theme}
        title="Desktop Effects"
        footer={WEB ? "Wallpaper, glass, scanlines, grain and accent glow." : "They show in the desktop app."}
      >
        <SwitchRow theme={theme} label="Effects" value={fx.enabled} onChange={(enabled) => editFx({ enabled })} />
      </Group>
      {fx.enabled ? (
        <>
          <Group theme={theme} title="Wallpaper">
            <View style={styles.segmentRow}>
              <Segmented<Kind> options={KINDS} value={fx.wallpaper.kind} theme={theme} onChange={setKind} />
            </View>
            {fx.wallpaper.kind === "gradient" ? (
              <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Gradient">
                {GRADIENTS.map((gradient) => (
                  <Swatch
                    key={gradient.id}
                    theme={theme}
                    gradient={gradient}
                    selected={fx.wallpaper.kind === "gradient" && fx.wallpaper.id === gradient.id}
                    onPress={() => editFx({ wallpaper: { kind: "gradient", id: gradient.id } })}
                  />
                ))}
              </View>
            ) : null}
            {fx.wallpaper.kind === "none" ? null : WALLPAPER_KNOBS.map(knob)}
          </Group>
          {fx.wallpaper.kind === "image" ? (
            <Group
              theme={theme}
              title="Images"
              footer={listing?.error ?? `JPEG, PNG, WebP, GIF or AVIF up to 16 MB, from a folder on ${WEB ? "this host" : "the host"}.`}
            >
              <TextInput
                style={styles.input}
                value={folderText}
                onChangeText={setFolderText}
                onSubmitEditing={commitFolder}
                onBlur={commitFolder}
                placeholder="~/Pictures/Neon"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Image folder"
              />
              {listing === null ? <NoteRow theme={theme} text="Looking…" /> : null}
              {listing !== null && listing.images.length === 0 && listing.error === null ? (
                <NoteRow theme={theme} text="No images in this folder" />
              ) : null}
              {(listing?.images ?? []).map((image) => (
                <CheckRow
                  key={image.path}
                  theme={theme}
                  label={image.name}
                  detail={megabytes(image.bytes)}
                  selected={fx.wallpaper.kind === "image" && fx.wallpaper.path === image.path}
                  onPress={() => editFx({ wallpaper: { kind: "image", path: image.path } })}
                />
              ))}
              <ActionRow theme={theme} label="Look Again" onPress={images.refresh} />
            </Group>
          ) : null}
          <Group theme={theme} title="Overlay">
            {OVERLAY_KNOBS.map(knob)}
          </Group>
        </>
      ) : null}

      {/* Only once Neon Noir has changed Paseo's settings here: before that there is nothing to put back. */}
      {style.consented ? (
        <Group
          theme={theme}
          footer="Puts back this device's Paseo theme, fonts, sizes and syntax colours as they were before Neon Noir changed them, and stops changing them here."
        >
          <ActionRow theme={theme} label="Restore Paseo Defaults" tone="danger" onPress={() => void runtime.restore()} />
        </Group>
      ) : null}
    </View>
  );
}
