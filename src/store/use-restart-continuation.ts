import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";

/** Startup recovery waits for the owning registry before examining durable turns. */
export function useRestartContinuation() {
  const hydrated = useAppStore(state => state.hasHydratedWorkspaces);
  useEffect(() => {
    if (hydrated) void useAppStore.getState().recoverInterruptedTasks().catch(error => {
      console.error("[restart-recovery] failed to inspect interrupted turns", error);
    });
  }, [hydrated]);
}
