import { useSettings, type SettingsState } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { resolveStatus, resolveTheme } from "../shared/engine.ts";
import type { Preset } from "../shared/presets.ts";
import { KNOBS, editOf, presetById, studioSettings, type Knobs } from "../shared/settings.ts";
import type { LiveTheme, StudioValues } from "./live-theme.ts";

export type KnobId = keyof Knobs;
export type Edits = StudioValues["edits"];

/** What the studio shows: the values, and the theme they make, worked out once per change. */
export interface Shown {
  values: StudioValues;
  resolved: ReturnType<typeof resolveTheme>;
}

/** What the studio starts from when the host's copy cannot be had: presets are local. */
const DEFAULTS: StudioValues = studioSettings.schema.parse({});

function shownOf(values: StudioValues): Shown {
  const preset = presetById(values.presetId);
  return { values, resolved: resolveTheme(preset.id, editOf(values.edits, preset.id)) };
}

export function sameKnobs(a: Knobs | null, b: Knobs | null): boolean {
  if (a === null || b === null) return a === b;
  return KNOBS.every((knob) => a[knob.id] === b[knob.id]);
}

function sameEdits(a: Edits, b: Edits): boolean {
  const ids = Object.keys(a);
  return ids.length === Object.keys(b).length && ids.every((id) => sameKnobs(editOf(a, id), editOf(b, id)));
}

const sameValues = (a: StudioValues, b: StudioValues) => a.presetId === b.presetId && sameEdits(a.edits, b.edits);

function withKnob<Id extends KnobId>(knobs: Knobs, id: Id, value: Knobs[Id]): Knobs {
  return { ...knobs, [id]: value };
}

/** The edits with this preset's knobs in; knobs back at the preset's own drop its entry. */
function withEdit(edits: Edits, preset: Preset, knobs: Knobs | null): Edits {
  const { [preset.id]: _previous, ...rest } = edits;
  return knobs === null || sameKnobs(knobs, preset.knobs) ? rest : { ...rest, [preset.id]: knobs };
}

/**
 * The edit session outlives the studio's component. Paseo remounts a screen whenever the theme's
 * colours change (its appearance boundary is keyed by them), so every repaint here does: a remount
 * mid-save must neither fall back to the host's older copy nor send a second save against the
 * revision the first one used. There is one studio screen at a time.
 */
const session = {
  /** What the studio shows, a frame ahead of the host's copy. */
  current: null as Shown | null,
  /** The settings hook of the studio mounted now, whose save the next edit goes through. */
  latest: null as SettingsState<typeof studioSettings.schema> | null,
  draggingNow: false,
  /** The newest edit not yet sent. */
  queued: null as StudioValues | null,
  saving: false,
  /** The revision the last successful save started from; the next one waits until the hook moves past it. */
  savedFrom: null as string | null,
  adopted: null as string | null,
  frame: null as number | null,
  /** The drag position waiting for the next frame. */
  framed: null as StudioValues | null,
};

/**
 * The studio's state. Edits show at once, in the studio and on the whole app through the live
 * theme, which the open studio holds. A drag previews in the studio only, once per animation
 * frame, and repaints the app and saves when the finger lifts: a repaint remounts the screen, and
 * with it the slider under the finger. Every preset keeps its own edits, so picking another one
 * and coming back finds them as left. Saves go one at a time, each against the revision the
 * previous one left, because the host refuses a stale one; the host's values are taken in
 * whenever a new revision arrives and no edit of ours is still on its way.
 */
export function useStudio(live: LiveTheme) {
  const settings = useSettings(studioSettings);
  session.latest = settings;
  // A remount carries on from the session, whose values may be newer than the host's by a save in
  // flight; a first open starts from the entry's read, so the studio opens without a spinner. A
  // newer revision on the host is taken in by the effect below either way.
  const [shown, setShown] = useState<Shown | null>(() => {
    const saved = live.saved();
    if (session.current === null && saved !== null) session.current = shownOf(saved);
    return session.current;
  });
  const [dragging, setDragging] = useState(session.draggingNow);

  useEffect(() => live.hold(), [live]);
  useEffect(
    () => () => {
      if (session.frame !== null) cancelAnimationFrame(session.frame);
      session.frame = null;
    },
    [],
  );

  /** Shows these values here and, unless a drag is previewing, paints them on the app. */
  function show(values: StudioValues, paint = true) {
    const now = session.current;
    const next = now !== null && sameValues(now.values, values) ? now : shownOf(values);
    session.current = next;
    setShown(next);
    // A no-op when these colours are painted already.
    if (paint) live.update(next.resolved.colors, next.resolved.preset, resolveStatus(next.resolved.preset, next.resolved.knobs, next.resolved.colors));
  }

  function flush() {
    const state = session.latest;
    const values = session.queued;
    if (state === null || values === null || session.saving) return;
    if (state.status !== "ready" || state.revision === session.savedFrom) return;
    session.queued = null;
    if (sameValues(values, state.values)) return;
    const from = state.revision;
    session.saving = true;
    void state.save(values, from).then((saved) => {
      session.saving = false;
      session.savedFrom = saved ? from : null;
      // A failed save is not retried by itself: the studio offers to, and the next edit saves afresh.
      flush();
    });
  }

  useEffect(() => {
    flush();
    if (session.current === null && (settings.status === "error" || settings.status === "invalid")) {
      show(DEFAULTS);
      return;
    }
    if (settings.status !== "ready" || settings.revision === session.adopted) return;
    if (session.draggingNow || session.queued !== null || session.saving) return;
    session.adopted = settings.revision;
    if (session.current !== null && sameValues(session.current.values, settings.values)) return;
    show(settings.values);
  });

  function commit(values: StudioValues) {
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = null;
    session.framed = null;
    show(values);
    session.queued = values;
    flush();
  }

  /** What the next change starts from: the frame still to be drawn, else what is shown. */
  function base(): { values: StudioValues; preset: Preset; knobs: Knobs } | null {
    const now = session.current;
    if (now === null) return null;
    const values = session.framed ?? now.values;
    const preset = now.resolved.preset;
    return { values, preset, knobs: editOf(values.edits, preset.id) ?? preset.knobs };
  }

  function withKnobs(now: { values: StudioValues; preset: Preset }, knobs: Knobs | null): StudioValues {
    return { ...now.values, edits: withEdit(now.values.edits, now.preset, knobs) };
  }

  function setKnob(id: KnobId, value: number | null) {
    const now = base();
    if (now !== null) commit(withKnobs(now, withKnob(now.knobs, id, value)));
  }

  return {
    status: settings.status,
    error: settings.status === "error" || settings.status === "invalid" ? settings.error : null,
    saveError: settings.saveError,
    reload: settings.reload,
    resetStored: settings.reset,
    shown,
    dragging,
    /** Shows this preset with its own edits; the one already shown stays as it is. */
    pickPreset(presetId: string) {
      const now = session.current;
      if (now === null || presetById(presetId).id === now.resolved.preset.id) return;
      commit({ ...now.values, presetId });
    },
    /** Drops the shown preset's edits. */
    resetKnobs() {
      const now = base();
      if (now !== null && editOf(now.values.edits, now.preset.id) !== null) commit(withKnobs(now, null));
    },
    /** Sends what is shown again, against a fresh read of the host's copy. */
    retrySave() {
      const now = session.current;
      if (now === null) return;
      session.queued = now.values;
      void settings.reload();
    },
    setKnob,
    startDrag() {
      session.draggingNow = true;
      setDragging(true);
    },
    moveKnob(id: KnobId, value: number) {
      const now = base();
      if (now === null) return;
      session.framed = withKnobs(now, withKnob(now.knobs, id, value));
      if (session.frame !== null) return;
      session.frame = requestAnimationFrame(() => {
        session.frame = null;
        const next = session.framed;
        session.framed = null;
        if (next !== null) show(next, false);
      });
    },
    endDrag(id: KnobId, value: number) {
      session.draggingNow = false;
      setDragging(false);
      setKnob(id, value);
    },
  };
}
