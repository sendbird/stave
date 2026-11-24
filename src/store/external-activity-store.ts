import { useEffect } from "react";
import { create } from "zustand";
import {
  EXTERNAL_SESSIONS_OFF_SNAPSHOT,
  resolveExternalSessionsMode,
  type ExternalSessionsSnapshot,
} from "@/lib/external-sessions/external-sessions";
import { useAppStore } from "@/store/app.store";

/**
 * Activity outside Stave, as main last reported it. Kept apart from the app
 * store so a pushed snapshot re-renders only the Activity page and the
 * sidebar badge. Read `runningCount` with a primitive selector.
 */
interface ExternalActivityState {
  snapshot: ExternalSessionsSnapshot;
  runningCount: number;
}

export const useExternalActivityStore = create<ExternalActivityState>(() => ({
  snapshot: EXTERNAL_SESSIONS_OFF_SNAPSHOT,
  runningCount: 0,
}));

export function applyExternalActivitySnapshot(snapshot: ExternalSessionsSnapshot) {
  useExternalActivityStore.setState({ snapshot, runningCount: snapshot.runningCount });
}

export function resetExternalActivity() {
  applyExternalActivitySnapshot(EXTERNAL_SESSIONS_OFF_SNAPSHOT);
}

/**
 * The window's one subscription: none while the setting is off (main then
 * reads nothing), the badge scan otherwise, and the live watcher while the
 * Activity page is open. Mounted once by the app shell.
 */
export function useExternalActivitySubscription() {
  const enabled = useAppStore((state) => state.settings.externalActivityEnabled);
  const pageOpen = useAppStore((state) => state.activeAppSurface.kind === "activity");
  const mode = resolveExternalSessionsMode({ enabled, pageOpen });
  useEffect(() => {
    const api = window.api?.externalSessions;
    if (!mode || !api) {
      resetExternalActivity();
      return;
    }
    let active = true;
    const unsubscribe = api.subscribe(mode, (snapshot) => {
      if (active) applyExternalActivitySnapshot(snapshot);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [mode]);
}

export function ExternalActivitySubscription() {
  useExternalActivitySubscription();
  return null;
}
