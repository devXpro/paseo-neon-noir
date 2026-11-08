import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { INERT_OPACITY, systemFill } from "../ui.ts";

/**
 * A slider in plain React Native, which has none: one PanResponder over the track for touch and
 * mouse alike, the value on a grid of `step`. It reports every new value while the finger moves
 * and the last one when it lifts, so the owner previews the first and saves the second. The owner
 * also turns off its ScrollView's scrolling between `onStart` and `onEnd`, or the page takes the
 * drag over on iOS.
 */
export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** What a screen reader calls the slider. */
  label: string;
  /** The value as it reads, e.g. "42%". */
  valueText: string;
  disabled?: boolean;
  /**
   * A hue track instead of a rail and a fill: a CSS gradient over the thumb's travel, the colour
   * at both of its ends (a full circle of hues starts and ends on one), and the thumb's own colour.
   */
  spectrum?: { gradient: string; edge: string; thumb: string };
  /** A value the thumb snaps to from this close, e.g. the accent's own hue. */
  magnet?: { at: number; within: number };
  theme: PluginTheme;
  onStart(): void;
  onChange(value: number): void;
  onEnd(value: number): void;
}

const WEB = Platform.OS === "web";
/** The phone's are UISlider's: a 44 pt touch target and a 28 pt thumb. The desktop's are a mouse's. */
const HEIGHT = WEB ? 28 : 44;
const THUMB = WEB ? 20 : 28;
const TRACK = 4;
const HUE_TRACK = WEB ? 6 : 8;
const HUE_RING = WEB ? 2 : 3;
const THUMB_COLOR = "#FFFFFF";
/**
 * On a touch screen the slider behaves as UISlider does: a tap leaves it alone, and a press
 * becomes a drag only once it moves this far sideways, and more sideways than up or down, so a
 * swipe that starts on it is the page scrolling. The drag then moves the thumb by as much as the
 * finger moved, never to the finger. A mouse has no such conflict: on the web the thumb goes to
 * the pointer on the press itself and follows it.
 */
const TOUCH = !WEB;
const SLOP = 4;

// Web only, and not in React Native's style types: without these the browser pans the page under
// a touch drag and selects text under a mouse drag.
const WEB_TRACK = WEB ? ({ touchAction: "none", userSelect: "none", cursor: "pointer" } as ViewStyle) : null;
const SHADOW = "0 1px 2px rgba(0, 0, 0, 0.3), 0 3px 8px rgba(0, 0, 0, 0.25)";
const WEB_THUMB: ViewStyle | null = WEB ? { boxShadow: SHADOW } : null;

/** A CSS gradient as a background: `backgroundImage` on the web, the New Architecture's own key on the phone. */
function gradientStyle(gradient: string): ViewStyle {
  return WEB ? ({ backgroundImage: gradient } as ViewStyle) : { experimental_backgroundImage: gradient };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const decimals = (step: number) => {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
};

/** The nearest grid value, rounded so 0.1 + 0.2 reads 0.3. */
export function snap(value: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((value - min) / step) * step;
  return clamp(Number(stepped.toFixed(decimals(step))), min, max);
}

interface Press {
  startX: number;
  /** Where the thumb was when the press began, 0..1 along the track. */
  startRatio: number;
  /** The track's place on the page; null until measured. */
  track: { left: number; width: number } | null;
  /** Whether the press became a drag and the owner was told. */
  dragging: boolean;
}

export function Slider(props: SliderProps) {
  const { value, min, max, step, label, valueText, disabled = false, spectrum, theme, onStart, onChange, onEnd } = props;
  const trackRef = useRef<View>(null);
  const latest = useRef(props);
  latest.current = props;
  const press = useRef<Press | null>(null);
  const last = useRef(value);

  const responder = useMemo(() => {
    // Page coordinates throughout: locationX is relative to whichever child the finger is over.
    const report = (pageX: number) => {
      const current = press.current;
      const track = current?.track;
      if (!current || !track) return;
      const { min: low, max: high, step: grid, magnet, onChange: change } = latest.current;
      // The thumb's centre runs between the track's ends inset by its radius, as on iOS.
      const travel = Math.max(1, track.width - THUMB);
      const ratio = clamp(
        TOUCH ? current.startRatio + (pageX - current.startX) / travel : (pageX - track.left - THUMB / 2) / travel,
        0,
        1,
      );
      let next = snap(low + ratio * (high - low), low, high, grid);
      if (magnet && Math.abs(next - magnet.at) <= magnet.within) next = magnet.at;
      if (next === last.current) return;
      last.current = next;
      change(next);
    };
    const begin = (current: Press) => {
      if (current.dragging) return;
      current.dragging = true;
      latest.current.onStart();
    };
    const finish = () => {
      const current = press.current;
      press.current = null;
      if (current?.dragging) latest.current.onEnd(last.current);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      // Neither the page nor a sheet around it may take the drag over halfway.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const { value: now, min: low, max: high } = latest.current;
        const current: Press = {
          startX: event.nativeEvent.pageX,
          startRatio: high > low ? clamp((now - low) / (high - low), 0, 1) : 0,
          track: null,
          dragging: false,
        };
        press.current = current;
        last.current = now;
        trackRef.current?.measure((_x, _y, width, _height, left) => {
          if (press.current !== current) return;
          current.track = { left, width };
          if (TOUCH) return;
          begin(current);
          report(current.startX);
        });
      },
      onPanResponderMove: (event, gesture) => {
        const current = press.current;
        if (current === null) return;
        if (!current.dragging) {
          if (Math.abs(gesture.dx) < SLOP || Math.abs(gesture.dx) < Math.abs(gesture.dy)) return;
          begin(current);
        }
        report(event.nativeEvent.pageX);
      },
      onPanResponderRelease: () => {
        const current = press.current;
        // A click quicker than the measurement still puts the thumb there; a tap on a phone does not.
        if (!TOUCH && current !== null && !current.dragging) {
          begin(current);
          report(current.startX);
        }
        finish();
      },
      // The page took the touch for a scroll, or the system cancelled it: a drag keeps what it
      // reached, a press that never became one changes nothing.
      onPanResponderTerminate: finish,
    });
  }, []);

  // A slider unmounted mid-drag (the Presets tab tapped with a second finger) still ends the drag,
  // or the page would stay unscrollable.
  useEffect(
    () => () => {
      const current = press.current;
      press.current = null;
      if (current?.dragging) latest.current.onEnd(last.current);
    },
    [],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { height: HEIGHT, justifyContent: "center", opacity: disabled ? INERT_OPACITY : 1 },
        rail: { height: TRACK, borderRadius: TRACK / 2, backgroundColor: systemFill(theme), overflow: "hidden" },
        fill: { height: TRACK, backgroundColor: theme.colors.accent },
        hueRail: { height: HUE_TRACK, borderRadius: HUE_TRACK / 2, overflow: "hidden" },
        // From thumb centre to thumb centre, so the colour under the thumb is the one it picks.
        hueGradient: { flex: 1, marginHorizontal: THUMB / 2 },
        thumb: {
          position: "absolute",
          top: (HEIGHT - THUMB) / 2,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: THUMB_COLOR,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          pointerEvents: "none",
        },
        hueThumb: { borderWidth: HUE_RING, borderColor: THUMB_COLOR },
      }),
    [theme, disabled],
  );
  const gradient = useMemo(() => (spectrum ? gradientStyle(spectrum.gradient) : null), [spectrum?.gradient]);

  const ratio = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const percent: `${number}%` = `${ratio * 100}%`;
  return (
    <View
      ref={trackRef}
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        // A tenth of the range per swipe, as UISlider moves; one grid step would take a hundred.
        const nudge = Math.max(step, snap((max - min) / 10, 0, max - min, step));
        const next = snap(value + (event.nativeEvent.actionName === "increment" ? nudge : -nudge), min, max, step);
        if (next === value) return;
        onStart();
        onChange(next);
        onEnd(next);
      }}
      style={[styles.root, WEB_TRACK]}
    >
      {spectrum ? (
        // The full circle of hues under the thumb's travel; there is no filled part to show.
        <View style={[styles.hueRail, { backgroundColor: spectrum.edge }]}>
          <View style={[styles.hueGradient, gradient]} />
        </View>
      ) : (
        <View style={styles.rail}>
          {/* Ends under the thumb wherever it is: the gap to its centre is less than its radius. */}
          <View style={[styles.fill, { width: percent }]} />
        </View>
      )}
      <View
        style={[
          styles.thumb,
          WEB_THUMB,
          spectrum ? [styles.hueThumb, { backgroundColor: spectrum.thumb }] : null,
          { left: percent, marginLeft: -ratio * THUMB },
        ]}
      />
    </View>
  );
}
