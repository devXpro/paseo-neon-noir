import { Platform, TurboModuleRegistry } from "react-native";

/**
 * Paseo's own app settings, reached from the outside: the JSON blob it keeps per device under
 * `@paseo:app-settings` (localStorage on the web, AsyncStorage on the phone) and the React Query
 * entry its AppearanceProvider reads them from. Writing the blob alone would only show after a
 * restart, and Paseo's next save of its cached copy would overwrite it; setting the cached entry
 * too applies the change at once. Paseo's settings shape: packages/app/src/hooks/use-settings.
 */
const APP_SETTINGS_KEY = "@paseo:app-settings";
const CLIENT_ID_KEY = "@paseo:client-id-v1";
const APP_SETTINGS_QUERY_KEY = ["app-settings"];

export const LIVE_THEME_ID = "neon-noir/theme/live";

/** The only keys the plugin writes; every other key in the blob stays as Paseo stored it. */
export const OWNED_KEYS = [
  "theme",
  "pluginThemeId",
  "syntaxTheme",
  "uiFontFamily",
  "monoFontFamily",
  "uiBaseFontSize",
  "codeFontSize",
] as const;
export type OwnedKey = (typeof OWNED_KEYS)[number];
export type OwnedValue = string | number | null;
/** New values for owned keys. `undefined` removes the key, so Paseo falls back to its default. */
export type PaseoPatch = Partial<Record<OwnedKey, OwnedValue | undefined>>;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** The stored blob: whatever JSON Paseo wrote. */
export type PaseoBlob = { [key: string]: JsonValue };

interface KeyValueStore {
  read(keys: readonly string[]): Promise<(string | null)[]>;
  write(key: string, value: string): Promise<void>;
}

interface NativeAsyncStorage {
  multiGet(keys: string[], callback: (errors?: unknown, result?: [string, string | null][] | null) => void): void;
  multiSet(pairs: [string, string][], callback: (errors?: unknown) => void): void;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failed = (errors: unknown) => (Array.isArray(errors) ? errors.length > 0 : Boolean(errors));

function webStore(): KeyValueStore | null {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (storage === undefined) return null;
  return {
    read: async (keys) => keys.map((key) => storage.getItem(key)),
    write: async (key, value) => storage.setItem(key, value),
  };
}

/** AsyncStorage's native module, looked up the way @react-native-async-storage 2.x does. */
function nativeStore(): KeyValueStore | null {
  const registry = TurboModuleRegistry as { get?: (name: string) => unknown } | undefined;
  if (typeof registry?.get !== "function") return null;
  let module: NativeAsyncStorage | null = null;
  for (const name of ["PlatformLocalStorage", "RNC_AsyncSQLiteDBStorage", "RNCAsyncStorage"]) {
    try {
      const candidate = registry.get(name);
      if (isRecord(candidate) && typeof candidate.multiGet === "function" && typeof candidate.multiSet === "function") {
        module = candidate as unknown as NativeAsyncStorage;
        break;
      }
    } catch {
      // Not linked under this name.
    }
  }
  if (module === null) return null;
  const native = module;
  return {
    read: (keys) =>
      new Promise((resolve, reject) =>
        native.multiGet([...keys], (errors, result) => {
          if (failed(errors)) return reject(new Error("AsyncStorage could not read Paseo's settings"));
          const values = new Map(result ?? []);
          resolve(keys.map((key) => values.get(key) ?? null));
        }),
      ),
    write: (key, value) =>
      new Promise((resolve, reject) =>
        native.multiSet([[key, value]], (errors) =>
          failed(errors) ? reject(new Error("AsyncStorage could not save Paseo's settings")) : resolve(),
        ),
      ),
  };
}

let cachedStore: KeyValueStore | null | undefined;
function store(): KeyValueStore {
  if (cachedStore === undefined) cachedStore = Platform.OS === "web" ? webStore() : nativeStore();
  if (cachedStore === null) throw new Error("Paseo's settings storage is not reachable from the plugin");
  return cachedStore;
}

/** The blob, null when the device has none yet; throws when it is not a JSON object. */
function parseBlob(raw: string | null): PaseoBlob | null {
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error("Paseo's settings are not an object");
  return parsed as PaseoBlob;
}

function merged(current: Record<string, unknown>, patch: PaseoPatch): Record<string, unknown> {
  const next = { ...current };
  for (const key of OWNED_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** This device's Paseo client id, which keys its backup; a stand-in when Paseo has none yet. */
export async function readDeviceId(): Promise<string> {
  const [id] = await store().read([CLIENT_ID_KEY]);
  return id !== null && id.trim().length > 0 ? id.trim() : `device-${Platform.OS}`;
}

export async function readBlob(): Promise<PaseoBlob | null> {
  const [raw] = await store().read([APP_SETTINGS_KEY]);
  return parseBlob(raw);
}

interface QueryClientLike {
  getQueryData(key: readonly unknown[]): unknown;
  setQueryData(key: readonly unknown[], data: unknown): unknown;
}
export interface FiberLike {
  return: FiberLike | null;
  memoizedProps?: { value?: unknown } | null;
  type?: unknown;
}

const isFiber = (value: unknown): value is FiberLike => isRecord(value) && "return" in value && "memoizedProps" in value;

/** The fiber behind a host node: a DOM element on the web, a Fabric instance on the phone. */
export function fiberOf(node: unknown): FiberLike | null {
  if (!isRecord(node)) return null;
  const handle = node.__internalInstanceHandle;
  if (isFiber(handle)) return handle;
  const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
  const fiber = key === undefined ? undefined : node[key];
  return isFiber(fiber) ? fiber : null;
}

/**
 * Walks up from a node the plugin rendered to the app's own QueryClientProvider. The plugin's
 * subtree has a QueryClient of its own on the way, so the app's is the one holding its settings.
 */
function findHostQueryClient(node: unknown): QueryClientLike | null {
  let steps = 0;
  for (let fiber = fiberOf(node); fiber !== null && steps < 20_000; fiber = fiber.return, steps++) {
    const value = fiber.memoizedProps?.value;
    if (
      isRecord(value) &&
      typeof value.getQueryCache === "function" &&
      typeof value.getQueryData === "function" &&
      typeof value.setQueryData === "function"
    ) {
      const client = value as unknown as QueryClientLike;
      if (client.getQueryData(APP_SETTINGS_QUERY_KEY) !== undefined) return client;
    }
  }
  return null;
}

/** What Paseo's loader fills in for an owned key the blob lacks (use-settings/storage.ts). */
const PASEO_DEFAULTS: Readonly<Record<OwnedKey, OwnedValue>> = {
  theme: "auto",
  pluginThemeId: null,
  syntaxTheme: "one",
  uiFontFamily: "",
  monoFontFamily: "",
  uiBaseFontSize: Platform.OS === "web" ? 14 : 15,
  codeFontSize: 12,
};

/**
 * The app's cached settings with the patch in. The cache holds every key with its default filled
 * in, so a key the patch removes from the blob takes Paseo's default there rather than going missing.
 */
function cachedWith(cached: Record<string, unknown>, patch: PaseoPatch) {
  const next = { ...cached };
  for (const key of OWNED_KEYS) {
    if (key in patch) next[key] = patch[key] === undefined ? PASEO_DEFAULTS[key] : patch[key];
  }
  return next;
}

/**
 * Merges the patch into the stored blob and into the app's cached copy. "live" when the app
 * applied it at once, "stored" when only the blob changed and a reload will show it.
 */
export async function applyPatch(patch: PaseoPatch, anchors: readonly unknown[]): Promise<"live" | "stored"> {
  const keyValue = store();
  const [raw] = await keyValue.read([APP_SETTINGS_KEY]);
  await keyValue.write(APP_SETTINGS_KEY, JSON.stringify(merged(parseBlob(raw) ?? {}, patch)));
  for (const anchor of anchors) {
    const client = findHostQueryClient(anchor);
    if (client === null) continue;
    const cached = client.getQueryData(APP_SETTINGS_QUERY_KEY);
    if (isRecord(cached)) client.setQueryData(APP_SETTINGS_QUERY_KEY, cachedWith(cached, patch));
    return "live";
  }
  return "stored";
}

/** Restarts the app so Paseo reads its stored settings afresh. */
export function reloadApp(): void {
  const expo = (globalThis as { expo?: { reloadAppAsync?: (reason?: string) => Promise<void> } }).expo;
  if (Platform.OS !== "web" && typeof expo?.reloadAppAsync === "function") {
    void expo.reloadAppAsync("neon-noir").catch((error: unknown) => console.warn("[neon-noir] Reload failed", error));
    return;
  }
  const location = (globalThis as { location?: { reload?: () => void } }).location;
  location?.reload?.();
}
