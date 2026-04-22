import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

export default function App() {
  useEffect(() => {
    let cancelled = false;
    const setBootstrapStatus = useAppStore.getState().setPersistenceBootstrapStatus;
    const unsubscribeBootstrapStatus =
      window.api?.persistence?.subscribeBootstrapStatus?.((payload) => {
        setBootstrapStatus(payload);
      });
    void (async () => {
      const initialBootstrapStatus =
        await window.api?.persistence?.getBootstrapStatus?.();
      if (cancelled) {
        return;
      }
      if (initialBootstrapStatus) {
        setBootstrapStatus(initialBootstrapStatus);
      }
      await useAppStore.getState().hydrateProjectRegistry();
      if (cancelled) {
        return;
      }
      await useAppStore.getState().hydrateWorkspaces();
      if (cancelled) {
        return;
      }
      await useAppStore.getState().flushProjectRegistry();
      if (cancelled) {
        return;
      }
      void useAppStore.getState().hydrateNotifications();
      if (cancelled) {
        return;
      }
      void useAppStore.getState().refreshProviderAvailability();
    })();
    const providerTimer = window.setInterval(() => {
      void useAppStore.getState().refreshProviderAvailability();
    }, 10000);
    const workspaceTimer = window.setInterval(() => {
      void useAppStore.getState().refreshWorkspaces();
    }, 30000);
    return () => {
      cancelled = true;
      unsubscribeBootstrapStatus?.();
      window.clearInterval(providerTimer);
      window.clearInterval(workspaceTimer);
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;

    const scheduleSnapshotFlush = (state: ReturnType<typeof useAppStore.getState>, delayMs: number) => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (!state.hasHydratedWorkspaces || !state.activeWorkspaceId) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        void useAppStore.getState().flushActiveWorkspaceSnapshot();
      }, delayMs);
    };

    scheduleSnapshotFlush(useAppStore.getState(), 1200);
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (
        state.hasHydratedWorkspaces === prevState.hasHydratedWorkspaces
        && state.activeWorkspaceId === prevState.activeWorkspaceId
        && state.workspaceSnapshotVersion === prevState.workspaceSnapshotVersion
        && state.promptDraftPersistenceVersion === prevState.promptDraftPersistenceVersion
      ) {
        return;
      }
      const structuralChange =
        state.hasHydratedWorkspaces !== prevState.hasHydratedWorkspaces
        || state.activeWorkspaceId !== prevState.activeWorkspaceId
        || state.workspaceSnapshotVersion !== prevState.workspaceSnapshotVersion;
      scheduleSnapshotFlush(state, structuralChange ? 1200 : 5000);
    });

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      void useAppStore.getState().flushActiveWorkspaceSnapshot({ sync: true });
      void useAppStore.getState().flushProjectRegistry();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      void useAppStore.getState().flushProjectRegistry();
    };
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (
        state.projectPath === prevState.projectPath
        && state.projectName === prevState.projectName
        && state.activeWorkspaceId === prevState.activeWorkspaceId
        && state.workspaces === prevState.workspaces
        && state.recentProjects === prevState.recentProjects
        && state.workspaceBranchById === prevState.workspaceBranchById
        && state.workspacePathById === prevState.workspacePathById
        && state.workspaceDefaultById === prevState.workspaceDefaultById
      ) {
        return;
      }
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(flush, 300);
    });
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);

  return (
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  );
}
