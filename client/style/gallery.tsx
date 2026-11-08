import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FONTS, fontById, type BundledFont, type FontKind } from "../../shared/style.ts";
import { FONT, SPACE, highlight, type PressState } from "../ui.ts";
import { Group } from "./rows.tsx";
import type { StyleRuntime } from "./runtime.ts";

const WEB = Platform.OS === "web";
/** A gallery row: the family in its own face over one line of sample, as Books lists its fonts. */
const ROW_HEIGHT = 60;
const NAME_SIZE = 20;
const LATIN_SAMPLE = "Aa Bb 0123 →";
const CYRILLIC_SAMPLE = "Съешь ещё этих мягких булок";
const CODE_SAMPLE = "const x = fn(a) => {}";
const SYSTEM_MONO = Platform.select({ ios: "Menlo", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });
/** The phone's row has room for one style tag beside the script tag. */
const MAX_TAGS = WEB ? 2 : 1;
/** Rows this far below the fold start loading, so a slow scroll finds them ready. */
const LOOKAHEAD = "240px";

interface ObserverLike {
  observe(target: unknown): void;
  disconnect(): void;
}
type ObserverClass = new (
  callback: (entries: readonly { isIntersecting: boolean }[]) => void,
  options?: { rootMargin?: string },
) => ObserverLike;

/**
 * True once the row has come near the screen. The web asks an IntersectionObserver; where there is
 * none (the phone, as a rule) a row counts as seen once mounted and the loader queues the files.
 */
function useSeen(): [(node: View | null) => void, boolean] {
  const [seen, setSeen] = useState(false);
  const observer = useRef<ObserverLike | null>(null);
  const ref = useCallback(
    (node: View | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (node === null || seen) return;
      const Observer = (globalThis as { IntersectionObserver?: ObserverClass }).IntersectionObserver;
      if (typeof Observer !== "function") {
        setSeen(true);
        return;
      }
      try {
        const next = new Observer(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.current?.disconnect();
            observer.current = null;
            setSeen(true);
          },
          { rootMargin: LOOKAHEAD },
        );
        next.observe(node);
        observer.current = next;
      } catch {
        setSeen(true);
      }
    },
    [seen],
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, seen];
}

/**
 * The fontFamily that shows this font here, once it has loaded; null before, and wherever the
 * plugin cannot load fonts. Loaded fonts are kept for the session, so a remount finds them at once.
 */
export function useFontPreview(runtime: StyleRuntime, font: BundledFont | null, active = true, full = false): string | null {
  const [loaded, setLoaded] = useState<{ font: BundledFont; family: string | null } | null>(null);
  const ready = font === null ? null : runtime.previewedFont(font, full);
  useEffect(() => {
    if (font === null || ready !== null || !active) return;
    let live = true;
    void runtime.previewFont(font, full).then((family) => {
      if (live) setLoaded({ font, family });
    });
    return () => {
      live = false;
    };
  }, [runtime, font, ready, active, full]);
  return ready ?? (loaded !== null && loaded.font === font ? loaded.family : null);
}

function useGalleryStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        row: {
          minHeight: ROW_HEIGHT,
          paddingHorizontal: SPACE.large,
          paddingVertical: 7,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.medium,
          borderRadius: 12,
        },
        body: { flex: 1, minWidth: 0, gap: 1 },
        nameLine: { flexDirection: "row", alignItems: "center", gap: SPACE.small },
        name: { flexShrink: 1, fontSize: NAME_SIZE, lineHeight: 26, color: theme.colors.foreground },
        sample: { fontSize: FONT.footnote, lineHeight: 17, color: theme.colors.foregroundMuted },
        tags: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
        tag: {
          paddingHorizontal: 5,
          paddingVertical: 1,
          borderRadius: 4,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        tagText: { fontSize: FONT.caption, lineHeight: 14, color: theme.colors.foregroundMuted },
        check: { width: 18, alignItems: "center" },
      }),
    [theme],
  );
}

function Row({
  theme,
  name,
  nameFamily,
  sample,
  sampleFamily,
  tags,
  hint,
  selected,
  onPress,
  bodyRef,
}: {
  theme: PluginTheme;
  name: string;
  nameFamily: string | null;
  sample: string;
  sampleFamily: string | null;
  tags: readonly string[];
  hint?: string;
  selected: boolean;
  onPress(): void;
  bodyRef?: (node: View | null) => void;
}) {
  const styles = useGalleryStyles(theme);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityHint={hint}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={(state: PressState) => [styles.row, highlight(theme, state)]}
    >
      <View ref={bodyRef} style={styles.body}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, nameFamily === null ? null : { fontFamily: nameFamily }]} numberOfLines={1}>
            {name}
          </Text>
          {tags.length === 0 ? null : (
            <View style={styles.tags}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Text style={[styles.sample, sampleFamily === null ? null : { fontFamily: sampleFamily }]} numberOfLines={1}>
          {sample}
        </Text>
      </View>
      <View style={styles.check}>{selected ? <Icon name="Check" size={18} color={theme.colors.accent} /> : null}</View>
    </Pressable>
  );
}

const sampleFor = (kind: FontKind, cyrillic: boolean) =>
  kind === "mono" ? CODE_SAMPLE : cyrillic ? `${LATIN_SAMPLE}  ${CYRILLIC_SAMPLE}` : LATIN_SAMPLE;

function FontRow({
  theme,
  runtime,
  font,
  selected,
  onPress,
}: {
  theme: PluginTheme;
  runtime: StyleRuntime;
  font: BundledFont;
  selected: boolean;
  onPress(): void;
}) {
  const [ref, seen] = useSeen();
  const family = useFontPreview(runtime, font, seen);
  const cyrillic = font.scripts === "latin+cyrillic";
  return (
    <Row
      theme={theme}
      name={font.family}
      nameFamily={family}
      sample={sampleFor(font.kind, cyrillic)}
      // The sample is set in the font itself; a Latin-only font has no Cyrillic line, its tag says so.
      sampleFamily={family}
      tags={[...font.tags.slice(0, MAX_TAGS), cyrillic ? "Cyrillic" : "Latin only"]}
      hint={font.description}
      selected={selected}
      onPress={onPress}
      bodyRef={ref}
    />
  );
}

/** Cyrillic-capable families first, each half in registry order. */
const galleryOrder = (fonts: readonly BundledFont[]) =>
  [...fonts].sort((a, b) => Number(a.scripts !== "latin+cyrillic") - Number(b.scripts !== "latin+cyrillic"));

/** The gallery's rows: System first, then every bundled font of this kind the host has. */
function GalleryRows({
  theme,
  runtime,
  kind,
  chosen,
  available,
  onPick,
}: {
  theme: PluginTheme;
  runtime: StyleRuntime;
  kind: FontKind;
  chosen: string | null;
  available: ReadonlySet<string> | null;
  onPick(id: string | null): void;
}) {
  const fonts = galleryOrder(FONTS.filter((font) => font.kind === kind && (available === null || available.has(font.id))));
  return (
    <Group theme={theme}>
      <Row
        theme={theme}
        name="System"
        nameFamily={null}
        sample={sampleFor(kind, true)}
        sampleFamily={kind === "mono" ? (SYSTEM_MONO ?? null) : null}
        tags={[]}
        selected={chosen === null}
        onPress={() => onPick(null)}
      />
      {fonts.map((font) => (
        <FontRow
          key={font.id}
          theme={theme}
          runtime={runtime}
          font={font}
          selected={chosen === font.id}
          onPress={() => onPick(font.id)}
        />
      ))}
    </Group>
  );
}

/**
 * A row of the Fonts group, as iOS shows a choice made on another page: what it sets, the current
 * family in its own face, a chevron. A tap opens the gallery in the host's modal (a sheet on the
 * phone, a centred dialog on the desktop); picking a font there applies it and closes it.
 */
export function FontPicker({
  theme,
  runtime,
  label,
  kind,
  chosen,
  available,
  onPick,
}: {
  theme: PluginTheme;
  runtime: StyleRuntime;
  label: string;
  kind: FontKind;
  /** A FONTS id; null is the system font. */
  chosen: string | null;
  /** The ids the host has the files of; null until it has answered. */
  available: ReadonlySet<string> | null;
  onPick(id: string | null): void;
}) {
  const styles = useGalleryStyles(theme);
  const [open, setOpen] = useState(false);
  const font = fontById(chosen);
  const family = useFontPreview(runtime, font);
  const name = font?.family ?? "System";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${name}`}
        onPress={() => setOpen(true)}
        style={(state: PressState) => [styles.row, highlight(theme, state)]}
      >
        <View style={styles.body}>
          <Text style={styles.sample} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.name, family === null ? null : { fontFamily: family }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Icon name="ChevronRight" size={18} color={theme.colors.foregroundMuted} />
      </Pressable>
      <Modal title={label} open={open} onOpenChange={setOpen}>
        <Modal.Content>
          {/* Mounted only while open, so the previews load when the gallery is looked at. */}
          {open ? (
            <GalleryRows
              theme={theme}
              runtime={runtime}
              kind={kind}
              chosen={chosen}
              available={available}
              onPick={(id) => {
                onPick(id);
                setOpen(false);
              }}
            />
          ) : null}
        </Modal.Content>
      </Modal>
    </>
  );
}
