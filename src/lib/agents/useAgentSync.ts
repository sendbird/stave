import { useEffect, useMemo } from "react";
import { useAppStore } from "@/store/app.store";
import { buildAgentRouteSettings } from "@/store/agent-route-settings-sync";

/**
 * Keeps main's and the host's copy of the saved custom agents current, so a
 * delegation, a project or a mission stage can name one. Settings live in the
 * renderer; main hands the copy again to a host that restarts. The user's
 * Stave Auto settings travel with them, so the host routes an agent run's
 * turns as the composer would.
 */
export function useAgentSync() {
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const myStandards = useAppStore((state) => state.settings.myStandards);
  const settings = useAppStore((state) => state.settings);
  const routeSettings = useMemo(() => JSON.stringify(buildAgentRouteSettings(settings)), [settings]);
  useEffect(() => {
    const sync = typeof window === "undefined" ? undefined : window.api?.agents?.sync;
    if (!sync) return;
    const timer = window.setTimeout(() => {
      void sync({ customAgents, myStandards, routeSettings: JSON.parse(routeSettings) }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customAgents, myStandards, routeSettings]);
}
