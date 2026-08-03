import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LensCdpApprovalDialog } from "@/components/layout/LensCdpApprovalDialog";
import { CraneDispatchApprovalDialog } from "@/components/layout/CraneDispatchApprovalDialog";
import { useLensSessionPresentationRequests } from "@/components/panes/useLensSessionPresentationRequests";
import { TooltipProvider } from "@/components/ui";
import type { LensSecurityConfig } from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";
import {
  applyCraneDispatchJobUpdate,
  enqueueCraneDispatchApproval,
  setCraneConnectorClientStatus,
} from "@/lib/crane-connector/client-state";
import { normalizeCraneConnectorSettings } from "@/lib/crane-connector/types";
import { mergeLocalMcpTaskTurnUpdates } from "@/lib/local-mcp/task-turn-update";

function buildLensSecurityConfig(): LensSecurityConfig {
  const settings = useAppStore.getState().settings;
  return {
    allowedHosts: settings.lensAllowedHosts,
    blockedHosts: settings.lensBlockedHosts,
    developerModeCdp: settings.lensDeveloperModeCdp,
    cdpApprovedHosts: settings.lensCdpApprovedHosts,
  };
}

function pushLensSecurityConfig(): void {
  void window.api?.lens?.setSecurityConfig?.(buildLensSecurityConfig());
}

export default function App() {
  useLensSessionPresentationRequests();

  useEffect(() => {
    const subscribeTaskTurnUpdates =
      window.api?.localMcp?.subscribeTaskTurnUpdates;
    if (!subscribeTaskTurnUpdates) {
      return;
    }

    const pendingByTaskTurn = new Map<
      string,
      Parameters<ReturnType<typeof useAppStore.getState>["syncHostTaskTurn"]>[0]
    >();
    const timerByTaskTurn = new Map<string, number>();
    const runningTaskTurns = new Set<string>();
    let disposed = false;

    const flush = async (key: string) => {
      if (disposed || runningTaskTurns.has(key)) {
        return;
      }
      const update = pendingByTaskTurn.get(key);
      if (!update) {
        return;
      }
      pendingByTaskTurn.delete(key);
      runningTaskTurns.add(key);
      try {
        await useAppStore.getState().syncHostTaskTurn(update);
      } catch (error) {
        console.error("[local-mcp] Failed to sync host task turn", error, {
          workspaceId: update.workspaceId,
          taskId: update.taskId,
          turnId: update.turnId,
        });
      } finally {
        runningTaskTurns.delete(key);
        if (!disposed && pendingByTaskTurn.has(key)) {
          const latest = pendingByTaskTurn.get(key);
          const delay = latest?.done ? 0 : 50;
          const timer = window.setTimeout(() => {
            timerByTaskTurn.delete(key);
            void flush(key);
          }, delay);
          timerByTaskTurn.set(key, timer);
        }
      }
    };

    const unsubscribe = subscribeTaskTurnUpdates((update) => {
      const key = `${update.workspaceId}:${update.taskId}:${update.turnId}`;
      pendingByTaskTurn.set(
        key,
        mergeLocalMcpTaskTurnUpdates(pendingByTaskTurn.get(key), update),
      );
      const existingTimer = timerByTaskTurn.get(key);
      if (existingTimer !== undefined) {
        if (!update.done && update.eventType !== "started") {
          return;
        }
        window.clearTimeout(existingTimer);
        timerByTaskTurn.delete(key);
      }
      if (runningTaskTurns.has(key)) {
        return;
      }
      const delay = update.done || update.eventType === "started" ? 0 : 50;
      const timer = window.setTimeout(() => {
        timerByTaskTurn.delete(key);
        void flush(key);
      }, delay);
      timerByTaskTurn.set(key, timer);
    });

    return () => {
      disposed = true;
      unsubscribe();
      for (const timer of timerByTaskTurn.values()) {
        window.clearTimeout(timer);
      }
      timerByTaskTurn.clear();
      pendingByTaskTurn.clear();
    };
  }, []);

  useEffect(() => {
    const connectorApi = window.api?.craneConnector;
    if (!connectorApi) {
      return;
    }
    const unsubscribeStatus = connectorApi.subscribeStatus?.(
      setCraneConnectorClientStatus,
    );
    const unsubscribeApproval = connectorApi.subscribeApprovalRequests?.(
      enqueueCraneDispatchApproval,
    );
    const unsubscribeJobUpdate = connectorApi.subscribeJobUpdates?.(
      (update) => {
        applyCraneDispatchJobUpdate(update);
        if (
          update.workspaceId &&
          update.taskId &&
          ["completed", "failed"].includes(update.state)
        ) {
          const state = useAppStore.getState();
          if (
            state.activeWorkspaceId === update.workspaceId &&
            state.activeTaskId === update.taskId
          ) {
            void state.refreshActiveManagedTask().catch(() => undefined);
          }
        }
      },
    );

    const pushConfig = (
      settings: ReturnType<typeof useAppStore.getState>["settings"],
    ) => {
      const connector = normalizeCraneConnectorSettings(
        settings.craneConnector,
      );
      if (!connector.enabled) {
        return;
      }
      void connectorApi
        .configure?.({
          enabled: true,
          baseUrl: connector.baseUrl,
          pollIntervalSeconds: connector.pollIntervalSeconds,
        })
        .then((result) => {
          if (result) {
            setCraneConnectorClientStatus(result.status);
          }
        })
        .catch(() => undefined);
    };

    const initialSettings = useAppStore.getState().settings;
    pushConfig(initialSettings);
    const unsubscribeStore = useAppStore.subscribe((state, previous) => {
      const current = normalizeCraneConnectorSettings(
        state.settings.craneConnector,
      );
      const prior = normalizeCraneConnectorSettings(
        previous.settings.craneConnector,
      );
      if (
        current.enabled === prior.enabled &&
        current.baseUrl === prior.baseUrl &&
        current.pollIntervalSeconds === prior.pollIntervalSeconds
      ) {
        return;
      }
      if (!current.enabled) {
        void connectorApi
          .configure?.({
            enabled: false,
            baseUrl: current.baseUrl,
            pollIntervalSeconds: current.pollIntervalSeconds,
          })
          .then((result) => {
            if (result) {
              setCraneConnectorClientStatus(result.status);
            }
          })
          .catch(() => undefined);
        return;
      }
      pushConfig(state.settings);
    });

    return () => {
      unsubscribeStatus?.();
      unsubscribeApproval?.();
      unsubscribeJobUpdate?.();
      unsubscribeStore();
    };
  }, []);

  useEffect(() => {
    pushLensSecurityConfig();
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (
        state.settings.lensAllowedHosts ===
          prevState.settings.lensAllowedHosts &&
        state.settings.lensBlockedHosts ===
          prevState.settings.lensBlockedHosts &&
        state.settings.lensDeveloperModeCdp ===
          prevState.settings.lensDeveloperModeCdp &&
        state.settings.lensCdpApprovedHosts ===
          prevState.settings.lensCdpApprovedHosts
      ) {
        return;
      }

      pushLensSecurityConfig();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const setBootstrapStatus =
      useAppStore.getState().setPersistenceBootstrapStatus;
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

    const scheduleSnapshotFlush = (
      state: ReturnType<typeof useAppStore.getState>,
      delayMs: number,
    ) => {
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
        state.hasHydratedWorkspaces === prevState.hasHydratedWorkspaces &&
        state.activeWorkspaceId === prevState.activeWorkspaceId &&
        state.workspaceSnapshotVersion === prevState.workspaceSnapshotVersion &&
        state.promptDraftPersistenceVersion ===
          prevState.promptDraftPersistenceVersion
      ) {
        return;
      }
      const structuralChange =
        state.hasHydratedWorkspaces !== prevState.hasHydratedWorkspaces ||
        state.activeWorkspaceId !== prevState.activeWorkspaceId ||
        state.workspaceSnapshotVersion !== prevState.workspaceSnapshotVersion;
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
        state.projectPath === prevState.projectPath &&
        state.projectName === prevState.projectName &&
        state.activeWorkspaceId === prevState.activeWorkspaceId &&
        state.workspaces === prevState.workspaces &&
        state.recentProjects === prevState.recentProjects &&
        state.workspaceBranchById === prevState.workspaceBranchById &&
        state.workspacePathById === prevState.workspacePathById &&
        state.workspaceDefaultById === prevState.workspaceDefaultById
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
      <LensCdpApprovalDialog />
      <CraneDispatchApprovalDialog />
    </TooltipProvider>
  );
}
