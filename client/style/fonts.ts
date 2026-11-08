import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { fileFor, filesOf, fontRpc, type BundledFont, type FontFile } from "../../shared/style.ts";

const STYLE_ID = "neon-noir-fonts";
const PREVIEW_STYLE_ID = "neon-noir-font-previews";
const UI_FALLBACK = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const fontsSupported = Platform.OS === "web" || Platform.OS === "ios";

/** On the web the faces get a family name of their own, so a copy installed on the Mac cannot stand in. */
const webFamily = (font: BundledFont) => `Neon Noir ${font.family}`;
/** Previews have their own name: dropping the applied fonts never takes a preview with it. */
const previewFamily = (font: BundledFont) => `Neon Noir Preview ${font.family}`;
const stack = (family: string, font: BundledFont) => `"${family}", ${font.kind === "ui" ? UI_FALLBACK : MONO_FALLBACK}`;

/**
 * What Paseo's uiFontFamily / monoFontFamily must hold to show this font here: a CSS stack on the
 * web, the family the files register under on iOS; null where the plugin cannot load fonts.
 */
export function paseoFamily(font: BundledFont): string | null {
  if (Platform.OS === "web") return stack(webFamily(font), font);
  if (Platform.OS === "ios") return font.family;
  return null;
}

interface ExpoFileSystem {
  cacheDirectory?: string | null;
  getInfoAsync?(uri: string, options: object): Promise<{ exists?: boolean }>;
  writeAsStringAsync?(uri: string, contents: string, options: { encoding: "base64" }): Promise<void>;
}
interface ExpoFontLoader {
  loadAsync?(alias: string, uri: string): Promise<void>;
}

function expoModules(): { files: ExpoFileSystem | null; loader: ExpoFontLoader | null } {
  const modules = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  return {
    files: (modules?.ExponentFileSystem as ExpoFileSystem | undefined) ?? null,
    loader: (modules?.ExpoFontLoader as ExpoFontLoader | undefined) ?? null,
  };
}

const fileKey = (font: BundledFont, file: FontFile) => `${font.id}:${file.weight}:${file.italic ? "italic" : "normal"}`;
const baseName = (file: FontFile) => file.path.slice(file.path.lastIndexOf("/") + 1);

/** A preview needs the regular file only; `full` asks for every weight, as the hero's bold does. */
const previewFiles = (font: BundledFont, full: boolean) => (full ? filesOf(font) : [fileFor(font, 400)]);

export interface FontLoader {
  /** Makes these fonts usable here; on the web it also drops the ones left out. True once done. */
  use(fonts: readonly BundledFont[]): Promise<boolean>;
  /** The fontFamily a preview's text takes, once the font is loaded here; null until then. */
  previewed(font: BundledFont, full?: boolean): string | null;
  /** Loads a font for previews and answers with `previewed`. Never throws: a failure is null. */
  preview(font: BundledFont, full?: boolean): Promise<string | null>;
  dispose(): void;
}

export function createFontLoader(client: PluginClientContext): FontLoader {
  const files = new Map<string, Promise<{ base64: string; format: "truetype" | "opentype" }>>();
  /** iOS registers fonts for the life of the process, so each file once. */
  const registered = new Set<string>();
  /** Files with a preview rule on the page. */
  const previewRules = new Set<string>();
  const previewing = new Map<string, Promise<string | null>>();
  /** iOS registers one font at a time, previews and applied fonts alike, so no file is registered twice. */
  let iosQueue: Promise<unknown> = Promise.resolve();
  function onIosQueue<T>(task: () => Promise<T>): Promise<T> {
    const run = iosQueue.then(task, task);
    iosQueue = run.catch(() => undefined);
    return run;
  }
  let generation = 0;
  let disposed = false;

  function fetchFile(font: BundledFont, file: FontFile) {
    const key = fileKey(font, file);
    let fetched = files.get(key);
    if (fetched === undefined) {
      fetched = client.rpc(fontRpc, { id: font.id, weight: file.weight, italic: file.italic });
      fetched.catch(() => files.delete(key));
      files.set(key, fetched);
    }
    return fetched;
  }

  async function faceRule(family: string, font: BundledFont, file: FontFile, display: "swap" | "block") {
    const { base64, format } = await fetchFile(font, file);
    const mime = format === "opentype" ? "font/otf" : "font/ttf";
    // A variable file covers its whole axis, so the browser draws real weights instead of faking them.
    const weight = font.variable !== undefined && !file.italic ? `${font.variable.min} ${font.variable.max}` : `${file.weight}`;
    const style = file.italic ? "italic" : "normal";
    return `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:${display};src:url(data:${mime};base64,${base64}) format("${format}");}`;
  }

  function styleElement(id: string): HTMLStyleElement {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLStyleElement) return existing;
    const style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
    return style;
  }

  async function useOnWeb(fonts: readonly BundledFont[]): Promise<boolean> {
    const ticket = ++generation;
    const rules = await Promise.all(
      fonts.flatMap((font) => filesOf(font).map((file) => faceRule(webFamily(font), font, file, "swap"))),
    );
    // A newer choice made while these were on their way wins.
    if (disposed || ticket !== generation) return false;
    if (rules.length === 0) {
      document.getElementById(STYLE_ID)?.remove();
      return true;
    }
    styleElement(STYLE_ID).textContent = rules.join("\n");
    return true;
  }

  async function registerOnIos(font: BundledFont, wanted: readonly FontFile[]): Promise<boolean> {
    const { files: fileSystem, loader } = expoModules();
    const directory = fileSystem?.cacheDirectory;
    if (!directory || typeof fileSystem?.writeAsStringAsync !== "function" || typeof loader?.loadAsync !== "function")
      return false;
    for (const file of wanted) {
      const name = baseName(file);
      const alias = `NeonNoir-${name.replace(/\.[^.]+$/, "")}`;
      if (registered.has(alias)) continue;
      const uri = `${directory}neon-noir-${name}`;
      const info = await fileSystem.getInfoAsync?.(uri, {}).catch(() => null);
      if (info?.exists !== true) {
        await fileSystem.writeAsStringAsync(uri, (await fetchFile(font, file)).base64, { encoding: "base64" });
      }
      // Registering the file also makes its own family name ("Geist") known to UIKit, with every
      // weight loaded so far, which is what Paseo's fontFamily setting names.
      await loader.loadAsync(alias, uri);
      registered.add(alias);
    }
    return true;
  }

  async function useOnIos(fonts: readonly BundledFont[]): Promise<boolean> {
    for (const font of fonts) if (!(await registerOnIos(font, filesOf(font)))) return false;
    return true;
  }

  function previewed(font: BundledFont, full = false): string | null {
    if (Platform.OS === "web") {
      return previewFiles(font, full).every((file) => previewRules.has(fileKey(font, file))) ? stack(previewFamily(font), font) : null;
    }
    // iOS previews in the family Paseo will be told to use, so a preview that shows is one that applies.
    if (Platform.OS === "ios") {
      return previewFiles(font, full).every((file) => registered.has(`NeonNoir-${baseName(file).replace(/\.[^.]+$/, "")}`))
        ? font.family
        : null;
    }
    return null;
  }

  async function previewOnWeb(font: BundledFont, full: boolean): Promise<void> {
    const missing = previewFiles(font, full).filter((file) => !previewRules.has(fileKey(font, file)));
    if (missing.length === 0) return;
    const rules = await Promise.all(missing.map((file) => faceRule(previewFamily(font), font, file, "block")));
    if (disposed) return;
    styleElement(PREVIEW_STYLE_ID).append(rules.join("\n"));
    for (const file of missing) previewRules.add(fileKey(font, file));
    // Waits for the face to be decoded, so the text does not flash in the fallback first.
    const fontSet = (document as { fonts?: { load?(font: string): Promise<unknown> } }).fonts;
    await fontSet?.load?.(`20px "${previewFamily(font)}"`).catch(() => undefined);
  }

  function preview(font: BundledFont, full = false): Promise<string | null> {
    const ready = previewed(font, full);
    if (ready !== null || !fontsSupported || disposed) return Promise.resolve(ready);
    const key = `${font.id}:${full ? "full" : "regular"}`;
    const pending = previewing.get(key);
    if (pending !== undefined) return pending;
    const work = async (): Promise<string | null> => {
      try {
        if (Platform.OS === "web" && typeof document !== "undefined") await previewOnWeb(font, full);
        else if (Platform.OS === "ios") await registerOnIos(font, previewFiles(font, full));
      } catch (error) {
        console.warn(`[neon-noir] Could not load a preview of ${font.family}`, error);
      }
      return previewed(font, full);
    };
    const run = Platform.OS === "ios" ? onIosQueue(work) : work();
    const settled = run.finally(() => previewing.delete(key));
    previewing.set(key, settled);
    return settled;
  }

  return {
    async use(fonts) {
      try {
        if (Platform.OS === "web" && typeof document !== "undefined") return await useOnWeb(fonts);
        if (Platform.OS === "ios") return await onIosQueue(() => useOnIos(fonts));
      } catch (error) {
        console.warn("[neon-noir] Could not load the fonts", error);
      }
      return false;
    },
    previewed,
    preview,
    dispose() {
      disposed = true;
      if (typeof document !== "undefined") {
        document.getElementById(STYLE_ID)?.remove();
        document.getElementById(PREVIEW_STYLE_ID)?.remove();
      }
    },
  };
}
