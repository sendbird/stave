import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { workspaceFsAdapter } from "@/lib/fs";
import type { WorkspaceCreateEntryResult, WorkspaceDeleteEntryResult, WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { parseUnifiedDiffToBuffers } from "@/lib/source-control-diff";
import { hasSourceControlStagedChanges, type SourceControlStatusItem } from "@/lib/source-control-status";
import { useAppStore } from "@/store/app.store";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { RightRailPanelShell } from "./RightRailPanelShell";
import { WorkspaceScriptsPanel } from "./WorkspaceScriptsPanel";
import { WorkspaceSkillsPanel } from "./WorkspaceSkillsPanel";
import { WorkspaceChangesPanel } from "./WorkspaceChangesPanel";
import { WorkspaceExplorerPanel } from "./WorkspaceExplorerPanel";
import { WorkspaceInformationPanel } from "./WorkspaceInformationPanel";
import { WorkspaceLensPanel } from "./WorkspaceLensPanel";
import { EXPLORER_SEARCH_REQUEST_EVENT } from "./explorer-search-events";
import {
  buildSourceControlSections,
  buildSourceControlSummary,
  getExplorerExpandedPathsAfterCreate,
  normalizeRelativeInputPath,
  type SourceControlItemViewModel,
} from "./editor-panel.utils";

interface SourceControlHistoryItem {
  hash: string;
  relativeDate: string;
  subject: string;
}

interface ExplorerDirectoryState {
  entries: WorkspaceDirectoryEntry[];
  status: "loading" | "ready" | "error";
  error?: string;
}

type PendingExplorerCreate =
  | { type: "file"; placeholder: string }
  | { type: "folder"; placeholder: string };

interface PendingExplorerDelete {
  type: "file" | "folder";
  path: string;
  name: string;
  affectedTabIds: string[];
  dirtyTabCount: number;
}

interface EditorPanelProps {
  onOpenSettings?: (options?: {
    projectPath?: string | null;
    section?: SectionId;
  }) => void;
  lensOccluded?: boolean;
}

function getParentDirectoryPath(args: { path: string }) {
  return args.path.split("/").slice(0, -1).join("/");
}

function isAffectedByExplorerDelete(args: {
  candidatePath: string;
  targetPath: string;
  targetType: "file" | "folder";
}) {
  return args.targetType === "file"
    ? args.candidatePath === args.targetPath
    : args.candidatePath === args.targetPath || args.candidatePath.startsWith(`${args.targetPath}/`);
}

function resolveWorkspaceAbsolutePath(args: { workspacePath?: string; relativePath: string }) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return null;
  }

  const normalizedWorkspacePath = workspacePath.replace(/[\\/]+$/, "") || workspacePath;
  const normalizedRelativePath = args.relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");

  if (!normalizedRelativePath) {
    return normalizedWorkspacePath;
  }

  const separator = normalizedWorkspacePath.includes("\\") ? "\\" : "/";
  const joinedRelativePath = normalizedRelativePath.split("/").filter(Boolean).join(separator);
  return `${normalizedWorkspacePath}${separator}${joinedRelativePath}`;
}

export function EditorPanel(props: EditorPanelProps) {
  const [
    activeWorkspaceId,
    hasHydratedWorkspaces,
    projectName,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    workspaceCwd,
    scmAutoRefreshSeconds,
    openFileFromTree,
    openDiffInEditor,
    setLayout,
    refreshProjectFiles,
    closeEditorTab,
    updateSettings,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.hasHydratedWorkspaces,
    state.projectName,
    state.layout.sidebarOverlayVisible,
    state.layout.sidebarOverlayTab,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined,
    state.settings.scmAutoRefreshSeconds,
    state.openFileFromTree,
    state.openDiffInEditor,
    state.setLayout,
    state.refreshProjectFiles,
    state.closeEditorTab,
    state.updateSettings,
  ] as const));

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [explorerDirectoryStateByPath, setExplorerDirectoryStateByPath] = useState<Record<string, ExplorerDirectoryState>>({});
  const [explorerError, setExplorerError] = useState("");
  const [pendingExplorerCreate, setPendingExplorerCreate] = useState<PendingExplorerCreate | null>(null);
  const [pendingExplorerDelete, setPendingExplorerDelete] = useState<PendingExplorerDelete | null>(null);
  const [pendingExplorerCreatePath, setPendingExplorerCreatePath] = useState("");
  const [isCreatingExplorerEntry, setIsCreatingExplorerEntry] = useState(false);
  const [isDeletingExplorerEntry, setIsDeletingExplorerEntry] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [explorerSearchRequestNonce, setExplorerSearchRequestNonce] = useState(0);

  const [sourceBranch, setSourceBranch] = useState("unknown");
  const [sourceItems, setSourceItems] = useState<SourceControlStatusItem[]>([]);
  const [sourceHistory, setSourceHistory] = useState<SourceControlHistoryItem[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [hasConflicts, setHasConflicts] = useState(false);
  const [isScmBusy, setIsScmBusy] = useState(false);
  const explorerDirectoryStateRef = useRef<Record<string, ExplorerDirectoryState>>({});
  const explorerRequestTokenRef = useRef(0);
  const selectedDiffRequestIdRef = useRef(0);
  const pendingExplorerCreateInputRef = useRef<HTMLInputElement | null>(null);

  const explorerRootState = explorerDirectoryStateByPath[""];
  const explorerTree = explorerRootState?.entries ?? [];
  const isExplorerLoading = explorerRootState?.status === "loading";
  const filteredScmItems = sourceItems;
  const sourceControlSections = useMemo(
    () => buildSourceControlSections({ items: filteredScmItems }),
    [filteredScmItems],
  );
  const sourceControlSummary = useMemo(
    () => buildSourceControlSummary({ items: filteredScmItems }),
    [filteredScmItems],
  );
  const canCommitStagedChanges = sourceControlSummary.committableCount > 0 && !hasConflicts;
  const canUnstageAnyChanges = sourceControlSummary.stagedCount > 0;
  const sourceControlHint = hasConflicts
    ? "Resolve or discard conflicted files before treating the tree as clean."
    : canCommitStagedChanges && sourceControlSummary.workingTreeCount > 0
      ? "Commit will include staged changes only. Working-tree edits remain local."
      : canCommitStagedChanges
        ? "Staged changes are ready to commit."
        : filteredScmItems.length > 0
      ? "Stage files to prepare the next commit."
      : "Working tree is clean.";
  const explorerProjectName = projectName?.trim() || "Project";
  const rightTab = sidebarOverlayTab;

  function updateExplorerDirectoryState(
    updater: Record<string, ExplorerDirectoryState> | ((current: Record<string, ExplorerDirectoryState>) => Record<string, ExplorerDirectoryState>),
  ) {
    setExplorerDirectoryStateByPath((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      explorerDirectoryStateRef.current = next;
      return next;
    });
  }

  async function loadExplorerDirectory(args: { directoryPath: string; force?: boolean }) {
    if (!workspaceCwd) {
      setExplorerError("Workspace path unavailable.");
      return null;
    }

    const cached = explorerDirectoryStateRef.current[args.directoryPath];
    if (!args.force && cached) {
      if (cached.status === "ready" || cached.status === "loading") {
        return cached.entries;
      }
    }

    const requestToken = explorerRequestTokenRef.current;
    updateExplorerDirectoryState((current) => ({
      ...current,
      [args.directoryPath]: {
        entries: cached?.entries ?? [],
        status: "loading",
      },
    }));

    const entries = await workspaceFsAdapter.listDirectory({ directoryPath: args.directoryPath });
    if (explorerRequestTokenRef.current !== requestToken) {
      return null;
    }
    if (!entries) {
      updateExplorerDirectoryState((current) => ({
        ...current,
        [args.directoryPath]: {
          entries: cached?.entries ?? [],
          status: "error",
          error: "Failed to load folder.",
        },
      }));
      if (args.directoryPath === "") {
        setExplorerError("Failed to load explorer contents.");
      }
      return null;
    }

    updateExplorerDirectoryState((current) => ({
      ...current,
      [args.directoryPath]: {
        entries,
        status: "ready",
      },
    }));
    if (args.directoryPath === "") {
      setExplorerError("");
    }
    return entries;
  }

  async function reloadExplorer(args?: { expandedPaths?: Iterable<string> }) {
    const nextExpandedPaths = Array.from(new Set(
      Array.from(args?.expandedPaths ?? expandedFolders).filter((path) => path.length > 0),
    ));
    explorerRequestTokenRef.current += 1;
    explorerDirectoryStateRef.current = {};
    setExplorerDirectoryStateByPath({});
    setExplorerError("");
    setExpandedFolders(new Set(nextExpandedPaths));

    const rootEntries = await loadExplorerDirectory({ directoryPath: "", force: true });
    if (!rootEntries) {
      return;
    }

    for (const directoryPath of nextExpandedPaths) {
      await loadExplorerDirectory({ directoryPath, force: true });
    }
  }

  useEffect(() => {
    explorerRequestTokenRef.current += 1;
    explorerDirectoryStateRef.current = {};
    setExplorerDirectoryStateByPath({});
    setExpandedFolders(new Set());
    setExplorerError("");
    setPendingExplorerCreate(null);
    setPendingExplorerDelete(null);
    setPendingExplorerCreatePath("");
    setIsCreatingExplorerEntry(false);
    setIsDeletingExplorerEntry(false);
  }, [activeWorkspaceId, workspaceCwd]);

  useEffect(() => {
    if (!hasHydratedWorkspaces || !workspaceCwd || !sidebarOverlayVisible || rightTab !== "explorer") {
      return;
    }
    if (explorerDirectoryStateRef.current[""]) {
      return;
    }
    void loadExplorerDirectory({ directoryPath: "" });
  }, [activeWorkspaceId, hasHydratedWorkspaces, rightTab, sidebarOverlayVisible, workspaceCwd]);

  useEffect(() => {
    if (!pendingExplorerCreate) {
      return;
    }

    const timer = window.setTimeout(() => {
      const input = pendingExplorerCreateInputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pendingExplorerCreate]);

  useEffect(() => {
    const handleExplorerSearchRequest = () => {
      setExplorerSearchRequestNonce((current) => current + 1);
    };

    window.addEventListener(EXPLORER_SEARCH_REQUEST_EVENT, handleExplorerSearchRequest);
    return () => {
      window.removeEventListener(EXPLORER_SEARCH_REQUEST_EVENT, handleExplorerSearchRequest);
    };
  }, []);

  async function loadScmStatus(args?: { skipBusyState?: boolean }) {
    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      setSourceError("Source Control bridge unavailable. Use bun run dev:all or bun run dev:desktop.");
      return;
    }

    const getHistory = window.api?.sourceControl?.getHistory;
    if (!args?.skipBusyState) {
      setIsScmBusy(true);
    }

    try {
      const [statusResult, historyResult] = await Promise.all([
        getStatus({ cwd: workspaceCwd }),
        getHistory ? getHistory({ cwd: workspaceCwd, limit: 15 }) : Promise.resolve(null),
      ]);

      setSourceBranch(statusResult.branch);
      setSourceItems(statusResult.items);
      setHasConflicts(statusResult.hasConflicts);
      setSourceError(statusResult.ok ? "" : statusResult.stderr || "git status failed");

      if (historyResult?.ok) {
        setSourceHistory(historyResult.items);
      }
    } finally {
      if (!args?.skipBusyState) {
        setIsScmBusy(false);
      }
    }
  }

  useEffect(() => {
    if (rightTab === "changes" && sidebarOverlayVisible) {
      void loadScmStatus();
    }
  }, [rightTab, sidebarOverlayVisible, workspaceCwd]);

  const loadScmStatusRef = useRef(loadScmStatus);
  loadScmStatusRef.current = loadScmStatus;
  const isScmBusyRef = useRef(isScmBusy);
  isScmBusyRef.current = isScmBusy;

  useEffect(() => {
    if (scmAutoRefreshSeconds <= 0) return;
    if (rightTab !== "changes" || !sidebarOverlayVisible) return;
    if (!workspaceCwd) return;

    const intervalId = window.setInterval(() => {
      if (isScmBusyRef.current) return;
      if (document.visibilityState === "hidden") return;
      void loadScmStatusRef.current({ skipBusyState: true });
    }, scmAutoRefreshSeconds * 1000);

    return () => window.clearInterval(intervalId);
  }, [scmAutoRefreshSeconds, rightTab, sidebarOverlayVisible, workspaceCwd]);

  async function handleStageAll() {
    const stageAll = window.api?.sourceControl?.stageAll;
    if (!stageAll) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await stageAll({ cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git add failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleUnstageAll() {
    const unstageAll = window.api?.sourceControl?.unstageAll;
    if (!unstageAll) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await unstageAll({ cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git restore --staged failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleCommit() {
    const commit = window.api?.sourceControl?.commit;
    if (!commit) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }
    if (hasConflicts) {
      setSourceError("Resolve or discard conflicted files before committing.");
      return;
    }
    if (!canCommitStagedChanges) {
      setSourceError("Stage at least one change before committing.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await commit({ message: commitMessage, cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git commit failed");
      } else {
        setCommitMessage("");
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleStageAction(args: {
    action: "stage" | "toggle" | "unstage";
    item: SourceControlStatusItem;
  }) {
    const isStaged = hasSourceControlStagedChanges({ item: args.item });
    const stageFile = window.api?.sourceControl?.stageFile;
    const unstageFile = window.api?.sourceControl?.unstageFile;
    if (!stageFile || !unstageFile) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const nextAction = args.action === "toggle"
        ? (isStaged ? "unstage" : "stage")
        : args.action;
      const result = nextAction === "unstage"
        ? await unstageFile({ path: args.item.path, cwd: workspaceCwd })
        : await stageFile({ path: args.item.path, cwd: workspaceCwd });

      if (!result.ok) {
        setSourceError(result.stderr || "git stage toggle failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleDiscardChange(args: { item: SourceControlStatusItem }) {
    const discardFile = window.api?.sourceControl?.discardFile;
    if (!discardFile) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await discardFile({ path: args.item.path, cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git discard failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleSelectDiff(args: { path: string }) {
    const getDiff = window.api?.sourceControl?.getDiff;
    const requestId = selectedDiffRequestIdRef.current + 1;
    selectedDiffRequestIdRef.current = requestId;
    if (!getDiff) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    const result = await getDiff({ path: args.path, cwd: workspaceCwd });
    if (selectedDiffRequestIdRef.current !== requestId) {
      return;
    }
    const parsed = result.oldContent != null && result.newContent != null
      ? {
          oldContent: result.oldContent,
          newContent: result.newContent,
        }
      : parseUnifiedDiffToBuffers({ patch: result.content });
    openDiffInEditor({
      editorTabId: `scm-diff:${args.path}`,
      filePath: args.path,
      oldContent: parsed.oldContent,
      newContent: parsed.newContent,
    });
    setLayout({ patch: { editorVisible: true } });
    if (!result.ok && result.stderr) {
      setSourceError(result.stderr);
    }
  }

  function handleOpenExplorerFile(filePath: string, line?: number) {
    void openFileFromTree({ filePath, line });
    setLayout({ patch: { editorVisible: true } });
  }

  function handleToggleExplorerFolder(path: string) {
    const isOpen = expandedFolders.has(path);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    if (!isOpen) {
      void loadExplorerDirectory({ directoryPath: path });
    }
  }

  async function handleCopyExplorerPath(args: { path: string; mode: "relative" | "absolute" }) {
    const pathToCopy = args.mode === "absolute"
      ? resolveWorkspaceAbsolutePath({ workspacePath: workspaceCwd, relativePath: args.path })
      : args.path;
    if (!pathToCopy) {
      toast.error("Workspace path unavailable");
      return;
    }

    try {
      await copyTextToClipboard(pathToCopy);
      toast.success(args.mode === "absolute" ? "Copied absolute path" : "Copied relative path");
    } catch {
      toast.error("Failed to copy path");
    }
  }

  async function handleCopySourceControlPath(path: string) {
    try {
      await copyTextToClipboard(path);
      toast.success("Copied relative path");
    } catch {
      toast.error("Failed to copy path");
    }
  }

  async function handleOpenExplorerPath(args: { path: string; target: "finder" | "vscode" | "terminal" | "ghostty" }) {
    const shellApi = window.api?.shell;
    if (!shellApi) {
      toast.error("Shell bridge unavailable");
      return;
    }

    const absolutePath = resolveWorkspaceAbsolutePath({ workspacePath: workspaceCwd, relativePath: args.path });
    if (!absolutePath) {
      toast.error("Workspace path unavailable");
      return;
    }

    const action = args.target === "finder"
      ? shellApi.showInFinder
      : args.target === "vscode"
      ? shellApi.openInVSCode
      : args.target === "ghostty"
      ? shellApi.openInGhostty
      : shellApi.openInTerminal;
    if (!action) {
      toast.error("Shell action unavailable");
      return;
    }

    const result = await action({ path: absolutePath });
    if (result.ok) {
      return;
    }

    const actionLabel = args.target === "finder"
      ? "open in Finder"
      : args.target === "vscode"
      ? "open in VS Code"
      : args.target === "ghostty"
      ? "open in Ghostty"
      : "open in Terminal";
    toast.error(`Failed to ${actionLabel}`, { description: result.stderr });
  }

  function handleRefreshExplorerDirectory(path: string) {
    void loadExplorerDirectory({ directoryPath: path, force: true });
  }

  async function handleExpandAllFolders() {
    if (!workspaceCwd) {
      setExplorerError("Workspace path unavailable.");
      return;
    }

    const nextExpandedFolders = new Set<string>();

    async function walk(directoryPath: string) {
      const entries = await loadExplorerDirectory({ directoryPath });
      if (!entries) {
        return;
      }

      for (const entry of entries) {
        if (entry.type !== "folder") {
          continue;
        }
        nextExpandedFolders.add(entry.path);
        await walk(entry.path);
      }
    }

    await walk("");
    setExpandedFolders(nextExpandedFolders);
  }

  async function runExplorerCreateOperation(args: {
    execute: () => Promise<WorkspaceCreateEntryResult>;
    fallbackError: string;
  }) {
    let result = await args.execute();

    if (!result.ok && !result.alreadyExists && workspaceCwd) {
      await workspaceFsAdapter.setRoot?.({
        rootPath: workspaceCwd,
        rootName: explorerProjectName,
        files: workspaceFsAdapter.getKnownFiles(),
      });
      result = await args.execute();
    }

    if (!result.ok && !result.alreadyExists) {
      setExplorerError(result.stderr || args.fallbackError);
      return null;
    }

    setExplorerError("");
    return result;
  }

  async function runExplorerDeleteOperation(args: {
    execute: () => Promise<WorkspaceDeleteEntryResult>;
    fallbackError: string;
  }) {
    let result = await args.execute();

    if (!result.ok && workspaceCwd) {
      await workspaceFsAdapter.setRoot?.({
        rootPath: workspaceCwd,
        rootName: explorerProjectName,
        files: workspaceFsAdapter.getKnownFiles(),
      });
      result = await args.execute();
    }

    if (!result.ok) {
      const message = result.stderr || args.fallbackError;
      setExplorerError(message);
      toast.error(args.fallbackError, { description: message });
      return null;
    }

    setExplorerError("");
    return result;
  }

  function startExplorerCreate(type: PendingExplorerCreate["type"], directoryPath = "") {
    setExplorerError("");
    const normalizedDirectoryPath = normalizeRelativeInputPath({ value: directoryPath }) ?? "";
    const pathPrefix = normalizedDirectoryPath ? `${normalizedDirectoryPath}/` : "";
    const suggestedLeafPath = type === "file" ? "new-file.tsx" : "new-folder";
    setPendingExplorerCreate({
      type,
      placeholder: `${pathPrefix}${suggestedLeafPath}`,
    });
    setPendingExplorerCreatePath(pathPrefix);
  }

  function handleStartExplorerFileCreate(directoryPath: string) {
    startExplorerCreate("file", directoryPath);
  }

  function handleStartExplorerFolderCreate(directoryPath: string) {
    startExplorerCreate("folder", directoryPath);
  }

  function handleCopyExplorerRelativePath(path: string) {
    void handleCopyExplorerPath({ path, mode: "relative" });
  }

  function handleCopyExplorerAbsolutePath(path: string) {
    void handleCopyExplorerPath({ path, mode: "absolute" });
  }

  function handleOpenExplorerInFinder(path: string) {
    void handleOpenExplorerPath({ path, target: "finder" });
  }

  function handleOpenExplorerInVSCode(path: string) {
    void handleOpenExplorerPath({ path, target: "vscode" });
  }

  function handleOpenExplorerInTerminal(path: string) {
    void handleOpenExplorerPath({ path, target: "terminal" });
  }

  function handleOpenExplorerInGhostty(path: string) {
    void handleOpenExplorerPath({ path, target: "ghostty" });
  }

  function cancelExplorerCreate() {
    if (isCreatingExplorerEntry) {
      return;
    }

    setPendingExplorerCreate(null);
    setPendingExplorerCreatePath("");
  }

  function requestExplorerDelete(args: Omit<PendingExplorerDelete, "affectedTabIds" | "dirtyTabCount">) {
    const affectedTabs = useAppStore.getState().editorTabs.filter((tab) => isAffectedByExplorerDelete({
      candidatePath: tab.filePath,
      targetPath: args.path,
      targetType: args.type,
    }));
    setExplorerError("");
    setPendingExplorerDelete({
      ...args,
      affectedTabIds: affectedTabs.map((tab) => tab.id),
      dirtyTabCount: affectedTabs.filter((tab) => tab.isDirty).length,
    });
  }

  function handleRequestDeleteExplorerFile(path: string, name: string) {
    requestExplorerDelete({ type: "file", path, name });
  }

  function handleRequestDeleteExplorerFolder(path: string, name: string) {
    requestExplorerDelete({ type: "folder", path, name });
  }

  function cancelExplorerDelete() {
    if (isDeletingExplorerEntry) {
      return;
    }

    setPendingExplorerDelete(null);
  }

  async function confirmExplorerDelete() {
    if (!pendingExplorerDelete || isDeletingExplorerEntry) {
      return;
    }

    const deleteRequest = pendingExplorerDelete;
    const nextExpandedPaths = deleteRequest.type === "folder"
      ? [...expandedFolders].filter((path) => !isAffectedByExplorerDelete({
        candidatePath: path,
        targetPath: deleteRequest.path,
        targetType: "folder",
      }))
      : [...expandedFolders];

    setIsDeletingExplorerEntry(true);
    try {
      const result = await runExplorerDeleteOperation({
        execute: () => (
          deleteRequest.type === "file"
            ? workspaceFsAdapter.deleteFile({ filePath: deleteRequest.path })
            : workspaceFsAdapter.deleteDirectory({ directoryPath: deleteRequest.path })
        ),
        fallbackError: deleteRequest.type === "file"
          ? "Failed to delete file."
          : "Failed to delete folder.",
      });
      if (!result) {
        setPendingExplorerDelete(null);
        return;
      }

      setPendingExplorerDelete(null);

      for (const tabId of deleteRequest.affectedTabIds) {
        closeEditorTab({ tabId });
      }

      await Promise.all([
        refreshProjectFiles(),
        reloadExplorer({ expandedPaths: nextExpandedPaths }),
      ]);

      toast.success(deleteRequest.type === "file" ? "Deleted file" : "Deleted folder", {
        description: deleteRequest.path,
      });
    } finally {
      setIsDeletingExplorerEntry(false);
    }
  }

  async function submitExplorerCreate() {
    if (!pendingExplorerCreate || isCreatingExplorerEntry) {
      return;
    }

    const entryPath = normalizeRelativeInputPath({ value: pendingExplorerCreatePath });
    if (!entryPath) {
      setExplorerError(`Enter a valid relative ${pendingExplorerCreate.type} path.`);
      return;
    }

    setIsCreatingExplorerEntry(true);
    try {
      const result = await runExplorerCreateOperation({
        execute: () => (
          pendingExplorerCreate.type === "file"
            ? workspaceFsAdapter.createFile({ filePath: entryPath })
            : workspaceFsAdapter.createDirectory({ directoryPath: entryPath })
        ),
        fallbackError: pendingExplorerCreate.type === "file"
          ? "Failed to create file."
          : "Failed to create folder.",
      });
      if (!result) {
        return;
      }

      const nextExpandedFolders = new Set(expandedFolders);
      for (const folder of getExplorerExpandedPathsAfterCreate({
        path: entryPath,
        type: pendingExplorerCreate.type,
      })) {
        nextExpandedFolders.add(folder);
      }

      setPendingExplorerCreate(null);
      setPendingExplorerCreatePath("");

      await Promise.all([
        refreshProjectFiles(),
        reloadExplorer({ expandedPaths: nextExpandedFolders }),
      ]);

      if (pendingExplorerCreate.type === "file") {
        handleOpenExplorerFile(entryPath);
      }
    } finally {
      setIsCreatingExplorerEntry(false);
    }
  }

  return (
    <aside
      data-testid="editor-panel"
      className="h-full min-w-0 w-full overflow-hidden"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
        <RightRailPanelShell panelId={rightTab}>
          {rightTab === "explorer" ? (
            <WorkspaceExplorerPanel
              projectName={explorerProjectName}
              explorerError={explorerError}
              pendingExplorerCreate={pendingExplorerCreate}
              pendingExplorerCreateInputRef={pendingExplorerCreateInputRef}
              pendingExplorerCreatePath={pendingExplorerCreatePath}
              onPendingExplorerCreatePathChange={setPendingExplorerCreatePath}
              isCreatingExplorerEntry={isCreatingExplorerEntry}
              onStartExplorerCreate={startExplorerCreate}
              onCancelExplorerCreate={cancelExplorerCreate}
              onSubmitExplorerCreate={submitExplorerCreate}
              isExplorerLoading={isExplorerLoading}
              explorerTree={explorerTree}
              expandedFolders={expandedFolders}
              onCollapseAllFolders={() => setExpandedFolders(new Set())}
              onExpandAllFolders={handleExpandAllFolders}
              explorerDirectoryStateByPath={explorerDirectoryStateByPath}
              onToggleExplorerFolder={handleToggleExplorerFolder}
              onOpenExplorerFile={handleOpenExplorerFile}
              onStartExplorerFileCreate={handleStartExplorerFileCreate}
              onStartExplorerFolderCreate={handleStartExplorerFolderCreate}
              onCopyExplorerRelativePath={handleCopyExplorerRelativePath}
              onCopyExplorerAbsolutePath={handleCopyExplorerAbsolutePath}
              onOpenExplorerInFinder={handleOpenExplorerInFinder}
              onOpenExplorerInVSCode={handleOpenExplorerInVSCode}
              onOpenExplorerInTerminal={handleOpenExplorerInTerminal}
              onOpenExplorerInGhostty={handleOpenExplorerInGhostty}
              onRefreshExplorerDirectory={handleRefreshExplorerDirectory}
              onRequestDeleteExplorerFile={handleRequestDeleteExplorerFile}
              onRequestDeleteExplorerFolder={handleRequestDeleteExplorerFolder}
              searchRequestNonce={explorerSearchRequestNonce}
              workspaceCwd={workspaceCwd}
            />
          ) : null}

          {rightTab === "changes" ? (
            <WorkspaceChangesPanel
              sourceBranch={sourceBranch}
              filteredScmItems={filteredScmItems}
              sourceControlSummary={sourceControlSummary}
              sourceControlHint={sourceControlHint}
              isScmBusy={isScmBusy}
              commitMessage={commitMessage}
              onCommitMessageChange={setCommitMessage}
              canCommitStagedChanges={canCommitStagedChanges}
              canUnstageAnyChanges={canUnstageAnyChanges}
              onCommit={handleCommit}
              onStageAll={handleStageAll}
              onUnstageAll={handleUnstageAll}
              hasConflicts={hasConflicts}
              sourceError={sourceError}
              sourceControlSections={sourceControlSections}
              onCopySourceControlPath={handleCopySourceControlPath}
              onSelectDiff={(path) => handleSelectDiff({ path })}
              onStageAction={handleStageAction}
              onDiscardChange={(item) => handleDiscardChange({ item })}
              sourceHistory={sourceHistory}
              onRefresh={() => loadScmStatus()}
              autoRefreshSeconds={scmAutoRefreshSeconds}
              onAutoRefreshSecondsChange={(seconds) => updateSettings({ patch: { scmAutoRefreshSeconds: seconds } })}
            />
          ) : null}

          {rightTab === "information" ? <WorkspaceInformationPanel /> : null}
          {rightTab === "skills" ? (
            <WorkspaceSkillsPanel onOpenSettings={props.onOpenSettings} />
          ) : null}
          {rightTab === "scripts" ? (
            <WorkspaceScriptsPanel onOpenSettings={props.onOpenSettings} />
          ) : null}
          {rightTab === "lens" ? (
            <WorkspaceLensPanel occluded={props.lensOccluded} />
          ) : null}
        </RightRailPanelShell>
      </div>
      <ConfirmDialog
        open={Boolean(pendingExplorerDelete)}
        title={pendingExplorerDelete?.type === "folder" ? "Delete Folder" : "Delete File"}
        description={pendingExplorerDelete
          ? [
              pendingExplorerDelete.type === "folder"
                ? `Delete "${pendingExplorerDelete.name}" and all of its contents from disk?`
                : `Delete "${pendingExplorerDelete.name}" from disk?`,
              pendingExplorerDelete.affectedTabIds.length > 0
                ? pendingExplorerDelete.dirtyTabCount > 0
                  ? `${pendingExplorerDelete.affectedTabIds.length} open tab(s) will be closed, including ${pendingExplorerDelete.dirtyTabCount} with unsaved changes.`
                  : `${pendingExplorerDelete.affectedTabIds.length} open tab(s) will be closed.`
                : null,
            ].filter(Boolean).join(" ")
          : ""
        }
        confirmLabel={pendingExplorerDelete?.type === "folder" ? "Delete Folder" : "Delete File"}
        loading={isDeletingExplorerEntry}
        onCancel={cancelExplorerDelete}
        onConfirm={() => {
          void confirmExplorerDelete();
        }}
      />
    </aside>
  );
}
