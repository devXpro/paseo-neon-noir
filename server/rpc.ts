import type { PluginServerContext } from "@getpaseo/plugin/server";

/**
 * Daemon-side RPC handlers live here. None yet: define a contract with `defineRpc` in shared/,
 * then answer it with `server.handle(contract, handler)` in this function.
 */
export function registerRpcs(_server: PluginServerContext): void {}
