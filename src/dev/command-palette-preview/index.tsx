import { applyAppLocale } from "@/i18n";
import { useLayoutEffect, useMemo, useState } from "react";
import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";
import type {
  CommandPaletteCommandHandlers,
  CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";
import { normalizeAppShortcutKeys } from "@/lib/app-shortcuts";
import { useAppStore } from "@/store/app.store";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import type { SearchTasksArgs, SearchTasksResponse, TaskSearchResult } from "@/lib/task-search/task-search-ipc";

/**
 * The global command palette on the dev preview (`?stavePreview=command-palette`),
 * open, with a small workspace and a stubbed search across repositories.
 * Choose **All repositories** to see tasks from workspaces never opened.
 * `theme=` and `lang=` as in the other previews. `searchDelay=<ms>` holds each
 * search response that long, so a test can type while an older result list
 * is still on screen. What the palette runs is recorded on
 * `window.__stavePalettePreview` for the end-to-end tests.
 */
const params = new URLSearchParams(window.location.search);
const SEARCH_DELAY_MS = Number(params.get("searchDelay")) || 0;

interface PalettePreviewProbe {
  openedTasks: string[];
  settings: () => { customThemeId: string | null; themeMode: string };
}
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const RESULTS: TaskSearchResult[] = [
  {
    repositoryPath: "/tmp/preview/shop", repositoryName: "shop", workspaceId: "ws-search", workspaceName: "search",
    workspaceBranch: "feat/search", workspacePath: "/tmp/preview/shop/.stave/workspaces/search", isDefaultWorkspace: false,
    taskId: "t2", title: "Fix the login redirect", provider: "codex", updatedAt: hoursAgo(2), state: "running",
  },
  {
    repositoryPath: "/tmp/preview/shop", repositoryName: "shop", workspaceId: "ws-shop", workspaceName: "Default Workspace",
    workspaceBranch: "main", workspacePath: "/tmp/preview/shop", isDefaultWorkspace: true,
    taskId: "t1", title: "Fix the login redirect", provider: "claude-code", updatedAt: hoursAgo(26), state: "failed",
  },
  {
    repositoryPath: "/tmp/preview/docs", repositoryName: "docs", workspaceId: "ws-docs", workspaceName: "Default Workspace",
    workspaceBranch: "main", workspacePath: "/tmp/preview/docs", isDefaultWorkspace: true,
    taskId: "t4", title: "Write the login guide", provider: "claude-code", updatedAt: hoursAgo(72), state: "completed",
  },
];

function installSearchStub() {
  const api = ((window as unknown as { api?: Record<string, unknown> }).api ??= {});
  const persistence = ((api.persistence as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  persistence.searchTasks = async (args: SearchTasksArgs): Promise<SearchTasksResponse> => {
    if (SEARCH_DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS));
    const words = args.query.toLowerCase().split(/\s+/).filter(Boolean);
    return {
      ok: true,
      results: RESULTS.filter((result) =>
        words.every((word) => `${result.title} ${result.workspaceName} ${result.workspaceBranch} ${result.repositoryName}`.toLowerCase().includes(word)),
      ),
    };
  };
  api.persistence = persistence;
}

const noop = () => {};
const COMMANDS = new Proxy({}, { get: () => noop }) as CommandPaletteCommandHandlers;

function previewContext(): CommandPaletteRuntimeContext {
  return {
    activeEditorTabId: null,
    activeTaskId: "t-local",
    activeWorkspaceBranch: "main",
    activeWorkspaceIsDefault: true,
    activeWorkspacePrStatus: "no_pr",
    appShortcutKeys: normalizeAppShortcutKeys(),
    hasActiveTurn: false,
    layout: { sidebarOverlayTab: "explorer", sidebarOverlayVisible: false, workspaceSidebarCollapsed: false },
    modifierLabel: "Cmd",
    preferences: { hiddenIds: [], pinnedIds: [], recentIds: [], showRecent: true },
    repositoryPath: "/tmp/preview/shop",
    repositories: [{ isCurrent: true, repositoryName: "shop", repositoryPath: "/tmp/preview/shop" }],
    tasks: [{ id: "t-local", isActive: true, isResponding: false, provider: "claude-code", title: "Tidy the checkout page" }],
    workspacePath: "/tmp/preview/shop",
    workspaces: [{ id: "ws-shop", isActive: true, isDefault: true, name: "Default Workspace", branch: "main", path: "/tmp/preview/shop" }],
    commands: COMMANDS,
  };
}

export function CommandPalettePreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const [ready, setReady] = useState(false);
  const context = useMemo(previewContext, []);
  useLayoutEffect(() => {
    applyAppLocale(params.get("lang") ?? "en");
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
    installSearchStub();
    const probe: PalettePreviewProbe = {
      openedTasks: [],
      settings: () => {
        const { customThemeId, themeMode } = useAppStore.getState().settings;
        return { customThemeId, themeMode };
      },
    };
    (window as unknown as { __stavePalettePreview?: PalettePreviewProbe }).__stavePalettePreview = probe;
    // Opening a result records it instead of switching repositories.
    useAppStore.setState({
      focusTaskAttention: async ({ taskId }) => {
        probe.openedTasks.push(taskId);
      },
    } as Partial<ReturnType<typeof useAppStore.getState>>);
    setReady(true);
  }, [theme, builtinTheme]);
  return ready ? <GlobalCommandPalette open onOpenChange={() => {}} runtimeContext={context} /> : null;
}
