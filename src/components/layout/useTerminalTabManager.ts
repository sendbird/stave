import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TerminalInstanceController } from "@/components/layout/useTerminalInstance";

export interface TerminalTabInstanceStatus {
  ready: boolean;
  error: string | null;
  writeErrorCount: number;
  revision: number;
}

export const EMPTY_TERMINAL_TAB_INSTANCE_STATUS: TerminalTabInstanceStatus = {
  ready: false,
  error: null,
  writeErrorCount: 0,
  revision: 0,
};

export function pruneTerminalTabManagerRecord<T>(
  record: Record<string, T>,
  liveTabKeys: Set<string>,
) {
  const next: Record<string, T> = {};

  for (const [tabKey, value] of Object.entries(record)) {
    if (liveTabKeys.has(tabKey)) {
      next[tabKey] = value;
    }
  }

  return next;
}

function areTerminalTabManagerRecordsEqual<T>(
  left: Record<string, T>,
  right: Record<string, T>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!(key in right) || left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

export function resolveMountedTerminalTabKeys(args: {
  mountedTabKeys: Record<string, true>;
  liveTabKeys: Set<string>;
  activeTabKey: string | null;
  isVisible: boolean;
}) {
  const next = pruneTerminalTabManagerRecord(args.mountedTabKeys, args.liveTabKeys);
  if (args.isVisible && args.activeTabKey) {
    next[args.activeTabKey] = true;
  }
  return next;
}

export interface UseTerminalTabManagerArgs<TTab extends { id: string }> {
  tabs: readonly TTab[];
  activeTabId: string | null;
  isVisible: boolean;
  getTabKey: (tab: TTab) => string;
}

export interface UseTerminalTabManagerReturn {
  activeTabKey: string | null;
  statusByTabKey: Record<string, TerminalTabInstanceStatus>;
  shouldMountTerminal: (tabKey: string) => boolean;
  getRestartToken: (tabKey: string) => number;
  registerInstance: (tabKey: string, controller: TerminalInstanceController) => () => void;
  updateInstanceStatus: (tabKey: string, status: TerminalTabInstanceStatus) => void;
  clear: (tabKey: string) => void;
  restoreScreenState: (tabKey: string, screenState: string) => void;
  write: (tabKey: string, data: string) => void;
  writeln: (tabKey: string, data: string) => void;
  resize: (tabKey: string, cols: number, rows: number) => void;
  focus: (tabKey: string) => (() => void) | null;
  proposeDimensions: (tabKey: string) => { cols: number; rows: number } | undefined;
  getSize: (tabKey: string) => { cols: number; rows: number };
  restart: (tabKey: string) => void;
}

export function useTerminalTabManager<TTab extends { id: string }>(
  args: UseTerminalTabManagerArgs<TTab>,
): UseTerminalTabManagerReturn {
  const instancesRef = useRef<Map<string, TerminalInstanceController>>(new Map());
  const [statusByTabKey, setStatusByTabKey] = useState<Record<string, TerminalTabInstanceStatus>>({});
  const [restartTokenByTabKey, setRestartTokenByTabKey] = useState<Record<string, number>>({});
  const [mountedTabKeys, setMountedTabKeys] = useState<Record<string, true>>({});

  const tabKeys = useMemo(
    () => args.tabs.map((tab) => args.getTabKey(tab)),
    [args.getTabKey, args.tabs],
  );
  const liveTabKeySet = useMemo(
    () => new Set(tabKeys),
    [tabKeys],
  );
  const activeTabKey = useMemo(() => {
    if (!args.activeTabId) {
      return null;
    }
    const activeTab = args.tabs.find((tab) => tab.id === args.activeTabId);
    return activeTab ? args.getTabKey(activeTab) : null;
  }, [args.activeTabId, args.getTabKey, args.tabs]);
  const activeTabReady = activeTabKey
    ? Boolean(statusByTabKey[activeTabKey]?.ready)
    : false;

  const registerInstance = useCallback((tabKey: string, controller: TerminalInstanceController) => {
    instancesRef.current.set(tabKey, controller);

    return () => {
      if (instancesRef.current.get(tabKey) === controller) {
        instancesRef.current.delete(tabKey);
      }
    };
  }, []);

  const updateInstanceStatus = useCallback((tabKey: string, status: TerminalTabInstanceStatus) => {
    setStatusByTabKey((previous) => {
      const current = previous[tabKey];
      if (
        current
        && current.ready === status.ready
        && current.error === status.error
        && current.writeErrorCount === status.writeErrorCount
        && current.revision === status.revision
      ) {
        return previous;
      }

      return {
        ...previous,
        [tabKey]: status,
      };
    });
  }, []);

  const clear = useCallback((tabKey: string) => {
    instancesRef.current.get(tabKey)?.clear();
  }, []);

  const restoreScreenState = useCallback((tabKey: string, screenState: string) => {
    instancesRef.current.get(tabKey)?.restoreScreenState(screenState);
  }, []);

  const write = useCallback((tabKey: string, data: string) => {
    instancesRef.current.get(tabKey)?.write(data);
  }, []);

  const writeln = useCallback((tabKey: string, data: string) => {
    instancesRef.current.get(tabKey)?.writeln(data);
  }, []);

  const resize = useCallback((tabKey: string, cols: number, rows: number) => {
    instancesRef.current.get(tabKey)?.resize(cols, rows);
  }, []);

  const proposeDimensions = useCallback((tabKey: string) => (
    instancesRef.current.get(tabKey)?.proposeDimensions()
  ), []);

  const getSize = useCallback((tabKey: string) => (
    instancesRef.current.get(tabKey)?.getSize() ?? { cols: 0, rows: 0 }
  ), []);

  const shouldMountTerminal = useCallback((tabKey: string) => (
    Boolean(mountedTabKeys[tabKey])
  ), [mountedTabKeys]);

  const getRestartToken = useCallback((tabKey: string) => (
    restartTokenByTabKey[tabKey] ?? 0
  ), [restartTokenByTabKey]);

  useEffect(() => {
    setMountedTabKeys((previous) => {
      const next = resolveMountedTerminalTabKeys({
        mountedTabKeys: previous,
        liveTabKeys: liveTabKeySet,
        activeTabKey,
        isVisible: args.isVisible,
      });
      return areTerminalTabManagerRecordsEqual(previous, next) ? previous : next;
    });
    setRestartTokenByTabKey((previous) => {
      const next = pruneTerminalTabManagerRecord(previous, liveTabKeySet);
      return areTerminalTabManagerRecordsEqual(previous, next) ? previous : next;
    });
    setStatusByTabKey((previous) => {
      const next = pruneTerminalTabManagerRecord(previous, liveTabKeySet);
      return areTerminalTabManagerRecordsEqual(previous, next) ? previous : next;
    });

    for (const tabKey of [...instancesRef.current.keys()]) {
      if (!liveTabKeySet.has(tabKey)) {
        instancesRef.current.delete(tabKey);
      }
    }
  }, [activeTabKey, args.isVisible, liveTabKeySet]);

  const focus = useCallback((tabKey: string) => {
    const controller = instancesRef.current.get(tabKey);
    if (!controller) {
      return null;
    }
    return controller.focus();
  }, []);

  useEffect(() => {
    if (!args.isVisible || !activeTabKey || !activeTabReady) {
      return;
    }

    let cancelFocus: (() => void) | null = null;

    const handleRefocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      cancelFocus?.();
      cancelFocus = focus(activeTabKey);
    };

    handleRefocus();

    window.addEventListener("focus", handleRefocus);
    document.addEventListener("visibilitychange", handleRefocus);

    return () => {
      cancelFocus?.();
      window.removeEventListener("focus", handleRefocus);
      document.removeEventListener("visibilitychange", handleRefocus);
    };
  }, [activeTabKey, activeTabReady, args.isVisible, focus]);

  const restart = useCallback((tabKey: string) => {
    setRestartTokenByTabKey((previous) => ({
      ...previous,
      [tabKey]: (previous[tabKey] ?? 0) + 1,
    }));
  }, []);

  // Separate stable method handle from frequently-changing data fields so that
  // downstream hooks can depend on methods without re-running when status or
  // activeTabKey change (which would otherwise recreate the whole object).
  const methods = useMemo(() => ({
    shouldMountTerminal,
    getRestartToken,
    registerInstance,
    updateInstanceStatus,
    clear,
    restoreScreenState,
    write,
    writeln,
    resize,
    focus,
    proposeDimensions,
    getSize,
    restart,
  }), [
    clear,
    focus,
    getRestartToken,
    getSize,
    proposeDimensions,
    registerInstance,
    restoreScreenState,
    resize,
    restart,
    shouldMountTerminal,
    updateInstanceStatus,
    write,
    writeln,
  ]);

  return useMemo(() => ({
    ...methods,
    activeTabKey,
    statusByTabKey,
  }), [methods, activeTabKey, statusByTabKey]);
}
