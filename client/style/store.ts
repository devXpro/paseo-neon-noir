import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { styleSettings, type StyleValues } from "../../shared/style.ts";

export type StoreStatus = "loading" | "ready" | "invalid" | "error";

/**
 * The host's "style" document, held for the whole app: the studio edits it and the appliers
 * follow it. An edit shows at once and is saved in order, one save at a time against the latest
 * revision; when another app saved first, the edits are replayed on top of its document.
 */
export interface StyleStore {
  /** The values with every unsaved edit applied; null before the first read. */
  values(): StyleValues | null;
  /** The values the host has confirmed. */
  confirmed(): StyleValues | null;
  status(): StoreStatus;
  error(): string | null;
  subscribe(listener: () => void): () => void;
  /** Resolves with whether the host kept the edit. */
  update(change: (values: StyleValues) => StyleValues): Promise<boolean>;
  /** Replaces a document the host cannot read with the defaults. */
  reset(): Promise<void>;
  dispose(): void;
}

interface Edit {
  change(values: StyleValues): StyleValues;
  settle(saved: boolean): void;
}

const MAX_REPLAYS = 3;

export function createStyleStore(client: PluginClientContext): StyleStore {
  const rpc = settingsRpc(styleSettings.id);
  let host: { revision: string; values: StyleValues } | null = null;
  let shown: StyleValues | null = null;
  let status: StoreStatus = "loading";
  let error: string | null = null;
  let invalidRevision: string | null = null;
  const edits: Edit[] = [];
  let saving = false;
  let replays = 0;
  let reads = 0;
  let disposed = false;
  const listeners = new Set<() => void>();

  function publish() {
    shown = host === null ? null : edits.reduce((values, edit) => edit.change(values), host.values);
    for (const listener of listeners) listener();
  }

  async function refresh() {
    const ticket = ++reads;
    const result = await client.rpc(rpc.read, {}).catch((reason: unknown) => {
      console.warn("[neon-noir] Could not read the style settings", reason);
      return null;
    });
    // Only the latest read counts, and a save in flight brings a newer document with its answer.
    if (disposed || ticket !== reads || saving) return;
    if (result === null) {
      if (host === null) {
        status = "error";
        error = "The host did not answer";
        publish();
      }
      return;
    }
    if (result.status === "invalid") {
      status = "invalid";
      error = result.error;
      invalidRevision = result.revision;
      publish();
      return;
    }
    const parsed = styleSettings.schema.safeParse(result.values);
    if (!parsed.success) {
      status = "invalid";
      error = parsed.error.message;
      invalidRevision = result.revision;
      publish();
      return;
    }
    host = { revision: result.revision, values: parsed.data };
    status = "ready";
    error = null;
    publish();
    void flush();
  }

  async function flush() {
    if (saving || disposed || host === null || edits.length === 0) return;
    saving = true;
    const batch = edits.slice();
    const values = batch.reduce((current, edit) => edit.change(current), host.values);
    const result = await client
      .rpc(rpc.write, { revision: host.revision, values })
      .catch((reason: unknown) => ({ status: "failed" as const, error: String(reason) }));
    saving = false;
    if (disposed) return;
    if (result.status === "saved") {
      const parsed = styleSettings.schema.safeParse(result.values);
      host = { revision: result.revision, values: parsed.success ? parsed.data : values };
      edits.splice(0, batch.length);
      replays = 0;
      error = null;
      for (const edit of batch) edit.settle(true);
    } else if (result.status === "conflict" && replays < MAX_REPLAYS) {
      replays += 1;
      await refresh();
      void flush();
      return;
    } else {
      edits.splice(0, batch.length);
      replays = 0;
      error = `Could not save: ${result.error}`;
      for (const edit of batch) edit.settle(false);
    }
    publish();
    void flush();
  }

  const observation = client.paseo.observeEvents(["status.plugin_settings_changed"]);
  observation.subscribe({
    snapshot: () => void refresh(),
    update: (message) => {
      if (
        message.type === "status" &&
        message.payload.status === "plugin_settings_changed" &&
        message.payload.settingsId === styleSettings.id
      )
        void refresh();
    },
  });
  void refresh();

  return {
    values: () => shown,
    confirmed: () => host?.values ?? null,
    status: () => status,
    error: () => error,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(change) {
      return new Promise<boolean>((resolve) => {
        if (host === null) return resolve(false);
        edits.push({ change, settle: resolve });
        publish();
        void flush();
      });
    },
    async reset() {
      if (invalidRevision === null) return;
      await client.rpc(rpc.reset, { revision: invalidRevision }).catch((reason: unknown) => {
        console.warn("[neon-noir] Could not reset the style settings", reason);
      });
      await refresh();
    },
    dispose() {
      disposed = true;
      listeners.clear();
      for (const edit of edits.splice(0)) edit.settle(false);
      void observation
        .release()
        .catch((reason: unknown) => console.warn("[neon-noir] Could not stop following the style settings", reason));
    },
  };
}
