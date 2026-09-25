import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@/components/ui";
import type {
  CodexAppServerSnapshot,
  CodexAppServerSnapshotResponse,
  CodexPluginDetailSnapshot,
  CodexThreadDetailSnapshot,
} from "@/lib/providers/provider.types";
import { getProviderSessionId } from "@/lib/providers/provider-sessions";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { codexStyles } from "./settings-dialog-codex-section.styles";
import {
  StatusPill,
  formatDateTime,
  type SnapshotState,
  type DetailState,
} from "./codex-settings/shared";
import { OverviewTab } from "./codex-settings/overview-tab";
import { ExtensionsTab } from "./codex-settings/extensions-tab";
import { ThreadsTab } from "./codex-settings/threads-tab";
import { CommandsTab } from "./codex-settings/commands-tab";
import { AdvancedTab } from "./codex-settings/advanced-tab";

function parseJsonInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false as const, error: "JSON input is empty." };
  }
  try {
    return {
      ok: true as const,
      value: JSON.parse(trimmed) as unknown,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function CodexSection() {
  const [
    codexBinaryPath,
    activeTaskId,
    activeWorkspaceId,
    projectPath,
    workspacePathById,
    providerSessionByTask,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.codexBinaryPath,
          state.activeTaskId,
          state.activeWorkspaceId,
          state.projectPath,
          state.workspacePathById,
          state.providerSessionByTask,
        ] as const,
    ),
  );
  const currentThreadId = activeTaskId
    ? getProviderSessionId({
        sessions: providerSessionByTask[activeTaskId],
        providerId: "codex",
      })
    : null;
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const trimmedBinaryPath = codexBinaryPath.trim();
  const runtimeOptions = useMemo(
    () =>
      trimmedBinaryPath ? { codexBinaryPath: trimmedBinaryPath } : undefined,
    [trimmedBinaryPath],
  );
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath,
  });

  const [activeTab, setActiveTab] = useState("overview");
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({
    status: "idle",
    detail: "",
    sectionErrors: {},
    snapshot: null,
    updatedAt: null,
  });
  const [pluginDetailState, setPluginDetailState] = useState<
    DetailState<CodexPluginDetailSnapshot>
  >({
    status: "idle",
    detail: "",
    value: null,
  });
  const [threadDetailState, setThreadDetailState] = useState<
    DetailState<CodexThreadDetailSnapshot>
  >({
    status: "idle",
    detail: "",
    value: null,
  });
  const [resourcePreview, setResourcePreview] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    title: string;
    detail: string;
    body: string;
  }>({
    status: "idle",
    title: "",
    detail: "",
    body: "",
  });
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [rollbackTurns, setRollbackTurns] = useState("1");
  const [singleConfigKeyPath, setSingleConfigKeyPath] = useState("");
  const [singleConfigValue, setSingleConfigValue] = useState("{\n  \n}");
  const [singleMergeStrategy, setSingleMergeStrategy] = useState("");
  const [batchConfigEdits, setBatchConfigEdits] = useState(
    JSON.stringify(
      [
        {
          keyPath: "features.example",
          value: true,
        },
      ],
      null,
      2,
    ),
  );
  const snapshotRequestIdRef = useRef(0);
  const pluginRequestIdRef = useRef(0);
  const threadRequestIdRef = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const getCodexAppServerSnapshot =
      window.api?.provider?.getCodexAppServerSnapshot;
    if (!getCodexAppServerSnapshot) {
      setSnapshotState({
        status: "error",
        detail: "Codex App Server snapshot bridge is unavailable.",
        sectionErrors: {},
        snapshot: null,
        updatedAt: null,
      });
      return;
    }

    const requestId = snapshotRequestIdRef.current + 1;
    snapshotRequestIdRef.current = requestId;
    setSnapshotState((current) => ({
      ...current,
      status: current.snapshot ? "ready" : "loading",
      detail: current.snapshot
        ? current.detail
        : "Loading Codex App Server snapshot...",
    }));

    try {
      const response: CodexAppServerSnapshotResponse =
        await getCodexAppServerSnapshot({
          cwd: workspaceCwd,
          runtimeOptions,
        });
      if (snapshotRequestIdRef.current !== requestId) {
        return;
      }
      if (!response.ok || !response.snapshot) {
        setSnapshotState((current) => ({
          ...current,
          status: "error",
          detail:
            response.detail || "Failed to load Codex App Server snapshot.",
          sectionErrors: response.sectionErrors ?? {},
        }));
        return;
      }
      setSnapshotState({
        status: "ready",
        detail: response.detail,
        sectionErrors: response.sectionErrors,
        snapshot: response.snapshot,
        updatedAt: Date.now(),
      });
    } catch (error) {
      if (snapshotRequestIdRef.current !== requestId) {
        return;
      }
      setSnapshotState((current) => ({
        ...current,
        status: "error",
        detail:
          error instanceof Error
            ? error.message
            : "Failed to load Codex App Server snapshot.",
      }));
    }
  }, [runtimeOptions, workspaceCwd]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const snapshot = snapshotState.snapshot;
    if (!snapshot) {
      return;
    }
    const availableThreadIds = new Set(
      [...snapshot.threads, ...snapshot.archivedThreads].map(
        (thread) => thread.id,
      ),
    );
    if (currentThreadId && availableThreadIds.has(currentThreadId)) {
      setSelectedThreadId((current) =>
        current === currentThreadId ? current : currentThreadId,
      );
      return;
    }
    if (!selectedThreadId || !availableThreadIds.has(selectedThreadId)) {
      setSelectedThreadId(
        snapshot.threads[0]?.id ?? snapshot.archivedThreads[0]?.id ?? null,
      );
    }
  }, [currentThreadId, selectedThreadId, snapshotState.snapshot]);

  useEffect(() => {
    const snapshot = snapshotState.snapshot;
    if (!snapshot) {
      return;
    }
    const availablePluginIds = new Set(
      snapshot.plugins.map((plugin) => plugin.id),
    );
    if (!selectedPluginId || !availablePluginIds.has(selectedPluginId)) {
      setSelectedPluginId(snapshot.plugins[0]?.id ?? null);
    }
  }, [selectedPluginId, snapshotState.snapshot]);

  const selectedPluginSummary = useMemo(() => {
    const snapshot = snapshotState.snapshot;
    if (!snapshot || !selectedPluginId) {
      return null;
    }
    return (
      snapshot.plugins.find((plugin) => plugin.id === selectedPluginId) ?? null
    );
  }, [selectedPluginId, snapshotState.snapshot]);

  const selectedThreadSummary = useMemo(() => {
    const snapshot = snapshotState.snapshot;
    if (!snapshot || !selectedThreadId) {
      return null;
    }
    return (
      [...snapshot.threads, ...snapshot.archivedThreads].find(
        (thread) => thread.id === selectedThreadId,
      ) ?? null
    );
  }, [selectedThreadId, snapshotState.snapshot]);

  useEffect(() => {
    const getCodexPluginDetail = window.api?.provider?.getCodexPluginDetail;
    if (!getCodexPluginDetail || !selectedPluginSummary) {
      setPluginDetailState({
        status: "idle",
        detail: "",
        value: null,
      });
      return;
    }

    const requestId = pluginRequestIdRef.current + 1;
    pluginRequestIdRef.current = requestId;
    setPluginDetailState({
      status: "loading",
      detail: `Loading plugin details for ${selectedPluginSummary.name}...`,
      value: null,
    });

    void getCodexPluginDetail({
      marketplacePath: selectedPluginSummary.marketplacePath,
      pluginName: selectedPluginSummary.name,
      runtimeOptions,
    })
      .then((response) => {
        if (pluginRequestIdRef.current !== requestId) {
          return;
        }
        if (!response.ok || !response.plugin) {
          setPluginDetailState({
            status: "error",
            detail: response.detail,
            value: null,
          });
          return;
        }
        setPluginDetailState({
          status: "ready",
          detail: response.detail,
          value: response.plugin,
        });
      })
      .catch((error) => {
        if (pluginRequestIdRef.current !== requestId) {
          return;
        }
        setPluginDetailState({
          status: "error",
          detail:
            error instanceof Error
              ? error.message
              : "Failed to load Codex plugin details.",
          value: null,
        });
      });
  }, [runtimeOptions, selectedPluginSummary]);

  useEffect(() => {
    const readCodexThread = window.api?.provider?.readCodexThread;
    if (!readCodexThread || !selectedThreadId) {
      setThreadDetailState({
        status: "idle",
        detail: "",
        value: null,
      });
      return;
    }

    const requestId = threadRequestIdRef.current + 1;
    threadRequestIdRef.current = requestId;
    setThreadDetailState({
      status: "loading",
      detail: `Loading thread ${selectedThreadId}...`,
      value: null,
    });

    void readCodexThread({
      threadId: selectedThreadId,
      runtimeOptions,
    })
      .then((response) => {
        if (threadRequestIdRef.current !== requestId) {
          return;
        }
        if (!response.ok || !response.thread) {
          setThreadDetailState({
            status: "error",
            detail: response.detail,
            value: null,
          });
          return;
        }
        setThreadDetailState({
          status: "ready",
          detail: response.detail,
          value: response.thread,
        });
        setRenameDraft(response.thread.name ?? "");
      })
      .catch((error) => {
        if (threadRequestIdRef.current !== requestId) {
          return;
        }
        setThreadDetailState({
          status: "error",
          detail:
            error instanceof Error
              ? error.message
              : "Failed to load Codex thread details.",
          value: null,
        });
      });
  }, [runtimeOptions, selectedThreadId]);

  const runMutation = useCallback(
    async (args: {
      busyKey: string;
      label: string;
      refresh?: boolean;
      action: () => Promise<{ ok: boolean; detail: string }>;
      onSuccess?: (detail: string) => void;
    }) => {
      setBusyKey(args.busyKey);
      try {
        const result = await args.action();
        if (!result.ok) {
          toast.error(args.label, {
            description: result.detail,
          });
          return;
        }
        toast.success(args.label, {
          description: result.detail,
        });
        args.onSuccess?.(result.detail);
        if (args.refresh !== false) {
          await loadSnapshot();
        }
      } catch (error) {
        toast.error(args.label, {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusyKey((current) => (current === args.busyKey ? null : current));
      }
    },
    [loadSnapshot],
  );

  const handlePluginInstall = useCallback(async () => {
    if (!selectedPluginSummary) {
      return;
    }
    const installCodexPlugin = window.api?.provider?.installCodexPlugin;
    if (!installCodexPlugin) {
      toast.error("Install failed", {
        description: "Codex plugin install bridge is unavailable.",
      });
      return;
    }
    await runMutation({
      busyKey: `plugin-install:${selectedPluginSummary.id}`,
      label: `Installed ${selectedPluginSummary.name}`,
      action: () =>
        installCodexPlugin({
          marketplacePath: selectedPluginSummary.marketplacePath,
          pluginName: selectedPluginSummary.name,
          runtimeOptions,
        }),
    });
  }, [runtimeOptions, runMutation, selectedPluginSummary]);

  const handlePluginUninstall = useCallback(async () => {
    if (!selectedPluginSummary) {
      return;
    }
    const uninstallCodexPlugin = window.api?.provider?.uninstallCodexPlugin;
    if (!uninstallCodexPlugin) {
      toast.error("Uninstall failed", {
        description: "Codex plugin uninstall bridge is unavailable.",
      });
      return;
    }
    await runMutation({
      busyKey: `plugin-uninstall:${selectedPluginSummary.id}`,
      label: `Removed ${selectedPluginSummary.name}`,
      action: () =>
        uninstallCodexPlugin({
          pluginId: selectedPluginSummary.id,
          runtimeOptions,
        }),
      onSuccess: () => {
        setPluginDetailState({
          status: "idle",
          detail: "",
          value: null,
        });
      },
    });
  }, [runtimeOptions, runMutation, selectedPluginSummary]);

  const handleFeatureToggle = useCallback(
    async (featureName: string, enabled: boolean) => {
      const setCodexExperimentalFeatureEnablement =
        window.api?.provider?.setCodexExperimentalFeatureEnablement;
      if (!setCodexExperimentalFeatureEnablement) {
        toast.error("Feature toggle unavailable");
        return;
      }
      await runMutation({
        busyKey: `feature:${featureName}`,
        label: `Updated ${featureName}`,
        action: () =>
          setCodexExperimentalFeatureEnablement({
            enablement: { [featureName]: enabled },
            runtimeOptions,
          }),
      });
    },
    [runtimeOptions, runMutation],
  );

  const handleOauthLogin = useCallback(
    async (serverName: string) => {
      const startCodexMcpOauthLogin =
        window.api?.provider?.startCodexMcpOauthLogin;
      if (!startCodexMcpOauthLogin) {
        toast.error("OAuth login unavailable");
        return;
      }
      setBusyKey(`oauth:${serverName}`);
      try {
        const result = await startCodexMcpOauthLogin({
          name: serverName,
          runtimeOptions,
        });
        if (!result.ok) {
          toast.error("OAuth login failed", {
            description: result.detail,
          });
          return;
        }
        toast.success(`Started OAuth login for ${serverName}`, {
          description: result.authorizationUrl
            ? "Open the authorization URL to finish the flow."
            : result.detail,
        });
        if (result.authorizationUrl) {
          setResourcePreview({
            status: "ready",
            title: `${serverName} authorization URL`,
            detail: result.detail,
            body: result.authorizationUrl,
          });
        }
      } catch (error) {
        toast.error("OAuth login failed", {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusyKey((current) =>
          current === `oauth:${serverName}` ? null : current,
        );
      }
    },
    [runtimeOptions],
  );

  const handleReadResource = useCallback(
    async (args: { server: string; uri: string }) => {
      const readCodexMcpResource = window.api?.provider?.readCodexMcpResource;
      if (!readCodexMcpResource) {
        toast.error("MCP resource bridge unavailable");
        return;
      }
      if (!selectedThreadId) {
        toast.error("Select a Codex thread first", {
          description: "Resource reads require a thread context.",
        });
        return;
      }
      setBusyKey(`resource:${args.server}:${args.uri}`);
      setResourcePreview({
        status: "loading",
        title: args.uri,
        detail: `Reading ${args.uri}...`,
        body: "",
      });
      try {
        const result = await readCodexMcpResource({
          threadId: selectedThreadId,
          server: args.server,
          uri: args.uri,
          runtimeOptions,
        });
        if (!result.ok) {
          setResourcePreview({
            status: "error",
            title: args.uri,
            detail: result.detail,
            body: "",
          });
          return;
        }
        const body = result.contents
          .map((content) =>
            content.text
              ? content.text
              : content.blob
                ? `[binary blob] ${content.blob.slice(0, 120)}`
                : "",
          )
          .filter(Boolean)
          .join("\n\n");
        setResourcePreview({
          status: "ready",
          title: args.uri,
          detail: result.detail,
          body: body || "(empty resource body)",
        });
      } catch (error) {
        setResourcePreview({
          status: "error",
          title: args.uri,
          detail: error instanceof Error ? error.message : String(error),
          body: "",
        });
      } finally {
        setBusyKey((current) =>
          current === `resource:${args.server}:${args.uri}` ? null : current,
        );
      }
    },
    [runtimeOptions, selectedThreadId],
  );

  const handleRenameThread = useCallback(async () => {
    const renameCodexThread = window.api?.provider?.renameCodexThread;
    if (!renameCodexThread || !selectedThreadId) {
      toast.error("Thread rename unavailable");
      return;
    }
    await runMutation({
      busyKey: `thread-rename:${selectedThreadId}`,
      label: "Renamed Codex thread",
      action: () =>
        renameCodexThread({
          threadId: selectedThreadId,
          name: renameDraft.trim(),
          runtimeOptions,
        }),
    });
  }, [renameDraft, runtimeOptions, runMutation, selectedThreadId]);

  const handleForkThread = useCallback(async () => {
    const forkCodexThread = window.api?.provider?.forkCodexThread;
    if (!forkCodexThread || !selectedThreadId) {
      toast.error("Thread fork unavailable");
      return;
    }
    setBusyKey(`thread-fork:${selectedThreadId}`);
    try {
      const result = await forkCodexThread({
        threadId: selectedThreadId,
        runtimeOptions,
      });
      if (!result.ok) {
        toast.error("Thread fork failed", {
          description: result.detail,
        });
        return;
      }
      toast.success("Forked Codex thread", {
        description: result.detail,
      });
      if (result.threadId) {
        setSelectedThreadId(result.threadId);
      }
      await loadSnapshot();
    } catch (error) {
      toast.error("Thread fork failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyKey((current) =>
        current === `thread-fork:${selectedThreadId}` ? null : current,
      );
    }
  }, [loadSnapshot, runtimeOptions, selectedThreadId]);

  const handleArchiveThread = useCallback(
    async (archived: boolean) => {
      const archiveCodexThread = window.api?.provider?.archiveCodexThread;
      if (!archiveCodexThread || !selectedThreadId) {
        toast.error("Thread archive unavailable");
        return;
      }
      await runMutation({
        busyKey: `thread-archive:${selectedThreadId}`,
        label: archived ? "Archived Codex thread" : "Restored Codex thread",
        action: () =>
          archiveCodexThread({
            threadId: selectedThreadId,
            archived,
            runtimeOptions,
          }),
      });
    },
    [runtimeOptions, runMutation, selectedThreadId],
  );

  const handleCompactThread = useCallback(async () => {
    const compactCodexThread = window.api?.provider?.compactCodexThread;
    if (!compactCodexThread || !selectedThreadId) {
      toast.error("Thread compaction unavailable");
      return;
    }
    await runMutation({
      busyKey: `thread-compact:${selectedThreadId}`,
      label: "Compacted thread context",
      action: () =>
        compactCodexThread({
          threadId: selectedThreadId,
          runtimeOptions,
        }),
    });
  }, [runtimeOptions, runMutation, selectedThreadId]);

  const handleRollbackThread = useCallback(async () => {
    const rollbackCodexThread = window.api?.provider?.rollbackCodexThread;
    if (!rollbackCodexThread || !selectedThreadId) {
      toast.error("Thread rollback unavailable");
      return;
    }
    const turns = Number.parseInt(rollbackTurns, 10);
    if (!Number.isFinite(turns) || turns < 1) {
      toast.error("Rollback count must be at least 1.");
      return;
    }
    await runMutation({
      busyKey: `thread-rollback:${selectedThreadId}`,
      label: "Rolled back Codex thread",
      action: () =>
        rollbackCodexThread({
          threadId: selectedThreadId,
          numTurns: turns,
          runtimeOptions,
        }),
    });
  }, [rollbackTurns, runtimeOptions, runMutation, selectedThreadId]);

  const handleImportExternalConfig = useCallback(async () => {
    const importCodexExternalConfig =
      window.api?.provider?.importCodexExternalConfig;
    const items = snapshotState.snapshot?.externalAgentConfigItems ?? [];
    if (!importCodexExternalConfig || items.length === 0) {
      toast.error("No external config items to import.");
      return;
    }
    await runMutation({
      busyKey: "config-import",
      label: "Imported external config",
      action: () =>
        importCodexExternalConfig({
          migrationItems: items,
          runtimeOptions,
        }),
    });
  }, [
    runtimeOptions,
    runMutation,
    snapshotState.snapshot?.externalAgentConfigItems,
  ]);

  const handleSingleConfigWrite = useCallback(async () => {
    const writeCodexConfigValue = window.api?.provider?.writeCodexConfigValue;
    if (!writeCodexConfigValue) {
      toast.error("Config write bridge unavailable");
      return;
    }
    if (!singleConfigKeyPath.trim()) {
      toast.error("Config key path is required.");
      return;
    }
    const parsed = parseJsonInput(singleConfigValue);
    if (!parsed.ok) {
      toast.error("Invalid JSON value", {
        description: parsed.error,
      });
      return;
    }
    await runMutation({
      busyKey: "config-write-single",
      label: `Updated ${singleConfigKeyPath.trim()}`,
      action: () =>
        writeCodexConfigValue({
          keyPath: singleConfigKeyPath.trim(),
          value: parsed.value,
          ...(singleMergeStrategy.trim()
            ? { mergeStrategy: singleMergeStrategy.trim() }
            : {}),
          runtimeOptions,
        }),
    });
  }, [
    runtimeOptions,
    runMutation,
    singleConfigKeyPath,
    singleConfigValue,
    singleMergeStrategy,
  ]);

  const handleBatchConfigWrite = useCallback(async () => {
    const batchWriteCodexConfig = window.api?.provider?.batchWriteCodexConfig;
    if (!batchWriteCodexConfig) {
      toast.error("Batch config write bridge unavailable");
      return;
    }
    const parsed = parseJsonInput(batchConfigEdits);
    if (!parsed.ok) {
      toast.error("Invalid batch edit JSON", {
        description: parsed.error,
      });
      return;
    }
    if (!Array.isArray(parsed.value)) {
      toast.error("Batch edits must be a JSON array.");
      return;
    }
    await runMutation({
      busyKey: "config-write-batch",
      label: "Applied Codex config batch",
      action: () =>
        batchWriteCodexConfig({
          edits: parsed.value as Array<{
            keyPath: string;
            value: unknown;
            mergeStrategy?: string;
          }>,
          runtimeOptions,
        }),
    });
  }, [batchConfigEdits, runtimeOptions, runMutation]);

  const snapshot = snapshotState.snapshot;
  const overviewProps = {
    snapshot,
    snapshotState,
    codexModelCatalog,
    workspaceCwd,
    trimmedBinaryPath,
  };
  const extensionsProps = {
    snapshot,
    selectedPluginId,
    onSelectPlugin: setSelectedPluginId,
    selectedPluginSummary,
    pluginDetailState,
    resourcePreview,
    busyKey,
    onOauthLogin: handleOauthLogin,
    onReadResource: handleReadResource,
    onFeatureToggle: handleFeatureToggle,
    onPluginInstall: handlePluginInstall,
    onPluginUninstall: handlePluginUninstall,
  };
  const threadsProps = {
    snapshot,
    selectedThreadId,
    onSelectThread: setSelectedThreadId,
    currentThreadId,
    selectedThreadSummary,
    threadDetailState,
    renameDraft,
    onRenameDraftChange: setRenameDraft,
    rollbackTurns,
    onRollbackTurnsChange: setRollbackTurns,
    busyKey,
    onRenameThread: handleRenameThread,
    onForkThread: handleForkThread,
    onCompactThread: handleCompactThread,
    onArchiveThread: handleArchiveThread,
    onRollbackThread: handleRollbackThread,
  };
  const commandsProps = { commandQuery, onCommandQueryChange: setCommandQuery };
  const configProps = {
    snapshot,
    busyKey,
    singleConfigKeyPath,
    onSingleConfigKeyPathChange: setSingleConfigKeyPath,
    singleMergeStrategy,
    onSingleMergeStrategyChange: setSingleMergeStrategy,
    singleConfigValue,
    onSingleConfigValueChange: setSingleConfigValue,
    batchConfigEdits,
    onBatchConfigEditsChange: setBatchConfigEdits,
    onImportExternalConfig: handleImportExternalConfig,
    onSingleConfigWrite: handleSingleConfigWrite,
    onBatchConfigWrite: handleBatchConfigWrite,
  };

  return (
    <>
      <section className={sx(codexStyles.rootPanel)}>
        <div className={sx(codexStyles.rootHeader)}>
          <div className={sx(codexStyles.rowWrapCenterGap2)}>
            <StatusPill
              label={
                snapshotState.status === "error"
                  ? "snapshot error"
                  : snapshotState.status === "loading"
                    ? "loading snapshot"
                    : snapshot
                      ? "app server ready"
                      : "snapshot idle"
              }
              tone={
                snapshotState.status === "error"
                  ? "danger"
                  : snapshotState.status === "loading"
                    ? "warning"
                    : "success"
              }
            />
            <StatusPill
              label={
                codexModelCatalog.isDynamic
                  ? "dynamic model catalog"
                  : "fallback model catalog"
              }
              tone={codexModelCatalog.isDynamic ? "success" : "warning"}
            />
            {currentThreadId ? (
              <StatusPill label={`current thread ${currentThreadId}`} />
            ) : null}
            {snapshot?.account?.planType ? (
              <StatusPill label={snapshot.account.planType} />
            ) : null}
          </div>
          <div className={sx(codexStyles.headerMeta)}>
            {snapshotState.updatedAt ? (
              <span>Updated {formatDateTime(snapshotState.updatedAt)}</span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              xstyle={codexStyles.refreshBtn}
              onClick={() => {
                void loadSnapshot();
              }}
            >
              <RefreshCcw
                className={sx(
                  codexStyles.size35Icon,
                  snapshotState.status === "loading" && codexStyles.iconSpin,
                )}
              />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          xstyle={codexStyles.tabs}
        >
          <div className={sx(codexStyles.tabsBar)}>
            <TabsList xstyle={codexStyles.tabsList}>
              <TabsTrigger value="overview" xstyle={codexStyles.tabsTrigger}>
                Overview
              </TabsTrigger>
              <TabsTrigger value="extensions" xstyle={codexStyles.tabsTrigger}>
                Extensions
              </TabsTrigger>
              <TabsTrigger value="threads" xstyle={codexStyles.tabsTrigger}>
                Threads
              </TabsTrigger>
              <TabsTrigger value="commands" xstyle={codexStyles.tabsTrigger}>
                Commands
              </TabsTrigger>
              <TabsTrigger value="config" xstyle={codexStyles.tabsTrigger}>
                Advanced
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" xstyle={codexStyles.tabContent}>
            <OverviewTab {...overviewProps} />
          </TabsContent>

          <TabsContent value="extensions" xstyle={codexStyles.tabContent}>
            <ExtensionsTab {...extensionsProps} />
          </TabsContent>

          <TabsContent value="threads" xstyle={codexStyles.tabContent}>
            <ThreadsTab {...threadsProps} />
          </TabsContent>

          <TabsContent value="commands" xstyle={codexStyles.tabContent}>
            <CommandsTab {...commandsProps} />
          </TabsContent>

          <TabsContent value="config" xstyle={codexStyles.tabContent}>
            <AdvancedTab {...configProps} />
          </TabsContent>
        </Tabs>
      </section>
    </>
  );
}
