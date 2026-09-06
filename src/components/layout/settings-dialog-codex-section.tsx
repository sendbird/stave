import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Loader,
  ExternalAnchor,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@/components/ui";
import type {
  CodexAppServerSnapshot,
  CodexAppServerSnapshotResponse,
  CodexPluginDetailSnapshot,
  CodexThreadDetailSnapshot,
} from "@/lib/providers/provider.types";
import {
  CODEX_CLI_SLASH_COMMANDS,
  getCodexSlashCommandCatalogDetail,
} from "@/lib/providers/codex-command-catalog";
import { getProviderSessionId } from "@/lib/providers/provider-sessions";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { cx, sx } from "@/components/ads/utils/stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { useAppStore } from "@/store/app.store";
import {
  AlertCircle,
  AppWindow,
  Bot,
  ExternalLink,
  Layers2,
  Package2,
  Plug2,
  RefreshCcw,
  Search,
  Sparkles,
  Webhook,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { DraftInput } from "./settings-dialog.shared";
import { codexStyles } from "./settings-dialog-codex-section.styles";

type SnapshotState = {
  status: "idle" | "loading" | "ready" | "error";
  detail: string;
  sectionErrors: Record<string, string>;
  snapshot: CodexAppServerSnapshot | null;
  updatedAt: number | null;
};

type DetailState<T> = {
  status: "idle" | "loading" | "ready" | "error";
  detail: string;
  value: T | null;
};

const COMMAND_CATEGORY_LABELS = {
  session: "Session control",
  runtime: "Runtime and behavior",
  workspace: "Workspace context",
  inspection: "Inspection and review",
  integrations: "Apps and plugins",
} as const;

function formatDateTime(value?: number | null) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleString();
}

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "0%";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

function getPercentWidth(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

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

function DenseMetric(args: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "success" | "warning";
}) {
  return (
    <div
      className={sx(
        codexStyles.metric,
        args.tone === "success"
          ? codexStyles.metricSuccess
          : args.tone === "warning"
            ? codexStyles.metricWarning
            : args.tone === "muted"
              ? codexStyles.metricMuted
              : codexStyles.metricDefault,
      )}
    >
      <p className={sx(codexStyles.metricLabel)}>{args.label}</p>
      <p className={sx(codexStyles.metricValue)}>{args.value}</p>
    </div>
  );
}

function DenseSection(args: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(sx(codexStyles.section), args.className)}>
      <div className={sx(codexStyles.sectionHeader)}>
        <div className={sx(codexStyles.sectionHeaderText)}>
          <h4 className={sx(codexStyles.sectionTitle)}>{args.title}</h4>
          {args.description ? (
            <p className={sx(codexStyles.sectionDescription)}>
              {args.description}
            </p>
          ) : null}
        </div>
        {args.action}
      </div>
      <div className={sx(codexStyles.sectionBody)}>{args.children}</div>
    </section>
  );
}

function StatusPill(args: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Badge
      variant="outline"
      className={sx(
        codexStyles.pill,
        args.tone === "success"
          ? codexStyles.pillSuccess
          : args.tone === "warning"
            ? codexStyles.pillWarning
            : args.tone === "danger"
              ? codexStyles.pillDanger
              : codexStyles.pillDefault,
      )}
    >
      {args.label}
    </Badge>
  );
}

function ReadOnlyCodeBlock(args: { value: string; minHeight?: number }) {
  return (
    <Textarea
      readOnly
      value={args.value}
      xstyle={codexStyles.codeBlock}
      style={{ minHeight: args.minHeight ?? 180 }}
    />
  );
}

function getCodexAccountBadgeState(account: CodexAppServerSnapshot["account"]) {
  if (!account) {
    return {
      label: "unknown",
      tone: "default" as const,
    };
  }

  const hasResolvedAccount =
    account.type === "apiKey" ||
    account.type === "chatgpt" ||
    account.email != null ||
    account.planType != null;
  if (account.requiresOpenaiAuth && !hasResolvedAccount) {
    return {
      label: "needs login",
      tone: "warning" as const,
    };
  }

  if (!account.requiresOpenaiAuth) {
    return {
      label: "not required",
      tone: "success" as const,
    };
  }

  return {
    label: "ready",
    tone: "success" as const,
  };
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

  const metrics = useMemo(() => {
    const snapshot = snapshotState.snapshot;
    if (!snapshot) {
      return [];
    }
    return [
      {
        label: "Models",
        value: String(codexModelCatalog.models.length),
        tone: codexModelCatalog.isDynamic ? "success" : "muted",
      },
      {
        label: "Plugins",
        value: String(snapshot.plugins.length),
      },
      {
        label: "Apps",
        value: String(snapshot.apps.length),
      },
      {
        label: "Threads",
        value: String(snapshot.threads.length),
      },
      {
        label: "Skills",
        value: String(
          snapshot.skills.reduce(
            (total, group) => total + group.skills.length,
            0,
          ),
        ),
      },
      {
        label: "Slash Commands",
        value: String(CODEX_CLI_SLASH_COMMANDS.length),
      },
    ] as Array<{
      label: string;
      value: string;
      tone?: "default" | "muted" | "success" | "warning";
    }>;
  }, [
    codexModelCatalog.isDynamic,
    codexModelCatalog.models.length,
    snapshotState.snapshot,
  ]);

  const groupedCommands = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase();
    const filtered = CODEX_CLI_SLASH_COMMANDS.filter((command) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        command.command,
        command.name,
        command.description,
        command.argumentHint,
        command.availabilityNote,
        COMMAND_CATEGORY_LABELS[command.category],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return filtered.reduce<
      Array<{
        category: keyof typeof COMMAND_CATEGORY_LABELS;
        items: typeof filtered;
      }>
    >((groups, command) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.category === command.category) {
        lastGroup.items.push(command);
        return groups;
      }
      groups.push({
        category: command.category,
        items: [command],
      });
      return groups;
    }, []);
  }, [commandQuery]);

  const snapshot = snapshotState.snapshot;
  const accountBadge = getCodexAccountBadgeState(snapshot?.account ?? null);

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className={sx(codexStyles.tabs)}>
          <div className={sx(codexStyles.tabsBar)}>
            <TabsList className={sx(codexStyles.tabsList)}>
              <TabsTrigger
                value="overview"
                className={sx(codexStyles.tabsTrigger)}
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="extensions"
                className={sx(codexStyles.tabsTrigger)}
              >
                Extensions
              </TabsTrigger>
              <TabsTrigger
                value="threads"
                className={sx(codexStyles.tabsTrigger)}
              >
                Threads
              </TabsTrigger>
              <TabsTrigger
                value="commands"
                className={sx(codexStyles.tabsTrigger)}
              >
                Commands
              </TabsTrigger>
              <TabsTrigger
                value="config"
                className={sx(codexStyles.tabsTrigger)}
              >
                Advanced
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className={sx(codexStyles.tabContent)}>
            {!snapshot ? (
              <Empty xstyle={codexStyles.emptyRoot}>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {snapshotState.status === "error" ? (
                      <AlertCircle className={sx(codexStyles.size5Icon)} />
                    ) : (
                      <Loader aria-hidden size="sm" variant="spinner" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {snapshotState.status === "error"
                      ? "Codex snapshot unavailable"
                      : "Loading Codex snapshot"}
                  </EmptyTitle>
                  <EmptyDescription>{snapshotState.detail}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className={sx(codexStyles.stack4)}>
                <div className={sx(codexStyles.metricsGrid)}>
                  {metrics.map((metric) => (
                    <DenseMetric
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      tone={metric.tone}
                    />
                  ))}
                </div>

                <div className={sx(codexStyles.twoColGrid1)}>
                  <DenseSection
                    title="Runtime summary"
                    description="Live App Server data for the current workspace and Codex binary."
                  >
                    <div className={sx(codexStyles.lgTwoCol)}>
                      <div className={sx(codexStyles.stack3)}>
                        <div className={sx(codexStyles.tile)}>
                          <div className={sx(codexStyles.rowCenterBetween)}>
                            <p className={sx(codexStyles.textSmMedium)}>
                              Account
                            </p>
                            <StatusPill
                              label={accountBadge.label}
                              tone={accountBadge.tone}
                            />
                          </div>
                          <div className={sx(codexStyles.mt2Space1SmMuted)}>
                            <p>Type: {snapshot.account?.type ?? "unknown"}</p>
                            <p>Email: {snapshot.account?.email ?? "unknown"}</p>
                            <p>
                              Plan: {snapshot.account?.planType ?? "unknown"}
                            </p>
                          </div>
                        </div>

                        <div className={sx(codexStyles.tile)}>
                          <div className={sx(codexStyles.rowCenterBetween)}>
                            <p className={sx(codexStyles.textSmMedium)}>
                              Model catalog
                            </p>
                            <div className={sx(codexStyles.rowCenterGap2)}>
                              <StatusPill
                                label={
                                  codexModelCatalog.isDynamic
                                    ? "live app server"
                                    : "fallback"
                                }
                                tone={
                                  codexModelCatalog.isDynamic
                                    ? "success"
                                    : "warning"
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                xstyle={codexStyles.h6Px15}
                                onClick={() => codexModelCatalog.refresh()}
                              >
                                <RefreshCcw
                                  className={sx(
                                    codexStyles.size3Icon,
                                    codexModelCatalog.status === "loading" &&
                                      codexStyles.iconSpin,
                                  )}
                                />
                              </Button>
                            </div>
                          </div>
                          <p className={sx(codexStyles.textSmMutedMt2)}>
                            {codexModelCatalog.detail ||
                              "Using the configured Codex model catalog."}
                          </p>
                          {codexModelCatalog.entries.length > 0 ? (
                            <div className={sx(codexStyles.mt3Space15)}>
                              {codexModelCatalog.entries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className={sx(codexStyles.metricStartRowXs)}
                                >
                                  <div className={sx(codexStyles.minW0)}>
                                    <span className={sx(codexStyles.fontMediumFg)}>
                                      {entry.displayName || entry.model}
                                    </span>
                                    {entry.description ? (
                                      <span className={sx(codexStyles.mlSmMutedFg)}>
                                        {entry.description}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className={sx(codexStyles.shrink0RowGap15)}>
                                    {entry.isDefault ? (
                                      <Badge
                                        variant="outline"
                                        className={sx(codexStyles.badgeTiny)}
                                      >
                                        default
                                      </Badge>
                                    ) : null}
                                    {entry.supportedReasoningEfforts.length >
                                    0 ? (
                                      <span className={sx(codexStyles.mutedFg)}>
                                        {entry.supportedReasoningEfforts.join(
                                          "/",
                                        )}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : codexModelCatalog.models.length > 0 ? (
                            <p className={sx(codexStyles.textXsMutedMt3)}>
                              {codexModelCatalog.models.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className={sx(codexStyles.stack3)}>
                        <div className={sx(codexStyles.tile)}>
                          <div className={sx(codexStyles.rowCenterBetween)}>
                            <p className={sx(codexStyles.textSmMedium)}>
                              Workspace scope
                            </p>
                            {workspaceCwd ? (
                              <StatusPill label="scoped" />
                            ) : null}
                          </div>
                          <div className={sx(codexStyles.mt2Space1BreakAllSmMuted)}>
                            <p>
                              {workspaceCwd ?? "No workspace cwd available."}
                            </p>
                            <p>
                              Binary:{" "}
                              {trimmedBinaryPath || "Default Codex executable"}
                            </p>
                          </div>
                        </div>

                        <div className={sx(codexStyles.tile)}>
                          <div className={sx(codexStyles.rowCenterBetween)}>
                            <p className={sx(codexStyles.textSmMedium)}>
                              Slash commands
                            </p>
                            <StatusPill
                              label={`${CODEX_CLI_SLASH_COMMANDS.length} built-in`}
                            />
                          </div>
                          <p className={sx(codexStyles.textSmMutedMt2)}>
                            {getCodexSlashCommandCatalogDetail()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </DenseSection>

                  <DenseSection
                    title="Section errors"
                    description="Snapshot sections that failed independently while the rest of the App Server surface loaded."
                  >
                    {Object.entries(snapshotState.sectionErrors).length ===
                    0 ? (
                      <div className={sx(codexStyles.tileDashed)}>
                        No partial section failures.
                      </div>
                    ) : (
                      <div className={sx(codexStyles.stack2)}>
                        {Object.entries(snapshotState.sectionErrors).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className={sx(codexStyles.tileDanger)}
                            >
                              <p className={sx(codexStyles.textSmMedium)}>
                                {key}
                              </p>
                              <p className={sx(codexStyles.textSmMutedMt1)}>
                                {value}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </DenseSection>
                </div>

                <DenseSection
                  title="Rate limits"
                  description="Current limit buckets and credit state reported by Codex."
                >
                  {snapshot.rateLimits.length === 0 ? (
                    <div className={sx(codexStyles.tileDashed)}>
                      No rate-limit buckets returned by the App Server.
                    </div>
                  ) : (
                    <div className={sx(codexStyles.stack3)}>
                      {snapshot.rateLimits.map((limit, index) => (
                        <div
                          key={`${limit.limitId ?? "limit"}:${index}`}
                          className={sx(codexStyles.tile)}
                        >
                          <div className={sx(codexStyles.rowWrapCenterBetween)}>
                            <div>
                              <p className={sx(codexStyles.textSmMedium)}>
                                {limit.limitName ??
                                  limit.limitId ??
                                  "Unnamed bucket"}
                              </p>
                              <p className={sx(codexStyles.textXsMuted)}>
                                {limit.planType ?? "unknown plan"}
                              </p>
                            </div>
                            {limit.credits ? (
                              <StatusPill
                                label={
                                  limit.credits.unlimited
                                    ? "unlimited credits"
                                    : limit.credits.hasCredits
                                      ? `credits ${limit.credits.balance ?? "available"}`
                                      : "no credits"
                                }
                                tone={
                                  limit.credits.hasCredits
                                    ? "success"
                                    : "warning"
                                }
                              />
                            ) : null}
                          </div>

                          <div className={sx(codexStyles.mt3Space3)}>
                            {[
                              ["Primary", limit.primary] as const,
                              ["Secondary", limit.secondary] as const,
                            ]
                              .filter(([, bucket]) => bucket)
                              .map(([label, bucket]) => (
                                <div key={label} className={sx(codexStyles.space15)}>
                                  <div className={sx(codexStyles.rateRow)}>
                                    <span>{label}</span>
                                    <span>
                                      {formatPercent(bucket?.usedPercent)}
                                      {bucket?.resetsAt
                                        ? ` · resets ${formatDateTime(bucket.resetsAt)}`
                                        : ""}
                                    </span>
                                  </div>
                                  <div className={sx(codexStyles.progressTrack)}>
                                    <div
                                      className={sx(codexStyles.progressFill)}
                                      style={{
                                        width: `${getPercentWidth(bucket?.usedPercent)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DenseSection>
              </div>
            )}
          </TabsContent>

          <TabsContent value="extensions" className={sx(codexStyles.tabContent)}>
            {!snapshot ? null : (
              <div className={sx(codexStyles.twoColGrid1b)}>
                <div className={sx(codexStyles.stack4)}>
                  <DenseSection
                    title="Plugins and apps"
                    description="Installed, discoverable, and currently accessible extension surfaces."
                  >
                    <Accordion multiple className={sx(codexStyles.wFullSpace3)}>
                      <AccordionItem
                        value="plugins"
                        className={sx(codexStyles.accordionItem)}
                      >
                        <AccordionTrigger className={sx(codexStyles.py3)}>
                          <div className={sx(codexStyles.rowCenterGap2)}>
                            <Package2 className={sx(codexStyles.icon4)} />
                            <span>Plugins</span>
                            <StatusPill label={`${snapshot.plugins.length}`} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className={sx(codexStyles.space2Pb3)}>
                          {snapshot.plugins.length === 0 ? (
                            <p className={sx(codexStyles.textSmMuted)}>
                              No plugins returned by the current App Server
                              runtime.
                            </p>
                          ) : (
                            snapshot.plugins.map((plugin) => (
                              <AdsButton
                                key={plugin.id}
                                type="button"
                                layout="host"
                                press="none"
                                onClick={() => setSelectedPluginId(plugin.id)}
                                xstyle={[
                                  codexStyles.rowButton,
                                  selectedPluginId === plugin.id
                                    ? codexStyles.rowButtonSelected
                                    : codexStyles.rowButtonResting,
                                ]}
                              >
                                <div className={sx(codexStyles.minW0Grow1Space1)}>
                                  <div className={sx(codexStyles.rowWrapCenterGap2)}>
                                    <p className={sx(codexStyles.textSmMedium)}>
                                      {plugin.name}
                                    </p>
                                    <StatusPill
                                      label={
                                        plugin.installed
                                          ? "installed"
                                          : "discoverable"
                                      }
                                      tone={
                                        plugin.installed ? "success" : "warning"
                                      }
                                    />
                                    {plugin.enabled ? (
                                      <StatusPill
                                        label="enabled"
                                        tone="success"
                                      />
                                    ) : null}
                                  </div>
                                  <p className={sx(codexStyles.breakWordsXsMuted)}>
                                    {plugin.marketplaceDisplayName ??
                                      plugin.marketplaceName}
                                  </p>
                                </div>
                                <div
                                  className={sx(codexStyles.rowSource)}
                                  title={plugin.source}
                                >
                                  {plugin.source}
                                </div>
                              </AdsButton>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem
                        value="apps"
                        className={sx(codexStyles.accordionItem)}
                      >
                        <AccordionTrigger className={sx(codexStyles.py3)}>
                          <div className={sx(codexStyles.rowCenterGap2)}>
                            <AppWindow className={sx(codexStyles.icon4)} />
                            <span>Apps</span>
                            <StatusPill label={`${snapshot.apps.length}`} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className={sx(codexStyles.space2Pb3)}>
                          {snapshot.apps.length === 0 ? (
                            <p className={sx(codexStyles.textSmMuted)}>
                              No apps returned by the current App Server
                              runtime.
                            </p>
                          ) : (
                            snapshot.apps.map((app) => (
                              <div
                                key={app.id}
                                className={sx(codexStyles.bgTile40)}
                              >
                                <div className={sx(codexStyles.rowColSmRow)}>
                                  <div className={sx(codexStyles.minW0Grow1)}>
                                    <p className={sx(codexStyles.breakWordsSmMedium)}>
                                      {app.name}
                                    </p>
                                    <p className={sx(codexStyles.breakWordsXsMuted)}>
                                      {app.description ?? "No description"}
                                    </p>
                                  </div>
                                  <div className={sx(codexStyles.shrink0WrapRow)}>
                                    <StatusPill
                                      label={
                                        app.isAccessible
                                          ? "accessible"
                                          : "not accessible"
                                      }
                                      tone={
                                        app.isAccessible ? "success" : "warning"
                                      }
                                    />
                                    {app.isEnabled ? (
                                      <StatusPill
                                        label="enabled"
                                        tone="success"
                                      />
                                    ) : null}
                                    {app.installUrl ? (
                                      <ExternalAnchor
                                        href={app.installUrl}
                                        className={sx(codexStyles.inlineAnchorXs)}
                                      >
                                        Open
                                        <ExternalLink className={sx(codexStyles.size3Icon)} />
                                      </ExternalAnchor>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem
                        value="skills"
                        className={sx(codexStyles.accordionItem)}
                      >
                        <AccordionTrigger className={sx(codexStyles.py3)}>
                          <div className={sx(codexStyles.rowCenterGap2)}>
                            <Bot className={sx(codexStyles.icon4)} />
                            <span>Skills</span>
                            <StatusPill
                              label={String(
                                snapshot.skills.reduce(
                                  (total, group) => total + group.skills.length,
                                  0,
                                ),
                              )}
                            />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className={sx(codexStyles.space3Pb3)}>
                          {snapshot.skills.length === 0 ? (
                            <p className={sx(codexStyles.textSmMuted)}>
                              No skill groups returned by the current workspace.
                            </p>
                          ) : (
                            snapshot.skills.map((group) => (
                              <div
                                key={group.cwd}
                                className={sx(codexStyles.bgTile40)}
                              >
                                <p className={sx(codexStyles.breakAllXsMuted)}>
                                  {group.cwd}
                                </p>
                                <div className={sx(codexStyles.mt2Chips)}>
                                  {group.skills.map((skill) => (
                                    <StatusPill
                                      key={`${group.cwd}:${skill.path}`}
                                      label={skill.name}
                                      tone={
                                        skill.enabled ? "success" : "default"
                                      }
                                    />
                                  ))}
                                </div>
                                {group.errors.length > 0 ? (
                                  <div className={sx(codexStyles.mt3Space1XsDangerErr)}>
                                    {group.errors.map((error, index) => (
                                      <p key={`${group.cwd}:error:${index}`}>
                                        {error}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem
                        value="mcp"
                        className={sx(codexStyles.accordionItem)}
                      >
                        <AccordionTrigger className={sx(codexStyles.py3)}>
                          <div className={sx(codexStyles.rowCenterGap2)}>
                            <Plug2 className={sx(codexStyles.icon4)} />
                            <span>MCP servers</span>
                            <StatusPill
                              label={`${snapshot.mcpServers.length}`}
                            />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className={sx(codexStyles.space2Pb3)}>
                          {snapshot.mcpServers.length === 0 ? (
                            <p className={sx(codexStyles.textSmMuted)}>
                              No MCP servers returned by the current App Server
                              runtime.
                            </p>
                          ) : (
                            snapshot.mcpServers.map((server) => (
                              <div
                                key={server.name}
                                className={sx(codexStyles.bgTile40)}
                              >
                                <div className={sx(codexStyles.rowColSmRow)}>
                                  <div className={sx(codexStyles.minW0Grow1)}>
                                    <p className={sx(codexStyles.breakWordsSmMedium)}>
                                      {server.name}
                                    </p>
                                    <p className={sx(codexStyles.breakAllXsMuted)}>
                                      {server.transportType}
                                      {server.url ? ` · ${server.url}` : ""}
                                    </p>
                                  </div>
                                  <div className={sx(codexStyles.shrink0WrapRow)}>
                                    <StatusPill
                                      label={
                                        server.authStatus ?? "unknown auth"
                                      }
                                      tone={
                                        server.authStatus
                                          ?.toLowerCase()
                                          .includes("ok") ||
                                        server.authStatus
                                          ?.toLowerCase()
                                          .includes("connected")
                                          ? "success"
                                          : server.authStatus
                                                ?.toLowerCase()
                                                .includes("auth")
                                            ? "warning"
                                            : "default"
                                      }
                                    />
                                    {server.authStatus
                                      ?.toLowerCase()
                                      .includes("auth") ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        xstyle={codexStyles.h7Only}
                                        onClick={() => {
                                          void handleOauthLogin(server.name);
                                        }}
                                        disabled={
                                          busyKey === `oauth:${server.name}`
                                        }
                                      >
                                        {busyKey === `oauth:${server.name}` ? (
                                          <Loader
                                            aria-hidden
                                            className={sx(codexStyles.mr1)}
                                            size="xs"
                                            variant="spinner"
                                          />
                                        ) : null}
                                        Login
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>

                                {(server.resources?.length ?? 0) > 0 ? (
                                  <div className={sx(codexStyles.mt3Space2)}>
                                    {server.resources
                                      ?.slice(0, 5)
                                      .map((resource) => (
                                        <div
                                          key={`${server.name}:${resource.uri}`}
                                          className={sx(codexStyles.resourceRow)}
                                        >
                                          <div className={sx(codexStyles.minW0Grow1)}>
                                            <p className={sx(codexStyles.breakWordsXsFontMedium)}>
                                              {resource.title ?? resource.name}
                                            </p>
                                            <p className={sx(codexStyles.breakAllXsMuted)}>
                                              {resource.uri}
                                            </p>
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            xstyle={codexStyles.h7Xs}
                                            onClick={() => {
                                              void handleReadResource({
                                                server: server.name,
                                                uri: resource.uri,
                                              });
                                            }}
                                            disabled={
                                              busyKey ===
                                              `resource:${server.name}:${resource.uri}`
                                            }
                                          >
                                            Preview
                                          </Button>
                                        </div>
                                      ))}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem
                        value="hooks"
                        className={sx(codexStyles.accordionItem)}
                      >
                        <AccordionTrigger className={sx(codexStyles.py3)}>
                          <div className={sx(codexStyles.rowCenterGap2)}>
                            <Webhook className={sx(codexStyles.icon4)} />
                            <span>Provider hooks</span>
                            <StatusPill
                              label={`${snapshot.hooks.reduce(
                                (count, group) => count + group.hooks.length,
                                0,
                              )}`}
                            />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className={sx(codexStyles.space3Pb3)}>
                          {snapshot.hooks.length === 0 ? (
                            <p className={sx(codexStyles.textSmMuted)}>
                              No hook inventory was returned by the selected
                              Codex runtime.
                            </p>
                          ) : (
                            snapshot.hooks.map((group) => (
                              <div key={group.cwd} className={sx(codexStyles.stack2)}>
                                <p className={sx(codexStyles.breakAllXsMuted)}>
                                  {group.cwd}
                                </p>
                                {group.hooks.map((hook) => (
                                  <div
                                    key={`${group.cwd}:${hook.key}`}
                                    className={sx(codexStyles.bgTile40)}
                                  >
                                    <div className={sx(codexStyles.rowColSmRow)}>
                                      <div className={sx(codexStyles.minW0Space1)}>
                                        <p className={sx(codexStyles.breakWordsSmMedium)}>
                                          {hook.key || hook.handlerType}
                                        </p>
                                        <p className={sx(codexStyles.breakAllXsMuted)}>
                                          {hook.sourcePath}
                                        </p>
                                        {hook.statusMessage ? (
                                          <p className={sx(codexStyles.textXsMuted)}>
                                            {hook.statusMessage}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className={sx(codexStyles.shrink0WrapRow)}>
                                        <StatusPill
                                          label={hook.eventName}
                                          tone={
                                            hook.enabled ? "success" : "default"
                                          }
                                        />
                                        <StatusPill label={hook.handlerType} />
                                        <StatusPill
                                          label={hook.trustStatus}
                                          tone={
                                            hook.trustStatus === "trusted" ||
                                            hook.trustStatus === "managed"
                                              ? "success"
                                              : hook.trustStatus === "modified"
                                                ? "warning"
                                                : "danger"
                                          }
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {group.warnings.map((warning, index) => (
                                  <p
                                    key={`${group.cwd}:warning:${index}`}
                                    className={sx(codexStyles.textXsMuted)}
                                  >
                                    {warning}
                                  </p>
                                ))}
                                {group.errors.map((error, index) => (
                                  <p
                                    key={`${group.cwd}:error:${index}`}
                                    className={sx(codexStyles.textXsDangerOnly)}
                                  >
                                    {error}
                                  </p>
                                ))}
                              </div>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem
                        value="experimental"
                        className={sx(codexStyles.accordionItem)}
                      >
                        <AccordionTrigger className={sx(codexStyles.py3)}>
                          <div className={sx(codexStyles.rowCenterGap2)}>
                            <Sparkles className={sx(codexStyles.icon4)} />
                            <span>Experimental features</span>
                            <StatusPill
                              label={`${snapshot.experimentalFeatures.length}`}
                            />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className={sx(codexStyles.space2Pb3)}>
                          {snapshot.experimentalFeatures.length === 0 ? (
                            <p className={sx(codexStyles.textSmMuted)}>
                              No experimental features are currently reported.
                            </p>
                          ) : (
                            snapshot.experimentalFeatures.map((feature) => (
                              <div
                                key={feature.name}
                                className={sx(codexStyles.featureRow)}
                              >
                                <div className={sx(codexStyles.stack1)}>
                                  <div className={sx(codexStyles.rowWrapCenterGap2)}>
                                    <p className={sx(codexStyles.textSmMedium)}>
                                      {feature.displayName ?? feature.name}
                                    </p>
                                    <StatusPill label={feature.stage} />
                                    {feature.defaultEnabled ? (
                                      <StatusPill label="default on" />
                                    ) : null}
                                  </div>
                                  <p className={sx(codexStyles.textXsMuted)}>
                                    {feature.description ?? "No description"}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    feature.enabled ? "default" : "outline"
                                  }
                                  xstyle={codexStyles.h8Only}
                                  onClick={() => {
                                    void handleFeatureToggle(
                                      feature.name,
                                      !feature.enabled,
                                    );
                                  }}
                                  disabled={
                                    busyKey === `feature:${feature.name}`
                                  }
                                >
                                  {busyKey === `feature:${feature.name}` ? (
                                    <Loader
                                      aria-hidden
                                      className={sx(codexStyles.mr1)}
                                      size="xs"
                                      variant="spinner"
                                    />
                                  ) : null}
                                  {feature.enabled ? "Disable" : "Enable"}
                                </Button>
                              </div>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </DenseSection>
                </div>

                <div className={sx(codexStyles.stack4)}>
                  <DenseSection
                    title="Inspector"
                    description="Selected plugin detail or the latest MCP resource preview."
                  >
                    {pluginDetailState.status === "ready" &&
                    pluginDetailState.value ? (
                      <div className={sx(codexStyles.stack4)}>
                        <div className={sx(codexStyles.stack1)}>
                          <div className={sx(codexStyles.rowWrapCenterGap2)}>
                            <p className={sx(codexStyles.inspectorTitle)}>
                              {pluginDetailState.value.name}
                            </p>
                            <StatusPill
                              label={
                                pluginDetailState.value.installed
                                  ? "installed"
                                  : "discoverable"
                              }
                              tone={
                                pluginDetailState.value.installed
                                  ? "success"
                                  : "warning"
                              }
                            />
                          </div>
                          <p className={sx(codexStyles.textSmMuted)}>
                            {pluginDetailState.value.description ??
                              "No plugin description."}
                          </p>
                        </div>

                        <div className={sx(codexStyles.rowWrapCenterGap2)}>
                          {selectedPluginSummary?.installed ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void handlePluginUninstall();
                              }}
                              disabled={
                                busyKey ===
                                `plugin-uninstall:${selectedPluginSummary.id}`
                              }
                            >
                              {busyKey ===
                              `plugin-uninstall:${selectedPluginSummary.id}` ? (
                                <Loader
                                  aria-hidden
                                  className={sx(codexStyles.mr1)}
                                  size="xs"
                                  variant="spinner"
                                />
                              ) : null}
                              Uninstall
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                void handlePluginInstall();
                              }}
                              disabled={
                                busyKey ===
                                `plugin-install:${selectedPluginSummary?.id ?? ""}`
                              }
                            >
                              {busyKey ===
                              `plugin-install:${selectedPluginSummary?.id ?? ""}` ? (
                                <Loader
                                  aria-hidden
                                  className={sx(codexStyles.mr1)}
                                  size="xs"
                                  variant="compile"
                                />
                              ) : null}
                              Install
                            </Button>
                          )}
                        </div>

                        <div className={sx(codexStyles.stack3)}>
                          <div>
                            <p className={sx(codexStyles.eyebrow)}>
                              Skills
                            </p>
                            <div className={sx(codexStyles.mt2Chips)}>
                              {pluginDetailState.value.skills.length > 0 ? (
                                pluginDetailState.value.skills.map((skill) => (
                                  <StatusPill
                                    key={skill.path}
                                    label={skill.name}
                                    tone={skill.enabled ? "success" : "default"}
                                  />
                                ))
                              ) : (
                                <p className={sx(codexStyles.textSmMuted)}>
                                  No plugin skills.
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className={sx(codexStyles.eyebrow)}>
                              Apps needing auth
                            </p>
                            <div className={sx(codexStyles.mt2Space2)}>
                              {pluginDetailState.value.apps.length > 0 ? (
                                pluginDetailState.value.apps.map((app) => (
                                  <div
                                    key={app.id}
                                    className={sx(codexStyles.smallTile)}
                                  >
                                    <div className={sx(codexStyles.rowColSmRow)}>
                                      <p className={sx(codexStyles.minW0BreakSmMedium)}>
                                        {app.name}
                                      </p>
                                      {app.installUrl ? (
                                        <ExternalAnchor
                                          href={app.installUrl}
                                          className={sx(codexStyles.inlineAnchorXs)}
                                        >
                                          Open
                                          <ExternalLink className={sx(codexStyles.size3Icon)} />
                                        </ExternalAnchor>
                                      ) : null}
                                    </div>
                                    <p className={sx(codexStyles.mt1BreakXsMuted)}>
                                      {app.description ?? "No description"}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className={sx(codexStyles.textSmMuted)}>
                                  No app-level auth requirements.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : resourcePreview.status !== "idle" ? (
                      <div className={sx(codexStyles.stack3)}>
                        <div>
                          <p className={sx(codexStyles.inspectorTitle)}>
                            {resourcePreview.title}
                          </p>
                          <p className={sx(codexStyles.textSmMutedMt1)}>
                            {resourcePreview.detail}
                          </p>
                        </div>
                        {resourcePreview.body.startsWith("http") ? (
                          <ExternalAnchor href={resourcePreview.body}>
                            Open authorization URL
                          </ExternalAnchor>
                        ) : (
                          <ReadOnlyCodeBlock
                            value={resourcePreview.body || "(empty)"}
                          />
                        )}
                      </div>
                    ) : (
                      <div className={sx(codexStyles.tileDashedCentered)}>
                        Select a plugin or preview an MCP resource to inspect it
                        here.
                      </div>
                    )}

                    {pluginDetailState.status === "error" ? (
                      <p className={sx(codexStyles.mt3TextSmDanger)}>
                        {pluginDetailState.detail}
                      </p>
                    ) : null}
                  </DenseSection>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="threads" className={sx(codexStyles.tabContent)}>
            {!snapshot ? null : (
              <div className={sx(codexStyles.twoColGridThreads)}>
                <DenseSection
                  title="Thread list"
                  description="Active and archived Codex threads returned for the current workspace."
                >
                  <div className={sx(codexStyles.stack4)}>
                    {[
                      ["Active", snapshot.threads] as const,
                      ["Archived", snapshot.archivedThreads] as const,
                    ].map(([label, threads]) => (
                      <div key={label} className={sx(codexStyles.stack2)}>
                        <div className={sx(codexStyles.rowCenterBetweenGap2)}>
                          <p className={sx(codexStyles.eyebrow)}>
                            {label}
                          </p>
                          <StatusPill label={`${threads.length}`} />
                        </div>
                        {threads.length === 0 ? (
                          <div className={sx(codexStyles.tileDashed)}>
                            No {label.toLowerCase()} threads.
                          </div>
                        ) : (
                          <div className={sx(codexStyles.stack2)}>
                            {threads.map((thread) => (
                              <AdsButton
                                key={thread.id}
                                type="button"
                                layout="host"
                                press="none"
                                onClick={() => setSelectedThreadId(thread.id)}
                                xstyle={[
                                  codexStyles.rowButtonThread,
                                  selectedThreadId === thread.id
                                    ? codexStyles.rowButtonSelected
                                    : codexStyles.rowButtonResting,
                                ]}
                              >
                                <div className={sx(codexStyles.minW0Space1)}>
                                  <div className={sx(codexStyles.rowWrapCenterGap2)}>
                                    <p className={sx(codexStyles.truncateSmMedium)}>
                                      {(thread.name ?? thread.preview) ||
                                        thread.id}
                                    </p>
                                    {thread.id === currentThreadId ? (
                                      <StatusPill
                                        label="current"
                                        tone="success"
                                      />
                                    ) : null}
                                  </div>
                                  <p className={sx(codexStyles.truncateXsMuted)}>
                                    {thread.preview || thread.id}
                                  </p>
                                  <p className={sx(codexStyles.truncateMicroMuted)}>
                                    Updated {formatDateTime(thread.updatedAt)}
                                  </p>
                                </div>
                                <div className={sx(codexStyles.threadStatusMeta)}>
                                  <span>{thread.modelProvider}</span>
                                  <span>{thread.status}</span>
                                </div>
                              </AdsButton>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </DenseSection>

                <div className={sx(codexStyles.stack4)}>
                  <DenseSection
                    title="Thread inspector"
                    description="Inspect the selected thread and run fork, review, rename, compact, archive, or rollback actions."
                  >
                    {selectedThreadSummary ? (
                      <div className={sx(codexStyles.stack4)}>
                        <div className={sx(codexStyles.stack1)}>
                          <div className={sx(codexStyles.rowWrapCenterGap2)}>
                            <p className={sx(codexStyles.inspectorTitle)}>
                              {selectedThreadSummary.name ??
                                selectedThreadSummary.id}
                            </p>
                            {selectedThreadSummary.id === currentThreadId ? (
                              <StatusPill
                                label="current session"
                                tone="success"
                              />
                            ) : null}
                            {selectedThreadSummary.archived ? (
                              <StatusPill label="archived" />
                            ) : null}
                          </div>
                          <p className={sx(codexStyles.textSmMuted)}>
                            {selectedThreadSummary.preview ||
                              selectedThreadSummary.id}
                          </p>
                        </div>

                        <div className={sx(codexStyles.smTwoCol)}>
                          <DenseMetric
                            label="Turns"
                            value={String(
                              threadDetailState.value?.turnCount ?? "—",
                            )}
                          />
                          <DenseMetric
                            label="Model provider"
                            value={selectedThreadSummary.modelProvider}
                          />
                          <DenseMetric
                            label="CLI version"
                            value={selectedThreadSummary.cliVersion}
                          />
                          <DenseMetric
                            label="Updated"
                            value={formatDateTime(
                              selectedThreadSummary.updatedAt,
                            )}
                          />
                        </div>

                        <div className={sx(codexStyles.lgTwoColGap3)}>
                          <div className={sx(codexStyles.stack2)}>
                            <p className={sx(codexStyles.eyebrow)}>
                              Rename
                            </p>
                            <div className={sx(codexStyles.rowCenterGap2)}>
                              <Input
                                value={renameDraft}
                                onChange={(event) =>
                                  setRenameDraft(event.target.value)
                                }
                                placeholder="Thread name"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void handleRenameThread();
                                }}
                                disabled={
                                  busyKey ===
                                  `thread-rename:${selectedThreadId}`
                                }
                              >
                                Save
                              </Button>
                            </div>
                          </div>

                          <div className={sx(codexStyles.stack2)}>
                            <p className={sx(codexStyles.eyebrow)}>
                              Quick actions
                            </p>
                            <div className={sx(codexStyles.wrapGap2)}>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void handleForkThread();
                                }}
                                disabled={
                                  busyKey === `thread-fork:${selectedThreadId}`
                                }
                              >
                                Fork
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void handleCompactThread();
                                }}
                                disabled={
                                  busyKey ===
                                  `thread-compact:${selectedThreadId}`
                                }
                              >
                                Compact
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void handleArchiveThread(
                                    !selectedThreadSummary.archived,
                                  );
                                }}
                                disabled={
                                  busyKey ===
                                  `thread-archive:${selectedThreadId}`
                                }
                              >
                                {selectedThreadSummary.archived
                                  ? "Restore"
                                  : "Archive"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className={sx(codexStyles.maxWSm)}>
                          <div className={sx(codexStyles.rollbackTile)}>
                            <p className={sx(codexStyles.eyebrow)}>
                              Rollback
                            </p>
                            <DraftInput
                              value={rollbackTurns}
                              onCommit={setRollbackTurns}
                              xstyle={codexStyles.rollbackInput}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void handleRollbackThread();
                              }}
                              disabled={
                                busyKey ===
                                `thread-rollback:${selectedThreadId}`
                              }
                            >
                              Roll back turns
                            </Button>
                          </div>
                        </div>

                        {threadDetailState.status === "ready" &&
                        threadDetailState.value ? (
                          <ReadOnlyCodeBlock
                            value={JSON.stringify(
                              threadDetailState.value.raw,
                              null,
                              2,
                            )}
                            minHeight={260}
                          />
                        ) : (
                          <p className={sx(codexStyles.textSmMuted)}>
                            {threadDetailState.detail}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className={sx(codexStyles.tileDashedCentered)}>
                        Select a thread to inspect it here.
                      </div>
                    )}
                  </DenseSection>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="commands" className={sx(codexStyles.tabContent)}>
            <div className={sx(codexStyles.stack4)}>
              <DenseSection
                title="Slash command catalog"
                description="Bundled from the official Codex CLI slash-command guide so the popup stays useful even though App Server does not expose a live command-list RPC."
              >
                <div className={sx(codexStyles.rowWrapCenterGap3)}>
                  <div className={sx(codexStyles.searchWrap)}>
                    <Search className={sx(codexStyles.searchIcon)} />
                    <Input
                      value={commandQuery}
                      onChange={(event) => setCommandQuery(event.target.value)}
                      placeholder="Filter by command, behavior, or category"
                      xstyle={codexStyles.searchInput}
                    />
                  </div>
                  <StatusPill
                    label={`${CODEX_CLI_SLASH_COMMANDS.length} total`}
                  />
                </div>

                <p className={sx(codexStyles.textSmMutedMt3)}>
                  {getCodexSlashCommandCatalogDetail()}
                </p>
              </DenseSection>

              {groupedCommands.length === 0 ? (
                <DenseSection
                  title="No matches"
                  description="Try a shorter query or clear the filter."
                >
                  <div className={sx(codexStyles.tileDashedCenteredSm)}>
                    No slash commands matched{" "}
                    <span className={sx(codexStyles.fontMediumFg)}>
                      {commandQuery}
                    </span>
                    .
                  </div>
                </DenseSection>
              ) : (
                groupedCommands.map((group) => (
                  <DenseSection
                    key={group.category}
                    title={COMMAND_CATEGORY_LABELS[group.category]}
                    description={`${group.items.length} command${group.items.length === 1 ? "" : "s"}`}
                  >
                    <div className={sx(codexStyles.stack2)}>
                      {group.items.map((command) => (
                        <div
                          key={command.command}
                          className={sx(codexStyles.bgTile50)}
                        >
                          <div className={sx(codexStyles.rowWrapCenterGap2)}>
                            <p className={sx(codexStyles.commandTitle)}>
                              {command.command}
                            </p>
                            {command.argumentHint ? (
                              <StatusPill label={command.argumentHint} />
                            ) : null}
                            {command.availabilityNote ? (
                              <StatusPill
                                label={command.availabilityNote}
                                tone="warning"
                              />
                            ) : null}
                          </div>
                          <p className={sx(codexStyles.textSmMutedMt1)}>
                            {command.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </DenseSection>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="config" className={sx(codexStyles.tabContent)}>
            {!snapshot ? null : (
              <div className={sx(codexStyles.twoColGridConfig)}>
                <div className={sx(codexStyles.stack4)}>
                  <DenseSection
                    title="Config requirements"
                    description="Policy limits the App Server reports for approvals, sandbox, residency, and feature gates."
                    action={
                      snapshot.externalAgentConfigItems.length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void handleImportExternalConfig();
                          }}
                          disabled={busyKey === "config-import"}
                        >
                          {busyKey === "config-import" ? (
                            <Loader
                              aria-hidden
                              className={sx(codexStyles.mr1)}
                              size="xs"
                              variant="spinner"
                            />
                          ) : null}
                          Import detected config
                        </Button>
                      ) : null
                    }
                  >
                    <div className={sx(codexStyles.stack3)}>
                      <div className={sx(codexStyles.wrapGap2)}>
                        {(
                          snapshot.configRequirements
                            ?.allowedApprovalPolicies ?? []
                        ).map((value) => (
                          <StatusPill
                            key={`approval:${value}`}
                            label={`approval ${value}`}
                          />
                        ))}
                        {(
                          snapshot.configRequirements?.allowedSandboxModes ?? []
                        ).map((value) => (
                          <StatusPill
                            key={`sandbox:${value}`}
                            label={`sandbox ${value}`}
                          />
                        ))}
                        {(
                          snapshot.configRequirements?.allowedWebSearchModes ??
                          []
                        ).map((value) => (
                          <StatusPill
                            key={`search:${value}`}
                            label={`search ${value}`}
                          />
                        ))}
                        {snapshot.configRequirements?.enforceResidency ? (
                          <StatusPill
                            label={`residency ${snapshot.configRequirements.enforceResidency}`}
                          />
                        ) : null}
                      </div>

                      {snapshot.externalAgentConfigItems.length > 0 ? (
                        <div className={sx(codexStyles.tile)}>
                          <p className={sx(codexStyles.textSmMedium)}>
                            Detected external configs
                          </p>
                          <div className={sx(codexStyles.mt2Space2)}>
                            {snapshot.externalAgentConfigItems.map(
                              (item, index) => (
                                <div
                                  key={`${item.itemType}:${item.description}:${index}`}
                                  className={sx(codexStyles.smallTile)}
                                >
                                  <p className={sx(codexStyles.textSmMedium)}>
                                    {item.itemType}
                                  </p>
                                  <p className={sx(codexStyles.mt1TextXsMuted)}>
                                    {item.description}
                                  </p>
                                  {item.cwd ? (
                                    <p className={sx(codexStyles.breakAllMicroMutedMt1)}>
                                      {item.cwd}
                                    </p>
                                  ) : null}
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </DenseSection>

                  <DenseSection
                    title="Config layers"
                    description="Merged config plus per-layer diagnostics returned by Codex."
                  >
                    <Accordion multiple className={sx(codexStyles.wFullSpace3)}>
                      {snapshot.config?.layers.map((layer, index) => (
                        <AccordionItem
                          key={`${layer.name}:${layer.version}:${index}`}
                          value={`${layer.name}:${layer.version}:${index}`}
                          className={sx(codexStyles.accordionItem)}
                        >
                          <AccordionTrigger className={sx(codexStyles.py3)}>
                            <div className={sx(codexStyles.accordionTriggerRow)}>
                              <Layers2 className={sx(codexStyles.icon4)} />
                              <span className={sx(codexStyles.accordionLayerName)}>
                                {layer.name}
                              </span>
                              {layer.version ? (
                                <StatusPill label={layer.version} />
                              ) : null}
                              {layer.disabledReason ? (
                                <StatusPill label="disabled" tone="warning" />
                              ) : null}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className={sx(codexStyles.space2Pb3)}>
                            {layer.disabledReason ? (
                              <p className={sx(codexStyles.descAnywhere)}>
                                {layer.disabledReason}
                              </p>
                            ) : null}
                            <ReadOnlyCodeBlock
                              value={JSON.stringify(layer.config, null, 2)}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </DenseSection>
                </div>

                <div className={sx(codexStyles.stack4)}>
                  <DenseSection
                    title="Advanced config edits"
                    description="Raw JSON utilities for targeted Codex config changes. Most users should only inspect this area when diagnosing App Server behavior."
                  >
                    <div className={sx(codexStyles.stack4)}>
                      <div className={sx(codexStyles.stack2)}>
                        <p className={sx(codexStyles.eyebrow)}>
                          Single edit
                        </p>
                        <Input
                          value={singleConfigKeyPath}
                          onChange={(event) =>
                            setSingleConfigKeyPath(event.target.value)
                          }
                          placeholder="features.apps"
                        />
                        <Input
                          value={singleMergeStrategy}
                          onChange={(event) =>
                            setSingleMergeStrategy(event.target.value)
                          }
                          placeholder="Optional mergeStrategy"
                        />
                        <Textarea
                          value={singleConfigValue}
                          onChange={(event) =>
                            setSingleConfigValue(event.target.value)
                          }
                          xstyle={codexStyles.configTextarea140}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            void handleSingleConfigWrite();
                          }}
                          disabled={busyKey === "config-write-single"}
                        >
                          {busyKey === "config-write-single" ? (
                            <Loader
                              aria-hidden
                              className={sx(codexStyles.mr1)}
                              size="xs"
                              variant="spinner"
                            />
                          ) : null}
                          Apply single edit
                        </Button>
                      </div>

                      <div className={sx(codexStyles.stack2)}>
                        <p className={sx(codexStyles.eyebrow)}>
                          Batch edits
                        </p>
                        <Textarea
                          value={batchConfigEdits}
                          onChange={(event) =>
                            setBatchConfigEdits(event.target.value)
                          }
                          xstyle={codexStyles.configTextarea220}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void handleBatchConfigWrite();
                          }}
                          disabled={busyKey === "config-write-batch"}
                        >
                          {busyKey === "config-write-batch" ? (
                            <Loader
                              aria-hidden
                              className={sx(codexStyles.mr1)}
                              size="xs"
                              variant="spinner"
                            />
                          ) : null}
                          Apply batch
                        </Button>
                      </div>
                    </div>
                  </DenseSection>

                  <DenseSection
                    title="Merged advanced config"
                    description="Read-only raw config payload returned by `config/read`."
                  >
                    <ReadOnlyCodeBlock
                      value={JSON.stringify(
                        snapshot.config?.config ?? {},
                        null,
                        2,
                      )}
                      minHeight={280}
                    />
                  </DenseSection>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </>
  );
}
