import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, FilePenLine, RefreshCcw, Save } from "lucide-react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { ScriptEntriesTab } from "./ScriptEntriesTab";
import { ScriptHooksTab } from "./ScriptHooksTab";
import { ScriptTargetsTab } from "./ScriptTargetsTab";
import {
  buildEditorScopes,
  buildEditorHookCandidates,
  buildEditorTargetOptions,
  isPlainRecord,
  snapshotScriptEditorState,
  removeMatchingHookLinks,
  isHookLinked,
  scriptEditorScopeKey,
  type EditorFileState,
  type ScriptEditorScope,
  type ScriptEditorScopeId,
  type ScriptsTabValue,
} from "./scripts-manager-state";
import {
  DEFAULT_SCRIPT_TARGET_IDS,
  SCRIPT_TRIGGER_IDS,
  STAVE_CONFIG_DIR,
  WORKSPACE_TOOLS_LABEL,
} from "@/lib/workspace-scripts/constants";
import {
  buildScriptConfigFromEditorState,
  buildScriptEditorState,
  createEmptyScriptEditorEntry,
  createEmptyScriptEditorState,
  createEmptyScriptEditorTargetEntry,
  duplicateScriptEditorEntry,
  formatScriptConfigFile,
  mergeScriptConfigIntoRaw,
  shouldAutoSyncScriptId,
  slugifyScriptId,
  validateScriptEditorState,
  type ScriptEditorCandidate,
  type ScriptEditorEntry,
  type ScriptEditorEnvRow,
  type ScriptEditorHookLink,
  type ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import { ScriptsConfigSchema } from "@/lib/workspace-scripts/schemas";
import { useWorkspaceScriptsRuntime } from "@/lib/workspace-scripts";
import type {
  ScriptKind,
  ScriptTargetScope,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
} from "@/lib/workspace-scripts/types";
import { sx } from "@/components/ads/utils/stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { managerStyles } from "./scripts-manager.styles";

export interface ScriptsManagerRuntimeProps {
  workspaceId: string;
  workspaceName: string;
  branch: string;
}

export function ScriptsManager(props: {
  projectPath: string;
  workspacePath: string;
  resolvedConfig: ResolvedWorkspaceScriptsConfig | null;
  onSaved?: () => Promise<void> | void;
  runtime?: ScriptsManagerRuntimeProps;
  hideTitle?: boolean;
}) {
  const scopes = useMemo(
    () =>
      buildEditorScopes({
        projectPath: props.projectPath,
        workspacePath: props.workspacePath,
      }),
    [props.projectPath, props.workspacePath],
  );
  const [selectedScopeId, setSelectedScopeId] =
    useState<ScriptEditorScopeId | null>(null);
  const [initialScopeResolved, setInitialScopeResolved] = useState(false);
  const selectedScope = useMemo(
    () =>
      initialScopeResolved
        ? (scopes.find((scope) => scope.id === selectedScopeId) ??
          scopes[0] ??
          null)
        : null,
    [initialScopeResolved, scopes, selectedScopeId],
  );

  const [fileState, setFileState] = useState<EditorFileState>({
    status: "idle",
    exists: false,
    revision: null,
    rawConfig: null,
    parsedConfig: null,
    error: "",
  });
  const [editorState, setEditorState] = useState<ScriptEditorState>(
    createEmptyScriptEditorState(),
  );
  const [savedContentSnapshot, setSavedContentSnapshot] = useState("");
  const [savedEditorStateSnapshot, setSavedEditorStateSnapshot] = useState(
    snapshotScriptEditorState(createEmptyScriptEditorState()),
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ScriptsTabValue>("services");
  const [expandedEntryKey, setExpandedEntryKey] = useState<string | null>(null);
  const [pendingScopeId, setPendingScopeId] =
    useState<ScriptEditorScopeId | null>(null);
  const loadRequestRef = useRef(0);
  const activeScopeKey = scriptEditorScopeKey(selectedScope);
  const activeScopeKeyRef = useRef(activeScopeKey);

  const runtimeArgs =
    props.runtime && props.projectPath && props.workspacePath
      ? {
          workspaceId: props.runtime.workspaceId,
          projectPath: props.projectPath,
          workspacePath: props.workspacePath,
          workspaceName: props.runtime.workspaceName,
          branch: props.runtime.branch || props.runtime.workspaceName,
        }
      : null;
  const runtime = useWorkspaceScriptsRuntime(runtimeArgs);

  useEffect(() => {
    loadRequestRef.current += 1;
    setInitialScopeResolved(false);
    setSelectedScopeId(null);
  }, [props.projectPath, props.workspacePath]);

  useEffect(() => {
    activeScopeKeyRef.current = activeScopeKey;
    loadRequestRef.current += 1;
  }, [activeScopeKey]);

  useEffect(() => {
    if (!initialScopeResolved) {
      return;
    }
    if (
      !selectedScopeId ||
      !scopes.some((scope) => scope.id === selectedScopeId)
    ) {
      setSelectedScopeId(scopes[0]?.id ?? null);
    }
  }, [initialScopeResolved, scopes, selectedScopeId]);

  useEffect(() => {
    if (initialScopeResolved) {
      return;
    }
    const workspaceScope = scopes.find((scope) => scope.id === "workspace");
    setSelectedScopeId(workspaceScope?.id ?? scopes[0]?.id ?? null);
    setInitialScopeResolved(true);
  }, [initialScopeResolved, scopes]);

  const loadSelectedScope = useCallback(async (scope: ScriptEditorScope) => {
    const requestId = ++loadRequestRef.current;
    const requestedScopeKey = scriptEditorScopeKey(scope);
    const canCommit = () =>
      loadRequestRef.current === requestId &&
      activeScopeKeyRef.current === requestedScopeKey;
    const readFile = window.api?.fs?.readFile;
    if (!readFile) {
      if (!canCommit()) {
        return;
      }
      setFileState({
        status: "error",
        exists: false,
        revision: null,
        rawConfig: null,
        parsedConfig: null,
        error: "Filesystem bridge unavailable.",
      });
      return;
    }

    setFileState((current) => ({
      ...current,
      status: "loading",
      error: "",
    }));

    let result: Awaited<ReturnType<typeof readFile>>;
    try {
      result = await readFile({
        rootPath: scope.rootPath,
        filePath: scope.filePath,
      });
    } catch (error) {
      if (canCommit()) {
        setFileState({
          status: "error",
          exists: false,
          revision: null,
          rawConfig: null,
          parsedConfig: null,
          error: `Failed to read ${scope.filePath}: ${String(error)}`,
        });
      }
      return;
    }
    if (!canCommit()) {
      return;
    }

    if (!result.ok) {
      if (result.stderr?.includes("ENOENT")) {
        const emptyState = createEmptyScriptEditorState();
        const initialContent = formatScriptConfigFile(
          mergeScriptConfigIntoRaw({
            rawConfig: null,
            config: buildScriptConfigFromEditorState(emptyState),
          }),
        );
        setEditorState(emptyState);
        setExpandedEntryKey(null);
        setSavedContentSnapshot(initialContent);
        setSavedEditorStateSnapshot(snapshotScriptEditorState(emptyState));
        setFileState({
          status: "ready",
          exists: false,
          revision: null,
          rawConfig: null,
          parsedConfig: null,
          error: "",
        });
        return;
      }

      setFileState({
        status: "error",
        exists: false,
        revision: null,
        rawConfig: null,
        parsedConfig: null,
        error: result.stderr ?? "Failed to read execution config.",
      });
      return;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(result.content);
    } catch (error) {
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: null,
        parsedConfig: null,
        error: `Invalid JSON in ${scope.filePath}: ${String(error)}`,
      });
      return;
    }

    if (!isPlainRecord(rawJson)) {
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: null,
        parsedConfig: null,
        error: `Expected an object in ${scope.filePath}.`,
      });
      return;
    }

    const parsed = ScriptsConfigSchema.safeParse(rawJson);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: rawJson,
        parsedConfig: null,
        error: `${scope.filePath} is not a valid shared scripts config: ${issue?.message ?? "Unknown error."}`,
      });
      return;
    }

    const nextEditorState = buildScriptEditorState({ config: parsed.data });
    const initialContent = formatScriptConfigFile(
      mergeScriptConfigIntoRaw({
        rawConfig: rawJson,
        config: buildScriptConfigFromEditorState(nextEditorState),
      }),
    );

    setEditorState(nextEditorState);
    setExpandedEntryKey(null);
    setSavedContentSnapshot(initialContent);
    setSavedEditorStateSnapshot(snapshotScriptEditorState(nextEditorState));
    setFileState({
      status: "ready",
      exists: true,
      revision: result.revision,
      rawConfig: rawJson,
      parsedConfig: parsed.data,
      error: "",
    });
  }, []);

  useEffect(() => {
    if (!selectedScope) {
      return;
    }
    void loadSelectedScope(selectedScope);
  }, [loadSelectedScope, selectedScope]);

  const currentConfig = useMemo(
    () => buildScriptConfigFromEditorState(editorState),
    [editorState],
  );
  const currentSaveContent = useMemo(
    () =>
      formatScriptConfigFile(
        mergeScriptConfigIntoRaw({
          rawConfig: fileState.rawConfig,
          config: currentConfig,
        }),
      ),
    [currentConfig, fileState.rawConfig],
  );
  const currentEditorStateSnapshot = useMemo(
    () => snapshotScriptEditorState(editorState),
    [editorState],
  );
  const isDirty =
    fileState.status === "ready" &&
    (currentSaveContent !== savedContentSnapshot ||
      currentEditorStateSnapshot !== savedEditorStateSnapshot);

  const targetOptions = useMemo(
    () => buildEditorTargetOptions(editorState),
    [editorState],
  );

  const hookCandidates = useMemo(
    () => buildEditorHookCandidates(editorState),
    [editorState],
  );

  const unresolvedHookRefs = useMemo(() => {
    return SCRIPT_TRIGGER_IDS.flatMap((trigger) =>
      (editorState.hooks[trigger] ?? [])
        .filter((link) => {
          if (link.scriptKind) {
            return !hookCandidates.some(
              (candidate) =>
                candidate.scriptId === link.scriptId &&
                candidate.scriptKind === link.scriptKind,
            );
          }
          return !hookCandidates.some(
            (candidate) => candidate.scriptId === link.scriptId,
          );
        })
        .map((link) => ({
          trigger,
          link,
        })),
    );
  }, [editorState.hooks, hookCandidates]);

  const usageCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of [...editorState.actions, ...editorState.services]) {
      const targetId = entry.target.trim();
      if (targetId) {
        counts[targetId] = (counts[targetId] ?? 0) + 1;
      }
    }
    return counts;
  }, [editorState.actions, editorState.services]);

  const actionsCount = editorState.actions.length;
  const servicesCount = editorState.services.length;
  const targetsCount = editorState.targets.length;
  const hookLinkCount = SCRIPT_TRIGGER_IDS.reduce(
    (sum, trigger) => sum + (editorState.hooks[trigger]?.length ?? 0),
    0,
  );

  const updateEntryField = useCallback(
    (
      kind: ScriptKind,
      index: number,
      field: keyof ScriptEditorEntry,
      value: string | boolean,
    ) => {
      setEditorState((current) => {
        const collectionKey = kind === "service" ? "services" : "actions";
        const previous = current[collectionKey][index];
        if (!previous) {
          return current;
        }

        const otherIds = [
          ...current.services.map((entry, entryIndex) =>
            kind === "service" && entryIndex === index ? "" : entry.id,
          ),
          ...current.actions.map((entry, entryIndex) =>
            kind === "action" && entryIndex === index ? "" : entry.id,
          ),
        ];

        let nextEntry = { ...previous, [field]: value };
        if (
          field === "label" &&
          typeof value === "string" &&
          shouldAutoSyncScriptId({
            currentId: previous.id,
            currentLabel: previous.label,
            otherIds,
          })
        ) {
          nextEntry = {
            ...nextEntry,
            id: value.trim() ? slugifyScriptId(value, otherIds) : "",
          };
        }

        const previousId = previous.id.trim();
        const nextId = nextEntry.id.trim();
        let nextHooks = current.hooks;
        if (previousId && previousId !== nextId) {
          nextHooks = Object.fromEntries(
            Object.entries(current.hooks).map(([trigger, links]) => [
              trigger,
              (links ?? []).map((link) =>
                link.scriptId === previousId && link.scriptKind === kind
                  ? { ...link, scriptId: nextId }
                  : link,
              ),
            ]),
          ) as ScriptEditorState["hooks"];
        }

        return {
          ...current,
          [collectionKey]: current[collectionKey].map((entry, entryIndex) =>
            entryIndex === index ? nextEntry : entry,
          ),
          hooks: nextHooks,
        };
      });
    },
    [],
  );

  const addEntry = useCallback(
    (kind: ScriptKind) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const newIndex = editorState[collectionKey].length;
      setEditorState((current) => ({
        ...current,
        [collectionKey]: [
          ...current[collectionKey],
          createEmptyScriptEditorEntry(kind),
        ],
      }));
      setActiveTab(kind === "service" ? "services" : "actions");
      setExpandedEntryKey(`${kind}:${newIndex}`);
    },
    [editorState],
  );

  const duplicateEntry = useCallback((kind: ScriptKind, index: number) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const entries = current[collectionKey];
      const source = entries[index];
      if (!source) {
        return current;
      }
      const existingIds = entries.map((entry) => entry.id);
      const copy = duplicateScriptEditorEntry(source, existingIds);
      const nextEntries = [...entries];
      nextEntries.splice(index + 1, 0, copy);
      return {
        ...current,
        [collectionKey]: nextEntries,
      };
    });
    setExpandedEntryKey(`${kind}:${index + 1}`);
  }, []);

  const removeEntry = useCallback((kind: ScriptKind, index: number) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const removedEntry = current[collectionKey][index];
      const nextEntries = current[collectionKey].filter(
        (_, entryIndex) => entryIndex !== index,
      );
      const nextHooks = Object.fromEntries(
        Object.entries(current.hooks)
          .map(([trigger, links]) => [
            trigger,
            removeMatchingHookLinks(links, {
              scriptId: removedEntry?.id.trim() ?? "",
              scriptKind: kind,
            }),
          ])
          .filter(([, links]) => (links as ScriptEditorHookLink[]).length > 0),
      ) as ScriptEditorState["hooks"];

      return {
        ...current,
        [collectionKey]: nextEntries,
        hooks: nextHooks,
      };
    });
    setExpandedEntryKey(null);
  }, []);

  const moveEntry = useCallback(
    (kind: ScriptKind, index: number, direction: -1 | 1) => {
      setEditorState((current) => {
        const collectionKey = kind === "service" ? "services" : "actions";
        const entries = current[collectionKey];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= entries.length) {
          return current;
        }
        const nextEntries = [...entries];
        const [moved] = nextEntries.splice(index, 1);
        if (!moved) {
          return current;
        }
        nextEntries.splice(targetIndex, 0, moved);
        return {
          ...current,
          [collectionKey]: nextEntries,
        };
      });
      setExpandedEntryKey(null);
    },
    [],
  );

  const updateHookLinks = useCallback(
    (trigger: ScriptTrigger, nextLinks: ScriptEditorHookLink[]) => {
      setEditorState((current) => ({
        ...current,
        hooks: {
          ...current.hooks,
          ...(nextLinks.length > 0
            ? { [trigger]: nextLinks }
            : { [trigger]: undefined }),
        },
      }));
    },
    [],
  );

  const toggleHookLink = useCallback(
    (
      trigger: ScriptTrigger,
      candidate: ScriptEditorCandidate,
      enabled: boolean,
    ) => {
      const currentLinks = editorState.hooks[trigger] ?? [];
      if (!enabled) {
        updateHookLinks(
          trigger,
          currentLinks.filter(
            (link) =>
              !(
                link.scriptId === candidate.scriptId &&
                (link.scriptKind === candidate.scriptKind ||
                  link.scriptKind === null)
              ),
          ),
        );
        return;
      }

      if (isHookLinked(currentLinks, candidate)) {
        updateHookLinks(
          trigger,
          currentLinks.map((link) =>
            link.scriptId === candidate.scriptId && link.scriptKind === null
              ? { ...link, scriptKind: candidate.scriptKind }
              : link,
          ),
        );
        return;
      }

      updateHookLinks(trigger, [
        ...currentLinks,
        {
          scriptId: candidate.scriptId,
          scriptKind: candidate.scriptKind,
          blocking: true,
        },
      ]);
    },
    [editorState.hooks, updateHookLinks],
  );

  const toggleHookBlocking = useCallback(
    (
      trigger: ScriptTrigger,
      candidate: ScriptEditorCandidate,
      blocking: boolean,
    ) => {
      updateHookLinks(
        trigger,
        (editorState.hooks[trigger] ?? []).map((link) =>
          link.scriptId === candidate.scriptId &&
          (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
            ? {
                ...link,
                scriptKind: link.scriptKind ?? candidate.scriptKind,
                blocking,
              }
            : link,
        ),
      );
    },
    [editorState.hooks, updateHookLinks],
  );

  // ---- Targets --------------------------------------------------------------
  const addTarget = useCallback(() => {
    setEditorState((current) => ({
      ...current,
      targets: [...current.targets, createEmptyScriptEditorTargetEntry()],
    }));
    setActiveTab("targets");
  }, []);

  const addTargetOverride = useCallback((id: string) => {
    setEditorState((current) => {
      if (current.targets.some((target) => target.id.trim() === id)) {
        return current;
      }
      const cwd: ScriptTargetScope =
        id === DEFAULT_SCRIPT_TARGET_IDS.PROJECT ? "project" : "workspace";
      const label =
        id === DEFAULT_SCRIPT_TARGET_IDS.PROJECT ? "Project" : "Workspace";
      return {
        ...current,
        targets: [
          ...current.targets,
          { id, label, cwd, shell: "", envRows: [] },
        ],
      };
    });
    setActiveTab("targets");
  }, []);

  const updateTargetField = useCallback(
    (index: number, field: "id" | "label" | "shell", value: string) => {
      setEditorState((current) => {
        const nextTargets = current.targets.map((target, targetIndex) =>
          targetIndex === index ? { ...target, [field]: value } : target,
        );

        // Renaming a target id re-points every entry that referenced the old id.
        let nextActions = current.actions;
        let nextServices = current.services;
        if (field === "id") {
          const previousId = current.targets[index]?.id.trim();
          const nextId = value.trim();
          if (previousId && previousId !== nextId && nextId) {
            const repoint = (entries: ScriptEditorEntry[]) =>
              entries.map((entry) =>
                entry.target.trim() === previousId
                  ? { ...entry, target: nextId }
                  : entry,
              );
            nextActions = repoint(current.actions);
            nextServices = repoint(current.services);
          }
        }

        return {
          ...current,
          targets: nextTargets,
          actions: nextActions,
          services: nextServices,
        };
      });
    },
    [],
  );

  const updateTargetCwd = useCallback(
    (index: number, cwd: ScriptTargetScope) => {
      setEditorState((current) => ({
        ...current,
        targets: current.targets.map((target, targetIndex) =>
          targetIndex === index ? { ...target, cwd } : target,
        ),
      }));
    },
    [],
  );

  const updateTargetEnv = useCallback(
    (index: number, rows: ScriptEditorEnvRow[]) => {
      setEditorState((current) => ({
        ...current,
        targets: current.targets.map((target, targetIndex) =>
          targetIndex === index ? { ...target, envRows: rows } : target,
        ),
      }));
    },
    [],
  );

  const removeTarget = useCallback((index: number) => {
    setEditorState((current) => ({
      ...current,
      targets: current.targets.filter(
        (_, targetIndex) => targetIndex !== index,
      ),
    }));
  }, []);

  const reloadSelectedScope = useCallback(async () => {
    if (!selectedScope) {
      return;
    }
    if (isDirty) {
      toast.message("Discard or save changes before reloading this config.");
      return;
    }
    await loadSelectedScope(selectedScope);
  }, [isDirty, loadSelectedScope, selectedScope]);

  const discardChanges = useCallback(async () => {
    if (!selectedScope) {
      return;
    }
    await loadSelectedScope(selectedScope);
  }, [loadSelectedScope, selectedScope]);

  const saveChanges = useCallback(async () => {
    const writeFile = window.api?.fs?.writeFile;
    const createDirectory = window.api?.fs?.createDirectory;
    if (!selectedScope || !writeFile || !createDirectory) {
      toast.error("Filesystem bridge unavailable");
      return false;
    }

    const issues = validateScriptEditorState(editorState);
    if (issues.length > 0) {
      toast.error("Execution config is incomplete", {
        description: issues[0],
      });
      return false;
    }

    const savingScopeKey = scriptEditorScopeKey(selectedScope);
    const scopeIsStillActive = () =>
      activeScopeKeyRef.current === savingScopeKey;
    setSaving(true);
    try {
      const mkdirResult = await createDirectory({
        rootPath: selectedScope.rootPath,
        directoryPath: STAVE_CONFIG_DIR,
      });
      if (!scopeIsStillActive()) {
        return false;
      }
      if (!mkdirResult.ok && !mkdirResult.alreadyExists) {
        toast.error("Failed to prepare .stave directory", {
          description: mkdirResult.stderr ?? "Unknown error",
        });
        return false;
      }

      const result = await writeFile({
        rootPath: selectedScope.rootPath,
        filePath: selectedScope.filePath,
        content: currentSaveContent,
        expectedRevision: fileState.revision,
      });
      if (!scopeIsStillActive()) {
        return false;
      }
      if (!result.ok) {
        toast.error(
          result.conflict
            ? "Execution config changed on disk"
            : "Failed to save execution config",
          {
            description:
              result.stderr ??
              (result.conflict
                ? "Reload the file and re-apply your changes."
                : "Unknown error"),
          },
        );
        return false;
      }

      await loadSelectedScope(selectedScope);
      if (!scopeIsStillActive()) {
        return false;
      }
      await props.onSaved?.();
      toast.success("Execution config saved", {
        description: selectedScope.filePath,
      });
      return true;
    } finally {
      setSaving(false);
    }
  }, [
    currentSaveContent,
    editorState,
    fileState.revision,
    loadSelectedScope,
    props.onSaved,
    selectedScope,
  ]);

  const handleScopeChange = useCallback(
    (value: string) => {
      if (value !== "project" && value !== "workspace") {
        return;
      }
      if (value === selectedScopeId) {
        return;
      }
      if (isDirty) {
        setPendingScopeId(value);
        return;
      }
      setSelectedScopeId(value);
    },
    [isDirty, selectedScopeId],
  );

  const openInRail = useCallback(() => {
    useAppStore.getState().setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: "scripts",
      },
    });
  }, []);

  const confirmSaveAndSwitch = useCallback(async () => {
    const saved = await saveChanges();
    if (saved && pendingScopeId) {
      setSelectedScopeId(pendingScopeId);
      setPendingScopeId(null);
    }
  }, [pendingScopeId, saveChanges]);

  const confirmDiscardAndSwitch = useCallback(async () => {
    await discardChanges();
    if (pendingScopeId) {
      setSelectedScopeId(pendingScopeId);
    }
    setPendingScopeId(null);
  }, [discardChanges, pendingScopeId]);

  if (!selectedScope) {
    if (!initialScopeResolved) {
      return (
        <div className={sx(managerStyles.loadingMuted)}>
          Loading workspace tools…
        </div>
      );
    }

    return (
      <Empty xstyle={managerStyles.emptyState}>
        <EmptyHeader>
          <EmptyMedia>
            <FilePenLine className={sx(managerStyles.emptyIcon)} />
          </EmptyMedia>
          <EmptyTitle>Workspace tools unavailable</EmptyTitle>
          <EmptyDescription>
            Select a workspace to edit its processes and commands.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={sx(managerStyles.root)}>
      {/* ── Header ── */}
      <div className={sx(managerStyles.header)}>
        {props.hideTitle ? (
          <div />
        ) : (
          <div className={sx(managerStyles.titleBlock)}>
            <div className={sx(managerStyles.titleRow)}>
              <p className={sx(managerStyles.titleText)}>
                {WORKSPACE_TOOLS_LABEL}
              </p>
              <Badge
                variant={isDirty ? "secondary" : "outline"}
                className={sx(managerStyles.statusBadge)}
              >
                {isDirty
                  ? "Unsaved"
                  : fileState.exists
                    ? "In sync"
                    : "New file"}
              </Badge>
            </div>
            <p className={sx(managerStyles.subtitle)}>
              Keep a long-running process such as a dev server up while you
              work. Commands are one-shot. Triggers fire on task and pull
              request events.
            </p>
          </div>
        )}
        <div className={sx(managerStyles.headerActions)}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            xstyle={managerStyles.toolbarButton}
            onClick={() => void reloadSelectedScope()}
            disabled={fileState.status === "loading" || saving}
            title="Reload the saved config"
          >
            <RefreshCcw
              className={sx(
                fileState.status === "loading"
                  ? managerStyles.spinnerIconAnimated
                  : managerStyles.spinnerIcon,
              )}
            />
            Reload
          </Button>
        </div>
      </div>

      {/* ── Scope selector ── */}
      <div className={sx(managerStyles.scopeGrid)}>
        <label className={sx(managerStyles.scopeLabel)}>
          <span className={sx(managerStyles.scopeLabelText)}>
            Config Scope
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <AdsButton
                      type="button"
                      layout="host"
                      xstyle={managerStyles.helpTrigger}
                      aria-label="Config scope help"
                    />
                  }
                >
                  <CircleHelp className={sx(managerStyles.helpIcon)} />
                </TooltipTrigger>
                <TooltipContent className={sx(managerStyles.tooltipContent)}>
                  {selectedScope.id === "workspace"
                    ? "Workspace config overrides the project shared config for this workspace."
                    : "Project config is the shared fallback. If a workspace-level config exists, it wins for the active workspace."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <Select value={selectedScope.id} onValueChange={handleScopeChange}>
            <SelectTrigger className={sx(managerStyles.triggerFull)}>
              <SelectValue>{selectedScope.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {scopes.map((scope) => (
                <SelectItem key={scope.id} value={scope.id}>
                  {scope.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className={sx(managerStyles.scopeInfo)}>
          <p className={sx(managerStyles.scopeInfoTitle)}>
            {selectedScope.description}
          </p>
          <p className={sx(managerStyles.scopeInfoPath)}>
            {selectedScope.rootPath}/{selectedScope.filePath}
          </p>
        </div>
      </div>

      {fileState.error ? (
        <div className={sx(managerStyles.errorBox)}>{fileState.error}</div>
      ) : null}

      {fileState.status === "loading" ? (
        <div className={sx(managerStyles.loadingMuted)}>Loading…</div>
      ) : null}

      {fileState.status === "ready" ? (
        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ScriptsTabValue)}
          className={sx(managerStyles.tabsRoot)}
        >
          <TabsList variant="soft" className={sx(managerStyles.tabsList)}>
            <TabsTrigger value="services" className={sx(managerStyles.tab)}>
              Processes
              <Badge variant="outline" className={sx(managerStyles.tabBadge)}>
                {servicesCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="actions" className={sx(managerStyles.tab)}>
              Commands
              <Badge variant="outline" className={sx(managerStyles.tabBadge)}>
                {actionsCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="hooks" className={sx(managerStyles.tab)}>
              Triggers
              <Badge variant="outline" className={sx(managerStyles.tabBadge)}>
                {hookLinkCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="targets" className={sx(managerStyles.tab)}>
              Environments
              <Badge variant="outline" className={sx(managerStyles.tabBadge)}>
                {targetsCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className={sx(managerStyles.tabPanel)}>
            <ScriptEntriesTab
              kind="service"
              entries={editorState.services}
              hooks={editorState.hooks}
              targetOptions={targetOptions}
              expandedEntryKey={expandedEntryKey}
              onExpandedChange={setExpandedEntryKey}
              onFieldChange={(index, field, value) =>
                updateEntryField("service", index, field, value)
              }
              onAdd={() => addEntry("service")}
              onRemove={(index) => removeEntry("service", index)}
              onMove={(index, direction) =>
                moveEntry("service", index, direction)
              }
              onDuplicate={(index) => duplicateEntry("service", index)}
              runStateByKey={runtime.entries}
              onOpenInRail={openInRail}
            />
          </TabsContent>

          <TabsContent value="actions" className={sx(managerStyles.tabPanel)}>
            <ScriptEntriesTab
              kind="action"
              entries={editorState.actions}
              hooks={editorState.hooks}
              targetOptions={targetOptions}
              expandedEntryKey={expandedEntryKey}
              onExpandedChange={setExpandedEntryKey}
              onFieldChange={(index, field, value) =>
                updateEntryField("action", index, field, value)
              }
              onAdd={() => addEntry("action")}
              onRemove={(index) => removeEntry("action", index)}
              onMove={(index, direction) =>
                moveEntry("action", index, direction)
              }
              onDuplicate={(index) => duplicateEntry("action", index)}
              runStateByKey={runtime.entries}
              onOpenInRail={openInRail}
            />
          </TabsContent>

          <TabsContent value="hooks" className={sx(managerStyles.tabPanel)}>
            <ScriptHooksTab
              hooks={editorState.hooks}
              candidates={hookCandidates}
              unresolvedHookRefs={unresolvedHookRefs}
              onToggleLink={toggleHookLink}
              onToggleBlocking={toggleHookBlocking}
            />
          </TabsContent>

          <TabsContent value="targets" className={sx(managerStyles.tabPanel)}>
            <ScriptTargetsTab
              targets={editorState.targets}
              usageCountById={usageCountById}
              onFieldChange={updateTargetField}
              onCwdChange={updateTargetCwd}
              onEnvChange={updateTargetEnv}
              onAdd={addTarget}
              onAddOverride={addTargetOverride}
              onRemove={removeTarget}
            />
          </TabsContent>
        </Tabs>
      ) : null}

      <div className={sx(managerStyles.footer)}>
        <div className={sx(managerStyles.footerStatus)} aria-live="polite">
          <p className={sx(managerStyles.footerStatusTitle)}>
            {saving
              ? "Saving changes…"
              : isDirty
                ? "Unsaved changes"
                : fileState.exists
                  ? "All changes saved"
                  : "No config file yet"}
          </p>
          <p className={sx(managerStyles.footerStatusDetail)}>
            {isDirty
              ? "Edits and deletions are staged until you save this config."
              : `${selectedScope.label} · ${selectedScope.filePath}`}
          </p>
        </div>
        <div className={sx(managerStyles.footerActions)}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            xstyle={managerStyles.toolbarButton}
            onClick={() => void discardChanges()}
            disabled={!isDirty || saving}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            xstyle={managerStyles.toolbarButton}
            onClick={() => void saveChanges()}
            disabled={fileState.status !== "ready" || !isDirty || saving}
          >
            {saving ? (
              <RefreshCcw className={sx(managerStyles.spinnerIconAnimated)} />
            ) : (
              <Save className={sx(managerStyles.spinnerIcon)} />
            )}
            {fileState.exists ? "Save changes" : "Create config"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingScopeId !== null}
        title="Unsaved changes"
        description="Save or discard these edits before switching configs."
        confirmLabel="Discard"
        cancelLabel="Cancel"
        loading={saving}
        onConfirm={() => void confirmDiscardAndSwitch()}
        onCancel={() => setPendingScopeId(null)}
      >
        <Button
          type="button"
          xstyle={managerStyles.fullWidthButton}
          disabled={saving}
          onClick={() => void confirmSaveAndSwitch()}
        >
          Save & switch
        </Button>
      </ConfirmDialog>
    </div>
  );
}
