import type { PluginClientContext } from "@getpaseo/plugin/client";
import { presetById } from "../../shared/settings.ts";
import { fontById, type BundledFont, type FontValues, type FxValues, type StyleValues } from "../../shared/style.ts";
import type { LiveTheme } from "../live-theme.ts";
import { createFontLoader, paseoFamily } from "./fonts.ts";
import { createFx } from "./fx.ts";
import {
  LIVE_THEME_ID,
  OWNED_KEYS,
  applyPatch,
  readBlob,
  readDeviceId,
  reloadApp,
  type OwnedValue,
  type PaseoPatch,
} from "./paseo.ts";
import { createStyleStore, type StoreStatus, type StyleStore } from "./store.ts";
import { syntaxFor } from "./syntax.ts";

export interface StyleSnapshot {
  values: StyleValues | null;
  status: StoreStatus;
  error: string | null;
  /** This device lets the plugin change its Paseo settings: its backup is on the host. */
  consented: boolean;
  /** Paseo's settings changed on disk, but the running app could not be reached to take them; a reload shows them. */
  needsReload: boolean;
  /** The theme switch's position while Paseo has yet to show it: true on, false off, null when nothing is on its way. */
  themeWanted: boolean | null;
  /** The theme was turned off on this device this session: picking a preset leaves it off. */
  declined: boolean;
  /** The last thing that could not be done to Paseo's settings. */
  problem: string | null;
  /** Paseo's sizes on this device as last read, for the steppers to start from. */
  device: { uiBaseFontSize: number | null; codeFontSize: number | null };
  /** The wallpaper folder the host has saved: the only one it lists and reads images from. */
  hostFolder: string | null;
}

export interface StyleRuntime {
  snapshot(): StyleSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Edits the style document. `paseo` marks an edit of something Paseo itself stores (fonts,
   * sizes, syntax): made in this device's studio, it lets the plugin change Paseo's settings here.
   */
  edit(change: (values: StyleValues) => StyleValues, options?: { paseo?: boolean }): Promise<boolean>;
  /**
   * A preset was picked in this device's studio: with fonts following the preset, its pair is
   * picked too and goes the way of any font choice.
   */
  presetPicked(presetId: string): void;
  /** The fontFamily a font preview's text takes once the font has loaded here; null until then. */
  previewedFont(font: BundledFont, full?: boolean): string | null;
  /** Loads a font for previews; never rejects. `full` loads every weight, not just the regular. */
  previewFont(font: BundledFont, full?: boolean): Promise<string | null>;
  /** Shows these effects without saving them, while a slider is held. */
  preview(fx: FxValues): void;
  /** The preset the open studio shows, ahead of the host's copy of it. */
  notePreset(presetId: string): void;
  /** Makes Neon Noir Paseo's theme on this device, keeping a copy of its settings first. */
  activate(): Promise<void>;
  /** Gives this device its previous theme back from that copy; fonts, sizes and syntax stay. */
  deactivate(): Promise<void>;
  /** The app shows what the switch asked for. */
  settleTheme(): void;
  /** Puts this device's Paseo settings back from its backup and stops changing them here. */
  restore(): Promise<void>;
  /** A host node of a mounted plugin component: the way up to Paseo's settings cache. */
  anchor(node: unknown): () => void;
  reload(): void;
  resetStored(): Promise<void>;
  dispose(): void;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

const ownedValue = (value: unknown): OwnedValue | undefined =>
  typeof value === "string" || typeof value === "number" || value === null ? value : undefined;

/**
 * The theme keys as a backup has them. A backup taken while Neon Noir was already picked in
 * Paseo's own settings would turn it straight back on, so that one gives Paseo's default instead.
 */
function previousTheme(blob: Readonly<Record<string, unknown>> | null): PaseoPatch {
  const theme = ownedValue(blob?.theme);
  const pluginThemeId = ownedValue(blob?.pluginThemeId);
  if (theme === "plugin" && pluginThemeId === LIVE_THEME_ID) return { theme: undefined, pluginThemeId: undefined };
  return { theme, pluginThemeId };
}

/** A preset's font pair as the style document names it. */
export function presetPair(presetId: string): Pick<FontValues, "ui" | "mono"> {
  const { fonts } = presetById(presetId);
  return { ui: fonts.ui, mono: fonts.code };
}

/** Any element of the app works as a way up on the web, should no plugin component be mounted. */
function pageAnchor(): unknown[] {
  if (typeof document === "undefined") return [];
  const element = document.querySelector("#root [data-testid]");
  return element === null ? [] : [element];
}

/**
 * Applies the style on this device and keeps it in step with the host's document: the desktop
 * effects everywhere a page exists, and Paseo's own settings (fonts, sizes, syntax theme) only on
 * a device whose studio was used to change them, which is when its backup is taken.
 */
export function createStyleRuntime(client: PluginClientContext, live: LiveTheme): StyleRuntime {
  const store = createStyleStore(client);
  const fonts = createFontLoader(client);
  const fx = createFx(client);
  const anchors = new Set<unknown>();
  const listeners = new Set<() => void>();
  let deviceId: string | null = null;
  let needsReload = false;
  let themeWanted: boolean | null = null;
  let themeTicket = 0;
  let declined = false;
  let problem: string | null = null;
  let device: StyleSnapshot["device"] = { uiBaseFontSize: null, codeFontSize: null };
  let snapshot = makeSnapshot();
  let notedPreset: string | null = null;
  let lastPreset: string | null = null;
  let fontKey = "";
  let fontsReady: Promise<boolean> = Promise.resolve(true);
  /** The values the plugin last gave Paseo's owned keys on this device, by its own reckoning. */
  let applied: PaseoPatch = {};
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;

  function consented(): boolean {
    const confirmed = store.confirmed();
    return deviceId !== null && confirmed !== null && deviceId in confirmed.backup;
  }

  function makeSnapshot(): StyleSnapshot {
    return {
      values: store.values(),
      status: store.status(),
      error: store.error(),
      consented: consented(),
      needsReload,
      themeWanted,
      declined,
      problem,
      device,
      hostFolder: store.confirmed()?.fx.folder ?? null,
    };
  }

  async function readDevice() {
    const blob = await readBlob().catch(() => null);
    const size = (value: unknown) => (typeof value === "number" ? value : null);
    device = { uiBaseFontSize: size(blob?.uiBaseFontSize), codeFontSize: size(blob?.codeFontSize) };
    emit();
  }

  function emit() {
    snapshot = makeSnapshot();
    for (const listener of listeners) listener();
  }

  function enqueue(task: () => Promise<void>): Promise<void> {
    queue = queue.then(task).catch((error: unknown) => {
      problem = describe(error);
      console.warn("[neon-noir] Could not change Paseo's settings", error);
      emit();
    });
    return queue;
  }

  /**
   * Turns Neon Noir on or off here. The switch shows the new position until the app does (the
   * studio then calls settleTheme); a failure leaves Paseo as it was, and the switch follows it back.
   */
  function switchTheme(on: boolean, task: () => Promise<void>): Promise<void> {
    const ticket = ++themeTicket;
    themeWanted = on;
    declined = !on;
    emit();
    let done = false;
    return enqueue(async () => {
      await task();
      problem = null;
      done = true;
      emit();
    }).then(() => {
      if (done || ticket !== themeTicket) return;
      themeWanted = null;
      emit();
    });
  }

  function presetNow(): string | null {
    const saved = live.saved()?.presetId ?? null;
    if (notedPreset !== null && saved === notedPreset) notedPreset = null;
    return notedPreset ?? saved;
  }

  function chosenFonts(values: StyleValues): BundledFont[] {
    if (!values.fonts.enabled) return [];
    return [fontById(values.fonts.ui), fontById(values.fonts.mono)].filter((font) => font !== null);
  }

  /** What the style wants Paseo's owned keys to hold here; a key left out is not the plugin's. */
  function targets(values: StyleValues): PaseoPatch {
    const wanted: PaseoPatch = {};
    if (values.fonts.enabled) {
      const ui = fontById(values.fonts.ui);
      const mono = fontById(values.fonts.mono);
      const uiFamily = ui === null ? null : paseoFamily(ui);
      const monoFamily = mono === null ? null : paseoFamily(mono);
      if (uiFamily !== null) wanted.uiFontFamily = uiFamily;
      if (monoFamily !== null) wanted.monoFontFamily = monoFamily;
      if (values.fonts.uiSize !== null) wanted.uiBaseFontSize = values.fonts.uiSize;
      if (values.fonts.codeSize !== null) wanted.codeFontSize = values.fonts.codeSize;
    }
    const preset = presetNow();
    if (values.syntax && preset !== null) wanted.syntaxTheme = syntaxFor(preset);
    return wanted;
  }

  async function write(patch: PaseoPatch, explicit: boolean): Promise<boolean> {
    const ways = [...anchors, ...pageAnchor()];
    // Without a way to the live cache, a write could be undone by Paseo's next save of its stale
    // copy; an automatic one waits for a plugin component to mount instead.
    if (ways.length === 0 && !explicit) return false;
    if ((await applyPatch(patch, ways)) === "stored") needsReload = true;
    await readDevice();
    return true;
  }

  /**
   * Gives Paseo's owned keys what the style wants. A key the style lets go of (a feature switched
   * off, "System" picked) gets the device's own value back, unless something else changed it since.
   */
  function sync() {
    void enqueue(async () => {
      const values = store.values();
      const backup = deviceId === null ? undefined : store.confirmed()?.backup[deviceId];
      if (disposed || values === null || backup === undefined) return;
      const wanted = targets(values);
      const blob = (await readBlob()) ?? {};
      const patch: PaseoPatch = {};
      for (const key of OWNED_KEYS) {
        const target = wanted[key];
        if (target !== undefined) {
          if (blob[key] !== target) patch[key] = target;
        } else if (applied[key] !== undefined && blob[key] === applied[key]) {
          patch[key] = ownedValue(backup.blob?.[key]);
        }
      }
      if (Object.keys(patch).length > 0) {
        if ("uiFontFamily" in patch || "monoFontFamily" in patch) await fontsReady;
        if (!(await write(patch, false))) return;
      }
      applied = wanted;
    });
  }

  /** Keeps a copy of this device's Paseo settings on the host before the first change to them. */
  async function ensureConsent(): Promise<void> {
    if (deviceId === null) deviceId = await readDeviceId();
    if (consented()) return;
    const id = deviceId;
    const blob = await readBlob();
    const saved = await store.update((values) =>
      id in values.backup ? values : { ...values, backup: { ...values.backup, [id]: { at: new Date().toISOString(), blob } } },
    );
    if (!saved || !consented()) throw new Error("Couldn't back up Paseo's settings, so they were left alone.");
  }

  let fxKey = "";
  function applyFx(values: FxValues | null) {
    const key = values === null ? "" : JSON.stringify(values);
    if (key === fxKey) return;
    fxKey = key;
    fx.apply(values);
  }

  function onStore() {
    const values = store.values();
    if (values !== null) {
      applyFx(values.fx.enabled ? values.fx : null);
      // Fonts only where Paseo will be pointed at them: the bytes are not small.
      const wanted = consented() ? chosenFonts(values) : [];
      const key = wanted.map((font) => font.id).join(",");
      if (key !== fontKey) {
        fontKey = key;
        fontsReady = fonts.use(wanted);
      }
      sync();
    }
    emit();
  }

  const stopStore = store.subscribe(onStore);
  const stopLive = live.subscribe(() => {
    const preset = presetNow();
    if (preset === lastPreset) return;
    lastPreset = preset;
    sync();
  });
  void readDeviceId().then(
    (id) => {
      deviceId = id;
      onStore();
      void readDevice();
    },
    (error: unknown) => {
      problem = describe(error);
      emit();
    },
  );

  function edit(change: (values: StyleValues) => StyleValues, options?: { paseo?: boolean }): Promise<boolean> {
    const saved = store.update(change);
    if (options?.paseo === true) void enqueue(ensureConsent).then(sync);
    return saved;
  }

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    edit,
    presetPicked(presetId) {
      const values = store.values();
      if (values === null || !values.fonts.follow) return;
      const pair = presetPair(presetId);
      if (values.fonts.ui === pair.ui && values.fonts.mono === pair.mono) return;
      // Paseo's settings change only where custom fonts are on; otherwise the pair waits in the document.
      void edit((current) => ({ ...current, fonts: { ...current.fonts, ...pair } }), { paseo: values.fonts.enabled });
    },
    previewedFont: (font, full) => fonts.previewed(font, full),
    previewFont: (font, full) => fonts.preview(font, full),
    preview(values) {
      applyFx(values);
    },
    notePreset(presetId) {
      notedPreset = presetId;
      if (presetId === lastPreset) return;
      lastPreset = presetId;
      sync();
    },
    activate() {
      return switchTheme(true, async () => {
        await ensureConsent();
        await write({ theme: "plugin", pluginThemeId: LIVE_THEME_ID }, true);
      });
    },
    deactivate() {
      return switchTheme(false, async () => {
        if (deviceId === null) deviceId = await readDeviceId();
        // Without a backup Neon Noir was picked in Paseo's own settings: off is Paseo's default theme.
        // None is taken here either, which would let the style change this device's fonts.
        const backup = store.confirmed()?.backup[deviceId];
        await write(previousTheme(backup?.blob ?? null), true);
      });
    },
    settleTheme() {
      if (themeWanted === null) return;
      themeWanted = null;
      emit();
    },
    restore() {
      return switchTheme(false, async () => {
        const id = deviceId;
        const backup = id === null ? undefined : store.confirmed()?.backup[id];
        if (id === null || backup === undefined) return;
        const patch = previousTheme(backup.blob);
        for (const key of OWNED_KEYS) if (!(key in patch)) patch[key] = ownedValue(backup.blob?.[key]);
        await write(patch, true);
        applied = {};
        await store.update((values) => {
          const { [id]: _restored, ...rest } = values.backup;
          return { ...values, backup: rest };
        });
      });
    },
    anchor(node) {
      if (node === null || node === undefined) return () => {};
      anchors.add(node);
      sync();
      return () => {
        anchors.delete(node);
      };
    },
    reload: reloadApp,
    resetStored: () => store.reset(),
    dispose() {
      disposed = true;
      stopLive();
      stopStore();
      listeners.clear();
      fx.dispose();
      fonts.dispose();
      store.dispose();
    },
  };
}
