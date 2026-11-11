import { settingsRpc } from "@getpaseo/plugin";
import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Appearance } from "react-native";
import type { output as ZodOutput } from "zod";
import { resolveStatus, resolveTheme, type Mode, type StatusColors, type ThemeColors } from "../shared/engine.ts";
import type { Preset } from "../shared/presets.ts";
import { DEFAULT_APPEARANCE, DEFAULT_PRESET_ID, editOf, effectiveMode, presetById, studioSettings } from "../shared/settings.ts";

export type StudioValues = ZodOutput<typeof studioSettings.schema>;

/**
 * The plugin's only theme. Its id never changes, so Paseo keeps it picked (by the studio's switch,
 * or in Settings → Appearance) through every repaint; its colours and name are whatever the studio shows.
 */
export interface LiveTheme {
  /** Repaints the app with these colours, dark or light, named after the preset. A no-op when they are painted already. */
  update(colors: ThemeColors, preset: Preset, status: StatusColors, mode: Mode): void;
  /** Whether this device's system is in light or dark mode now. */
  systemMode(): Mode;
  /** Called when the system switches between light and dark. */
  subscribeSystem(listener: () => void): () => void;
  /** What the theme object Paseo builds must carry beyond the eight colours addTheme accepts. */
  overlay(): ThemeOverlay | null;
  /** Registers the same theme again, once per set of colours, for a commit the overlay can ride on. */
  repaintOnce(): void;
  /** The name of the preset painted now, for useSyncExternalStore. */
  presetName(): string;
  subscribe(listener: () => void): () => void;
  /** Whether the app paints with this theme, judged by the colours its components receive. */
  isShowing(colors: { surface0: string; accent: string }): boolean;
  /** The values the host had at the last read, or null before the first one. */
  saved(): StudioValues | null;
  /**
   * An open studio paints its own unsaved edits; the host's values read meanwhile would undo them.
   * Returns the release, which repaints from a fresh read.
   */
  hold(): () => void;
  dispose(): void;
}

/** Keys of Paseo's Theme.colors that its plugin theme contract does not let a theme set. */
export type ThemeOverlay = Record<string, string>;

const overlayOf = (status: StatusColors): ThemeOverlay => ({
  statusSuccess: status.success,
  statusWarning: status.warning,
  statusDanger: status.danger,
  statusSuccessTint: status.successTint,
  statusWarningTint: status.warningTint,
  statusDangerTint: status.dangerTint,
  statusDotSuccess: status.successDot,
  statusDotWarning: status.warningDot,
  statusDotDanger: status.dangerDot,
  statusDotRunning: status.runningDot,
  statusMerged: status.merged,
  destructive: status.destructive,
});

const THEME_ID = "live";
/** How many painted colour pairs `isShowing` accepts: the app applies a repaint a frame or two late. */
const RECENT = 32;

export const themeName = (preset: Preset, mode: Mode) => `Neon Noir · ${preset.name}${mode === "light" ? " Light" : ""}`;

/** What the device's system says, dark unless it says light. */
export const readSystemMode = (): Mode => (Appearance.getColorScheme() === "light" ? "light" : "dark");

const signatureOf = (colors: ThemeColors, name: string, status: StatusColors) =>
  [
    name,
    status.success,
    status.warning,
    status.danger,
    colors.background,
    colors.foreground,
    colors.raised,
    colors.control,
    colors.border,
    colors.accent,
    colors.mutedForeground,
    colors.ring,
  ].join("|");

const pairOf = (surface0: string, accent: string) => `${surface0}|${accent}`.toLowerCase();

/**
 * Registers the theme at once in the default preset's colours, so the app starts black rather than
 * in Paseo's own theme, then follows the host's saved settings: read now, again after every change
 * any client saves, and after every reconnect.
 */
export function createLiveTheme(client: PluginClientContext): LiveTheme {
  let remove: PluginCleanup | null = null;
  let signature = "";
  let overlay: ThemeOverlay | null = null;
  let registered: Parameters<typeof client.addTheme>[0] | null = null;
  let repainted = "";
  let presetName = "";
  const recent: string[] = [];
  const listeners = new Set<() => void>();
  let saved: StudioValues | null = null;
  let holds = 0;
  let reads = 0;
  let disposed = false;

  function update(colors: ThemeColors, preset: Preset, status: StatusColors, mode: Mode) {
    const name = themeName(preset, mode);
    const next = signatureOf(colors, name, status);
    if (disposed || next === signature) return;
    // Before the registration: the commit it causes is the one the overlay must ride on.
    overlay = overlayOf(status);
    // Removing first frees the id for the new registration. Both registry publishes land in this
    // one task and React renders them as one commit, so the default theme never shows in between.
    void remove?.();
    registered = { id: THEME_ID, name, appearance: mode, colors };
    remove = client.addTheme(registered);
    signature = next;
    presetName = mode === "light" ? `${preset.name} · Light` : preset.name;
    recent.push(pairOf(colors.background, colors.accent));
    if (recent.length > RECENT) recent.shift();
    for (const listener of listeners) listener();
  }

  const read = settingsRpc(studioSettings.id).read;
  async function refresh() {
    const ticket = ++reads;
    const result = await client.rpc(read, {}).catch((error: unknown) => {
      console.warn("[neon-noir] Could not read the studio settings", error);
      return null;
    });
    // Only the latest read counts: one sent later answers for a newer document.
    if (result === null || disposed || ticket !== reads || result.status !== "ready") return;
    const parsed = studioSettings.schema.safeParse(result.values);
    if (!parsed.success) return;
    saved = parsed.data;
    paintSaved();
  }

  /** Paints the host's saved look in the mode its choice comes to on this device now. */
  function paintSaved() {
    if (saved === null || holds > 0) return;
    const preset = presetById(saved.presetId);
    const mode = effectiveMode(saved.appearance, readSystemMode());
    const resolved = resolveTheme(preset.id, editOf(saved.edits, preset.id), mode);
    update(resolved.colors, preset, resolveStatus(preset, resolved.knobs, resolved.colors, mode), mode);
  }

  const initial = resolveTheme(DEFAULT_PRESET_ID, null, effectiveMode(DEFAULT_APPEARANCE, readSystemMode()));
  update(initial.colors, initial.preset, resolveStatus(initial.preset, initial.knobs, initial.colors, initial.mode), initial.mode);

  // The system switching between light and dark: repaint from what is saved, or tell an open
  // studio, which paints its own unsaved values.
  const systemListeners = new Set<() => void>();
  const appearance = Appearance.addChangeListener(() => {
    if (disposed) return;
    for (const listener of systemListeners) listener();
    paintSaved();
  });

  const observation = client.paseo.observeEvents(["status.plugin_settings_changed"]);
  observation.subscribe({
    // Fires once the subscription stands and again after each reconnect, which may have missed a save.
    snapshot: () => void refresh(),
    update: (message) => {
      // Matched on the document id alone: the entry cannot know its installation id, and an extra
      // read for another plugin's "studio" costs less than a missed one of ours.
      if (
        message.type === "status" &&
        message.payload.status === "plugin_settings_changed" &&
        message.payload.settingsId === studioSettings.id
      )
        void refresh();
    },
  });
  // Without waiting for the subscription: one round trip less between the default colours and the saved ones.
  void refresh();

  return {
    update,
    systemMode: readSystemMode,
    subscribeSystem(listener) {
      systemListeners.add(listener);
      return () => {
        systemListeners.delete(listener);
      };
    },
    overlay: () => overlay,
    repaintOnce() {
      if (disposed || registered === null || repainted === signature) return;
      repainted = signature;
      void remove?.();
      remove = client.addTheme(registered);
    },
    presetName: () => presetName,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isShowing: (colors) => recent.includes(pairOf(colors.surface0, colors.accent)),
    saved: () => saved,
    hold() {
      holds += 1;
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holds -= 1;
        if (holds === 0) void refresh();
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      systemListeners.clear();
      appearance.remove();
      void observation
        .release()
        .catch((error: unknown) => console.warn("[neon-noir] Could not stop following settings", error));
    },
  };
}
