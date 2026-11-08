import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from "react";
import { Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { DEFAULT_PRESET_ID, presetById } from "../shared/settings.ts";
import { AdjustPanel } from "./adjust.tsx";
import { Segmented } from "./components/segmented.tsx";
import { Banner, Hero } from "./hero.tsx";
import type { LiveTheme } from "./live-theme.ts";
import { PresetGrid, gridColumns } from "./presets.tsx";
import { StylePanel } from "./style/panel.tsx";
import { Group, SwitchRow } from "./style/rows.tsx";
import type { StyleRuntime } from "./style/runtime.ts";
import { FONT, GROUP_GAP, SPACE } from "./ui.ts";
import { sameKnobs, useStudio } from "./use-studio.ts";

export const STUDIO_SCREEN_ID = "studio";

/** From this width the presets and the Adjust panel sit side by side; below it a segmented control switches them. */
const WIDE_FROM = 900;
const ADJUST_WIDTH = 360;
const MAX_WIDTH = 1080;
const TABS = [
  { value: "presets", label: "Presets" },
  { value: "adjust", label: "Adjust" },
  { value: "style", label: "Style" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * Paseo remounts a screen whenever a font, a size or a theme colour changes, which a tap here
 * often does; the tab and the scroll positions outlive that remount. `main` is the phone's one
 * scroll view or the wide layout's presets column, `side` the wide layout's Adjust column.
 */
const kept = { tab: "presets" as Tab, scroll: { main: 0, side: 0 } };

export function createStudioScreen(live: LiveTheme, style: StyleRuntime): ComponentType<PluginScreenProps> {
  return function StudioScreen(props: PluginScreenProps) {
    return <Studio {...props} live={live} style={style} />;
  };
}

/** A scroll view that comes back to its kept offset after a remount. */
function KeptScrollView({
  name,
  scrollRef,
  scrollEnabled,
  contentContainerStyle,
  children,
}: {
  name: keyof typeof kept.scroll;
  scrollRef: RefObject<ScrollView | null>;
  /** Off while a slider is held: on iOS the scroll view would take the touch over. */
  scrollEnabled: boolean;
  contentContainerStyle: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const restored = useRef(false);
  // React Native Web reports a scroll's end 100 ms late, from the old node after a remount: reading 0.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={contentContainerStyle}
      scrollEnabled={scrollEnabled}
      contentInsetAdjustmentBehavior="automatic"
      scrollEventThrottle={100}
      onScroll={(event) => {
        if (mounted.current) kept.scroll[name] = event.nativeEvent.contentOffset.y;
      }}
      onContentSizeChange={(_contentWidth, contentHeight) => {
        const offset = kept.scroll[name];
        if (restored.current || offset === 0 || contentHeight <= offset) return;
        restored.current = true;
        scrollRef.current?.scrollTo({ y: offset, animated: false });
      }}
    >
      {children}
    </ScrollView>
  );
}

function Studio({ theme, live, style }: PluginScreenProps & { live: LiveTheme; style: StyleRuntime }) {
  const studio = useStudio(live);
  const styleState = useSyncExternalStore(style.subscribe, style.snapshot, style.snapshot);
  // The screen's own width, not the window's: on the desktop the sidebar takes part of it. Nothing
  // renders until it is known, so a wide window does not flash the compact layout first.
  const [width, setWidth] = useState<number | null>(null);
  const [tab, setTabState] = useState<Tab>(kept.tab);
  const [styleDragging, setStyleDragging] = useState(false);
  const mainScroll = useRef<ScrollView>(null);
  const sideScroll = useRef<ScrollView>(null);
  // The way up to Paseo's settings cache, for the switch: the studio screen is mounted for as long
  // as it is open, which the Style tab is not on the phone.
  const release = useRef<(() => void) | null>(null);
  const root = useCallback(
    (node: View | null) => {
      release.current?.();
      release.current = node === null ? null : style.anchor(node);
    },
    [style],
  );

  const setTab = (next: Tab) => {
    if (next === tab) return;
    kept.tab = next;
    kept.scroll.main = 0;
    setTabState(next);
    mainScroll.current?.scrollTo({ y: 0, animated: false });
  };
  const shown = studio.shown;
  const presetId = shown?.resolved.preset.id ?? null;
  useEffect(() => {
    if (presetId !== null) style.notePreset(presetId);
  }, [style, presetId]);

  const showing = live.isShowing(theme.colors);
  const wanted = styleState.themeWanted;
  useEffect(() => {
    if (wanted !== null && wanted === showing) style.settleTheme();
  }, [style, wanted, showing]);
  const on = wanted ?? showing;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1 },
        centred: { width: "100%", maxWidth: MAX_WIDTH + 2 * SPACE.large, alignSelf: "center" },
        tabs: { paddingHorizontal: SPACE.large, paddingVertical: SPACE.small },
        container: { alignItems: "center", padding: SPACE.large, paddingBottom: SPACE.large * 2 },
        content: { width: "100%", maxWidth: MAX_WIDTH, gap: GROUP_GAP },
        banners: { paddingHorizontal: SPACE.large, paddingTop: SPACE.large, gap: SPACE.small },
        columns: { flex: 1, flexDirection: "row" },
        main: { padding: SPACE.large, paddingBottom: SPACE.large * 2, gap: GROUP_GAP },
        // The column's own padding on the left makes up the gap between the columns.
        sideColumn: { width: ADJUST_WIDTH + GROUP_GAP },
        side: {
          paddingTop: SPACE.large,
          paddingBottom: SPACE.large * 2,
          paddingLeft: GROUP_GAP - SPACE.large,
          paddingRight: SPACE.large,
          gap: SPACE.small,
        },
        styleSection: { marginTop: GROUP_GAP, gap: SPACE.small },
        // Above the groups' own uppercase headers, so a heading of the same style would stutter.
        title: {
          paddingHorizontal: SPACE.large,
          fontSize: Platform.OS === "web" ? FONT.subhead : FONT.body,
          lineHeight: Platform.OS === "web" ? 20 : 22,
          fontWeight: "600",
          color: theme.colors.foreground,
        },
      }),
    [theme],
  );

  if (shown === null) return <Loading />;

  const wide = width !== null && width >= WIDE_FROM;
  const rowWidth = width === null ? 0 : Math.min(width, MAX_WIDTH + 2 * SPACE.large);
  const gridWidth = wide ? rowWidth - ADJUST_WIDTH - GROUP_GAP - 2 * SPACE.large : rowWidth - 2 * SPACE.large;
  const scrollable = !studio.dragging && !styleDragging;
  const { preset, colors, knobs } = shown.resolved;
  const edited = !sameKnobs(knobs, preset.knobs);

  const switchCard = (
    <Group theme={theme} footer="Paints Paseo on this device. Presets and adjustments sync to all your devices.">
      <SwitchRow
        theme={theme}
        label="Neon Noir"
        value={on}
        onChange={(next) => void (next ? style.activate() : style.deactivate())}
      />
    </Group>
  );
  const hero = <Hero theme={theme} runtime={style} preset={preset} colors={colors} edited={edited} compact={!wide} />;
  const grid = (
    <PresetGrid
      theme={theme}
      columns={gridColumns(gridWidth)}
      selectedId={preset.id}
      selectedColors={colors}
      edits={shown.values.edits}
      onSelect={(id) => {
        // The first pick is asking to see the look: it turns Neon Noir on, unless it was turned off here.
        if (!on && !styleState.declined) void style.activate();
        studio.pickPreset(id);
        style.presetPicked(id);
      }}
    />
  );
  const adjust = (
    <AdjustPanel
      theme={theme}
      preset={preset}
      knobs={knobs}
      colors={colors}
      edited={edited}
      onStart={studio.startDrag}
      onMove={studio.moveKnob}
      onEnd={studio.endDrag}
      onSet={studio.setKnob}
      onReset={studio.resetKnobs}
    />
  );
  const stylePanel = <StylePanel theme={theme} runtime={style} presetId={preset.id} onDragChange={setStyleDragging} />;

  const banners: ReactNode[] = [];
  if (studio.status === "error" || styleState.status === "error") {
    banners.push(
      <Banner
        key="unreachable"
        theme={theme}
        tone="error"
        text="Can't reach your host."
        action={studio.status === "error" ? { label: "Try Again", onPress: () => void studio.reload() } : undefined}
      />,
    );
  }
  if (studio.status === "invalid") {
    banners.push(
      <Banner
        key="invalid"
        theme={theme}
        tone="error"
        text="Your saved look can't be read."
        action={{ label: `Reset to ${presetById(DEFAULT_PRESET_ID).name}`, onPress: () => void studio.resetStored() }}
      />,
    );
  }
  if (studio.saveError !== null) {
    banners.push(
      <Banner key="unsaved" theme={theme} tone="error" text="Not saved." action={{ label: "Try Again", onPress: studio.retrySave }} />,
    );
  }
  if (styleState.status === "invalid") {
    banners.push(
      <Banner
        key="style"
        theme={theme}
        tone="error"
        text="Your style settings can't be read."
        action={{ label: "Reset", onPress: () => void style.resetStored() }}
      />,
    );
  }
  if (styleState.problem !== null) {
    banners.push(<Banner key="problem" theme={theme} tone="error" text={styleState.problem} />);
  }
  // Only when the app could not be reached to apply a change at once.
  if (styleState.needsReload) {
    banners.push(
      <Banner
        key="reload"
        theme={theme}
        tone="hint"
        text="Saved. Paseo shows it after a reload."
        action={{ label: "Reload", onPress: style.reload }}
      />,
    );
  }

  return (
    <View ref={root} collapsable={false} style={styles.root} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width === null ? null : wide ? (
        <>
          {banners.length > 0 ? <View style={[styles.centred, styles.banners]}>{banners}</View> : null}
          {/* Each column scrolls on its own, so the sliders stay in view while the grid scrolls. */}
          <View style={[styles.centred, styles.columns]}>
            <KeptScrollView name="main" scrollRef={mainScroll} scrollEnabled={scrollable} contentContainerStyle={styles.main}>
              {switchCard}
              {hero}
              {grid}
            </KeptScrollView>
            <View style={styles.sideColumn}>
              <KeptScrollView name="side" scrollRef={sideScroll} scrollEnabled={scrollable} contentContainerStyle={styles.side}>
                <Text style={styles.title} accessibilityRole="header">
                  Adjust
                </Text>
                {adjust}
                <View style={styles.styleSection}>
                  <Text style={styles.title} accessibilityRole="header">
                    Style
                  </Text>
                  {stylePanel}
                </View>
              </KeptScrollView>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.centred, styles.tabs]}>
            <Segmented<Tab> options={TABS} value={tab} theme={theme} onChange={setTab} />
          </View>
          <KeptScrollView name="main" scrollRef={mainScroll} scrollEnabled={scrollable} contentContainerStyle={styles.container}>
            <View style={styles.content}>
              {banners}
              {tab === "presets" ? switchCard : null}
              {tab === "style" ? null : hero}
              {tab === "presets" ? grid : tab === "adjust" ? adjust : stylePanel}
            </View>
          </KeptScrollView>
        </>
      )}
    </View>
  );
}
