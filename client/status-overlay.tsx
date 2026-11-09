import type { PluginTheme } from "@getpaseo/plugin";
import { useContext, useEffect, useLayoutEffect, useState, type Context, type RefObject } from "react";
import type { LiveTheme, ThemeOverlay } from "./live-theme.ts";
import { LIVE_THEME_ID, fiberOf, isRecord } from "./style/paseo.ts";

/**
 * Paseo's plugin themes take eight colours; everything else (status, badges, dots, destructive) it
 * fills in itself. The theme object it builds is handed to Unistyles from a passive effect of
 * AppearanceProvider, which runs after the layout effects of its own commit, so a component that
 * reads the provider's context can recolour that object first: no second paint, the same code on
 * the web and on native, and every other plugin receives the colours through its `theme` prop.
 * Nothing here is public API. When a Paseo update breaks it the app just keeps its stock statuses.
 */
interface ThemeOption {
  id: string;
  theme: { colors: Record<string, unknown> };
}
interface ContributedThemes {
  selected: ThemeOption | null;
}

/** How long a mismatch may last before it counts: a repaint reaches the props a frame or two late. */
const SETTLE_MS = 800;

function isContributedThemes(value: unknown): value is ContributedThemes {
  return isRecord(value) && "options" in value && "selected" in value && typeof value.select === "function";
}

function findThemes(node: unknown): { context: Context<ContributedThemes | null>; value: ContributedThemes } | null {
  let steps = 0;
  for (let fiber = fiberOf(node); fiber !== null && steps < 20_000; fiber = fiber.return, steps++) {
    const value = fiber.memoizedProps?.value;
    if (isContributedThemes(value) && isRecord(fiber.type)) {
      return { context: fiber.type as unknown as Context<ContributedThemes | null>, value };
    }
  }
  return null;
}

function recolour(themes: ContributedThemes | null, overlay: ThemeOverlay | null): void {
  const selected = themes?.selected;
  if (!selected || selected.id !== LIVE_THEME_ID || overlay === null) return;
  const colors = selected.theme?.colors;
  if (!isRecord(colors) || typeof colors.statusSuccess !== "string") return;
  Object.assign(colors, overlay);
}

/** Re-rendered by React in the same commit as every new selected theme. */
function Consumer({ context, live }: { context: Context<ContributedThemes | null>; live: LiveTheme }) {
  const themes = useContext(context);
  useLayoutEffect(() => {
    try {
      recolour(themes, live.overlay());
    } catch (error) {
      console.warn("[neon-noir] Could not recolour the theme", error);
    }
  });
  return null;
}

export function StatusOverlay({
  anchor,
  live,
  theme,
}: {
  anchor: RefObject<unknown>;
  live: LiveTheme;
  theme: PluginTheme;
}) {
  const [context, setContext] = useState<Context<ContributedThemes | null> | null>(null);

  useLayoutEffect(() => {
    if (context !== null) return;
    try {
      const found = findThemes(anchor.current);
      if (found === null) return;
      // This commit may be the very one that brought the theme: recolour it now, follow from here on.
      recolour(found.value, live.overlay());
      setContext(found.context);
    } catch (error) {
      console.warn("[neon-noir] Could not find Paseo's themes", error);
    }
  }, [anchor, context, live]);

  // A theme applied while no row was mounted (settings on the phone, a route without the sidebar)
  // went through uncoloured. Seen from the props, that is a mismatch, and one repaint settles it.
  const shown = theme.colors.statusSuccess;
  const wanted = live.overlay()?.statusSuccess;
  const showing = live.isShowing(theme.colors);
  useEffect(() => {
    if (wanted === undefined || !showing || shown.toLowerCase() === wanted.toLowerCase()) return;
    const timer = setTimeout(() => live.repaintOnce(), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [live, shown, showing, wanted]);

  return context === null ? null : <Consumer context={context} live={live} />;
}
