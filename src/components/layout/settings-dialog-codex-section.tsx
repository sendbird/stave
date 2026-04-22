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
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  AlertCircle,
  AppWindow,
  Bot,
  ExternalLink,
  Layers2,
  LoaderCircle,
  Package2,
  Plug2,
  RefreshCcw,
  Search,
  Sparkles,
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
import { DraftInput, SectionHeading } from "./settings-dialog.shared";

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
      className={cn(
        "rounded-xl border px-3 py-3",
        args.tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/5"
          : args.tone === "warning"
            ? "border-amber-500/20 bg-amber-500/5"
            : args.tone === "muted"
              ? "border-border/60 bg-muted/20"
              : "border-border/70 bg-background/60",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {args.label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        {args.value}
      </p>
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
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-background/60",
        args.className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-sm font-semibold text-foreground">
            {args.title}
          </h4>
          {args.description ? (
            <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {args.description}
            </p>
          ) : null}
        </div>
        {args.action}
      </div>
      <div className="px-4 py-4">{args.children}</div>
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
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        args.tone === "success"
          ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          : args.tone === "warning"
            ? "border-amber-500/30 text-amber-700 dark:text-amber-300"
            : args.tone === "danger"
              ? "border-destructive/30 text-destructive"
              : "border-border/70 text-muted-foreground",
      )}
    >
      {args.label}
    </Badge>
  );
}

function ReadOnlyCodeBlock(args: { value: string; minHeight?: string }) {
  return (
    <Textarea
      readOnly
      value={args.value}
      className={cn(
        "font-mono text-[12px] leading-5",
        args.minHeight ?? "min-h-[180px]",
      )}
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
  const currentThreadId =
    activeTaskId && providerSessionByTask[activeTaskId]
      ? (providerSessionByTask[activeTaskId].codex ?? null)
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
      label: "Started thread compaction",
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
      <SectionHeading
        title="Codex"
        description="Inspect the live Codex App Server surface, manage plugins and threads, and verify how the current runtime differs from Stave defaults."
      />
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-background/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {snapshotState.updatedAt ? (
              <span>Updated {formatDateTime(snapshotState.updatedAt)}</span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                void loadSnapshot();
              }}
            >
              <RefreshCcw
                className={cn(
                  "size-3.5",
                  snapshotState.status === "loading" && "animate-spin",
                )}
              />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <div className="border-b border-border/60 px-4 py-2">
            <TabsList className="h-auto w-full justify-start rounded-xl border border-border/70 bg-muted/20 p-1">
              <TabsTrigger
                value="overview"
                className="h-8 rounded-lg px-3 text-xs font-medium"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="extensions"
                className="h-8 rounded-lg px-3 text-xs font-medium"
              >
                Extensions
              </TabsTrigger>
              <TabsTrigger
                value="threads"
                className="h-8 rounded-lg px-3 text-xs font-medium"
              >
                Threads
              </TabsTrigger>
              <TabsTrigger
                value="commands"
                className="h-8 rounded-lg px-3 text-xs font-medium"
              >
                Commands
              </TabsTrigger>
              <TabsTrigger
                value="config"
                className="h-8 rounded-lg px-3 text-xs font-medium"
              >
                Config
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="m-0 p-4">
            {!snapshot ? (
              <Empty className="border-none bg-transparent px-6 py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {snapshotState.status === "error" ? (
                      <AlertCircle className="size-5" />
                    ) : (
                      <LoaderCircle className="size-5 animate-spin" />
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
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  {metrics.map((metric) => (
                    <DenseMetric
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      tone={metric.tone}
                    />
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                  <DenseSection
                    title="Runtime summary"
                    description="Live App Server data for the current workspace and Codex binary."
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-foreground">
                              Account
                            </p>
                            <StatusPill
                              label={accountBadge.label}
                              tone={accountBadge.tone}
                            />
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <p>Type: {snapshot.account?.type ?? "unknown"}</p>
                            <p>Email: {snapshot.account?.email ?? "unknown"}</p>
                            <p>
                              Plan: {snapshot.account?.planType ?? "unknown"}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-foreground">
                              Model catalog
                            </p>
                            <div className="flex items-center gap-2">
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
                                className="h-6 px-1.5"
                                onClick={() => codexModelCatalog.refresh()}
                              >
                                <RefreshCcw
                                  className={cn(
                                    "size-3",
                                    codexModelCatalog.status === "loading" &&
                                      "animate-spin",
                                  )}
                                />
                              </Button>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {codexModelCatalog.detail ||
                              "Using the configured Codex model catalog."}
                          </p>
                          {codexModelCatalog.entries.length > 0 ? (
                            <div className="mt-3 space-y-1.5">
                              {codexModelCatalog.entries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="flex items-start justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <span className="font-medium text-foreground">
                                      {entry.displayName || entry.model}
                                    </span>
                                    {entry.description ? (
                                      <span className="ml-1.5 text-muted-foreground">
                                        {entry.description}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {entry.isDefault ? (
                                      <Badge
                                        variant="outline"
                                        className="h-4 px-1 text-[10px]"
                                      >
                                        default
                                      </Badge>
                                    ) : null}
                                    {entry.supportedReasoningEfforts.length >
                                    0 ? (
                                      <span className="text-muted-foreground">
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
                            <p className="mt-2 text-xs text-muted-foreground">
                              {codexModelCatalog.models.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-foreground">
                              Workspace scope
                            </p>
                            {workspaceCwd ? (
                              <StatusPill label="scoped" />
                            ) : null}
                          </div>
                          <div className="mt-2 space-y-1 break-all text-sm text-muted-foreground">
                            <p>
                              {workspaceCwd ?? "No workspace cwd available."}
                            </p>
                            <p>
                              Binary:{" "}
                              {trimmedBinaryPath || "Default Codex executable"}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-foreground">
                              Slash commands
                            </p>
                            <StatusPill
                              label={`${CODEX_CLI_SLASH_COMMANDS.length} built-in`}
                            />
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
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
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                        No partial section failures.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(snapshotState.sectionErrors).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3"
                            >
                              <p className="text-sm font-medium text-foreground">
                                {key}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
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
                    <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                      No rate-limit buckets returned by the App Server.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {snapshot.rateLimits.map((limit, index) => (
                        <div
                          key={`${limit.limitId ?? "limit"}:${index}`}
                          className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {limit.limitName ??
                                  limit.limitId ??
                                  "Unnamed bucket"}
                              </p>
                              <p className="text-xs text-muted-foreground">
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

                          <div className="mt-3 space-y-3">
                            {[
                              ["Primary", limit.primary] as const,
                              ["Secondary", limit.secondary] as const,
                            ]
                              .filter(([, bucket]) => bucket)
                              .map(([label, bucket]) => (
                                <div key={label} className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                    <span>{label}</span>
                                    <span>
                                      {formatPercent(bucket?.usedPercent)}
                                      {bucket?.resetsAt
                                        ? ` · resets ${formatDateTime(bucket.resetsAt)}`
                                        : ""}
                                    </span>
                                  </div>
                                  <div className="h-2 rounded-full bg-muted/60">
                                    <div
                                      className="h-2 rounded-full bg-primary/70"
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

          <TabsContent value="extensions" className="m-0 p-4">
            {!snapshot ? null : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-4">
                  <DenseSection
                    title="Plugins and apps"
                    description="Installed, discoverable, and currently accessible extension surfaces."
                  >
                    <Accordion type="multiple" className="w-full space-y-3">
                      <AccordionItem
                        value="plugins"
                        className="rounded-xl border border-border/70 px-3"
                      >
                        <AccordionTrigger className="py-3">
                          <div className="flex items-center gap-2">
                            <Package2 className="size-4 text-muted-foreground" />
                            <span>Plugins</span>
                            <StatusPill label={`${snapshot.plugins.length}`} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-3">
                          {snapshot.plugins.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No plugins returned by the current App Server
                              runtime.
                            </p>
                          ) : (
                            snapshot.plugins.map((plugin) => (
                              <button
                                key={plugin.id}
                                type="button"
                                onClick={() => setSelectedPluginId(plugin.id)}
                                className={cn(
                                  "flex w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left transition sm:flex-row sm:items-start sm:justify-between",
                                  selectedPluginId === plugin.id
                                    ? "border-primary/30 bg-primary/5"
                                    : "border-border/70 bg-background/40 hover:bg-muted/20",
                                )}
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-foreground">
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
                                  <p className="break-words text-xs text-muted-foreground">
                                    {plugin.marketplaceDisplayName ??
                                      plugin.marketplaceName}
                                  </p>
                                </div>
                                <div
                                  className="max-w-full break-all text-xs text-muted-foreground sm:max-w-[16rem] sm:text-right"
                                  title={plugin.source}
                                >
                                  {plugin.source}
                                </div>
                              </button>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem
                        value="apps"
                        className="rounded-xl border border-border/70 px-3"
                      >
                        <AccordionTrigger className="py-3">
                          <div className="flex items-center gap-2">
                            <AppWindow className="size-4 text-muted-foreground" />
                            <span>Apps</span>
                            <StatusPill label={`${snapshot.apps.length}`} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-3">
                          {snapshot.apps.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No apps returned by the current App Server
                              runtime.
                            </p>
                          ) : (
                            snapshot.apps.map((app) => (
                              <div
                                key={app.id}
                                className="rounded-xl border border-border/70 bg-background/40 px-3 py-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-medium text-foreground">
                                      {app.name}
                                    </p>
                                    <p className="break-words text-xs text-muted-foreground">
                                      {app.description ?? "No description"}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                                        className="inline-flex items-center gap-1 text-xs"
                                      >
                                        Open
                                        <ExternalLink className="size-3" />
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
                        className="rounded-xl border border-border/70 px-3"
                      >
                        <AccordionTrigger className="py-3">
                          <div className="flex items-center gap-2">
                            <Bot className="size-4 text-muted-foreground" />
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
                        <AccordionContent className="space-y-3 pb-3">
                          {snapshot.skills.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No skill groups returned by the current workspace.
                            </p>
                          ) : (
                            snapshot.skills.map((group) => (
                              <div
                                key={group.cwd}
                                className="rounded-xl border border-border/70 bg-background/40 px-3 py-3"
                              >
                                <p className="break-all text-xs text-muted-foreground">
                                  {group.cwd}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
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
                                  <div className="mt-3 space-y-1 text-xs text-destructive">
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
                        className="rounded-xl border border-border/70 px-3"
                      >
                        <AccordionTrigger className="py-3">
                          <div className="flex items-center gap-2">
                            <Plug2 className="size-4 text-muted-foreground" />
                            <span>MCP servers</span>
                            <StatusPill
                              label={`${snapshot.mcpServers.length}`}
                            />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-3">
                          {snapshot.mcpServers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No MCP servers returned by the current App Server
                              runtime.
                            </p>
                          ) : (
                            snapshot.mcpServers.map((server) => (
                              <div
                                key={server.name}
                                className="rounded-xl border border-border/70 bg-background/40 px-3 py-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-medium text-foreground">
                                      {server.name}
                                    </p>
                                    <p className="break-all text-xs text-muted-foreground">
                                      {server.transportType}
                                      {server.url ? ` · ${server.url}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                                        className="h-7"
                                        onClick={() => {
                                          void handleOauthLogin(server.name);
                                        }}
                                        disabled={
                                          busyKey === `oauth:${server.name}`
                                        }
                                      >
                                        {busyKey === `oauth:${server.name}` ? (
                                          <LoaderCircle className="mr-1 size-3.5 animate-spin" />
                                        ) : null}
                                        Login
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>

                                {(server.resources?.length ?? 0) > 0 ? (
                                  <div className="mt-3 space-y-2">
                                    {server.resources
                                      ?.slice(0, 5)
                                      .map((resource) => (
                                        <div
                                          key={`${server.name}:${resource.uri}`}
                                          className="flex flex-col gap-2 rounded-lg border border-border/60 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="break-words text-xs font-medium text-foreground">
                                              {resource.title ?? resource.name}
                                            </p>
                                            <p className="break-all text-xs text-muted-foreground">
                                              {resource.uri}
                                            </p>
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-xs"
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
                        value="experimental"
                        className="rounded-xl border border-border/70 px-3"
                      >
                        <AccordionTrigger className="py-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-4 text-muted-foreground" />
                            <span>Experimental features</span>
                            <StatusPill
                              label={`${snapshot.experimentalFeatures.length}`}
                            />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-3">
                          {snapshot.experimentalFeatures.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No experimental features are currently reported.
                            </p>
                          ) : (
                            snapshot.experimentalFeatures.map((feature) => (
                              <div
                                key={feature.name}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-3"
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-foreground">
                                      {feature.displayName ?? feature.name}
                                    </p>
                                    <StatusPill label={feature.stage} />
                                    {feature.defaultEnabled ? (
                                      <StatusPill label="default on" />
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {feature.description ?? "No description"}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    feature.enabled ? "default" : "outline"
                                  }
                                  className="h-8"
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
                                    <LoaderCircle className="mr-1 size-3.5 animate-spin" />
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

                <div className="space-y-4">
                  <DenseSection
                    title="Inspector"
                    description="Selected plugin detail or the latest MCP resource preview."
                  >
                    {pluginDetailState.status === "ready" &&
                    pluginDetailState.value ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold tracking-tight text-foreground">
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
                          <p className="text-sm text-muted-foreground">
                            {pluginDetailState.value.description ??
                              "No plugin description."}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
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
                                <LoaderCircle className="mr-1 size-3.5 animate-spin" />
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
                                <LoaderCircle className="mr-1 size-3.5 animate-spin" />
                              ) : null}
                              Install
                            </Button>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Skills
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {pluginDetailState.value.skills.length > 0 ? (
                                pluginDetailState.value.skills.map((skill) => (
                                  <StatusPill
                                    key={skill.path}
                                    label={skill.name}
                                    tone={skill.enabled ? "success" : "default"}
                                  />
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No plugin skills.
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Apps needing auth
                            </p>
                            <div className="mt-2 space-y-2">
                              {pluginDetailState.value.apps.length > 0 ? (
                                pluginDetailState.value.apps.map((app) => (
                                  <div
                                    key={app.id}
                                    className="rounded-lg border border-border/60 px-3 py-2"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <p className="min-w-0 break-words text-sm font-medium text-foreground">
                                        {app.name}
                                      </p>
                                      {app.installUrl ? (
                                        <ExternalAnchor
                                          href={app.installUrl}
                                          className="inline-flex items-center gap-1 text-xs"
                                        >
                                          Open
                                          <ExternalLink className="size-3" />
                                        </ExternalAnchor>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 break-words text-xs text-muted-foreground">
                                      {app.description ?? "No description"}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No app-level auth requirements.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : resourcePreview.status !== "idle" ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-base font-semibold tracking-tight text-foreground">
                            {resourcePreview.title}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
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
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-10 text-center text-sm text-muted-foreground">
                        Select a plugin or preview an MCP resource to inspect it
                        here.
                      </div>
                    )}

                    {pluginDetailState.status === "error" ? (
                      <p className="mt-3 text-sm text-destructive">
                        {pluginDetailState.detail}
                      </p>
                    ) : null}
                  </DenseSection>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="threads" className="m-0 p-4">
            {!snapshot ? null : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)]">
                <DenseSection
                  title="Thread list"
                  description="Active and archived Codex threads returned for the current workspace."
                >
                  <div className="space-y-4">
                    {[
                      ["Active", snapshot.threads] as const,
                      ["Archived", snapshot.archivedThreads] as const,
                    ].map(([label, threads]) => (
                      <div key={label} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {label}
                          </p>
                          <StatusPill label={`${threads.length}`} />
                        </div>
                        {threads.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                            No {label.toLowerCase()} threads.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {threads.map((thread) => (
                              <button
                                key={thread.id}
                                type="button"
                                onClick={() => setSelectedThreadId(thread.id)}
                                className={cn(
                                  "flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition",
                                  selectedThreadId === thread.id
                                    ? "border-primary/30 bg-primary/5"
                                    : "border-border/70 bg-background/40 hover:bg-muted/20",
                                )}
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-medium text-foreground">
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
                                  <p className="truncate text-xs text-muted-foreground">
                                    {thread.preview || thread.id}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Updated {formatDateTime(thread.updatedAt)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground">
                                  <span>{thread.modelProvider}</span>
                                  <span>{thread.status}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </DenseSection>

                <div className="space-y-4">
                  <DenseSection
                    title="Thread inspector"
                    description="Inspect the selected thread and run fork, review, rename, compact, archive, or rollback actions."
                  >
                    {selectedThreadSummary ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold tracking-tight text-foreground">
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
                          <p className="text-sm text-muted-foreground">
                            {selectedThreadSummary.preview ||
                              selectedThreadSummary.id}
                          </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
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

                        <div className="grid gap-3 lg:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Rename
                            </p>
                            <div className="flex items-center gap-2">
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

                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Quick actions
                            </p>
                            <div className="flex flex-wrap gap-2">
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

                        <div className="max-w-sm">
                          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Rollback
                            </p>
                            <DraftInput
                              value={rollbackTurns}
                              onCommit={setRollbackTurns}
                              className="h-10"
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
                            minHeight="min-h-[260px]"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {threadDetailState.detail}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-10 text-center text-sm text-muted-foreground">
                        Select a thread to inspect it here.
                      </div>
                    )}
                  </DenseSection>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="commands" className="m-0 p-4">
            <div className="space-y-4">
              <DenseSection
                title="Slash command catalog"
                description="Bundled from the official Codex CLI slash-command guide so the popup stays useful even though App Server does not expose a live command-list RPC."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[260px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={commandQuery}
                      onChange={(event) => setCommandQuery(event.target.value)}
                      placeholder="Filter by command, behavior, or category"
                      className="pl-9"
                    />
                  </div>
                  <StatusPill
                    label={`${CODEX_CLI_SLASH_COMMANDS.length} total`}
                  />
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  {getCodexSlashCommandCatalogDetail()}
                </p>
              </DenseSection>

              {groupedCommands.length === 0 ? (
                <DenseSection
                  title="No matches"
                  description="Try a shorter query or clear the filter."
                >
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                    No slash commands matched{" "}
                    <span className="font-medium text-foreground">
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
                    <div className="space-y-2">
                      {group.items.map((command) => (
                        <div
                          key={command.command}
                          className="rounded-xl border border-border/70 bg-background/50 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
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
                          <p className="mt-1 text-sm text-muted-foreground">
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

          <TabsContent value="config" className="m-0 p-4">
            {!snapshot ? null : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.95fr)]">
                <div className="space-y-4">
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
                            <LoaderCircle className="mr-1 size-3.5 animate-spin" />
                          ) : null}
                          Import detected config
                        </Button>
                      ) : null
                    }
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
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
                        <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                          <p className="text-sm font-medium text-foreground">
                            Detected external configs
                          </p>
                          <div className="mt-2 space-y-2">
                            {snapshot.externalAgentConfigItems.map(
                              (item, index) => (
                                <div
                                  key={`${item.itemType}:${item.description}:${index}`}
                                  className="rounded-lg border border-border/60 px-3 py-2"
                                >
                                  <p className="text-sm font-medium text-foreground">
                                    {item.itemType}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {item.description}
                                  </p>
                                  {item.cwd ? (
                                    <p className="mt-1 break-all text-[11px] text-muted-foreground">
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
                    <Accordion type="multiple" className="w-full space-y-3">
                      {snapshot.config?.layers.map((layer, index) => (
                        <AccordionItem
                          key={`${layer.name}:${layer.version}:${index}`}
                          value={`${layer.name}:${layer.version}:${index}`}
                          className="rounded-xl border border-border/70 px-3"
                        >
                          <AccordionTrigger className="py-3">
                            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 pr-3">
                              <Layers2 className="size-4 text-muted-foreground" />
                              <span className="min-w-0 break-words text-left [overflow-wrap:anywhere]">
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
                          <AccordionContent className="space-y-2 pb-3">
                            {layer.disabledReason ? (
                              <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
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

                <div className="space-y-4">
                  <DenseSection
                    title="Config edits"
                    description="Advanced utilities for writing specific Codex config keys from inside Stave."
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                          className="min-h-[140px] font-mono text-[12px]"
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
                            <LoaderCircle className="mr-1 size-3.5 animate-spin" />
                          ) : null}
                          Apply single edit
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Batch edits
                        </p>
                        <Textarea
                          value={batchConfigEdits}
                          onChange={(event) =>
                            setBatchConfigEdits(event.target.value)
                          }
                          className="min-h-[220px] font-mono text-[12px]"
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
                            <LoaderCircle className="mr-1 size-3.5 animate-spin" />
                          ) : null}
                          Apply batch
                        </Button>
                      </div>
                    </div>
                  </DenseSection>

                  <DenseSection
                    title="Merged config"
                    description="Raw config payload returned by `config/read`."
                  >
                    <ReadOnlyCodeBlock
                      value={JSON.stringify(
                        snapshot.config?.config ?? {},
                        null,
                        2,
                      )}
                      minHeight="min-h-[280px]"
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
