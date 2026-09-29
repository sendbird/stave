import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { AgentsTab } from "@/components/agents/AgentsTab";
import { AssignAgentSheetHost } from "@/components/agents/AssignAgentSheet";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentAssignment } from "@/lib/agents/assign";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";

/**
 * The Agents tab on the dev preview (`?stavePreview=agents`): one custom
 * agent, a repository with agent files (one refused field, one unreadable
 * file, one id clash with a built-in), and stubbed assign calls.
 * `&theme=dark` or `&theme=<built-in theme id>` renders under that theme;
 * `&sheet=1` opens Assign to agent as an issue would.
 */
const params = new URLSearchParams(window.location.search);

const REPOSITORY_FILES: Record<string, string> = {
  ".claude/agents/release-notes.md":
    "---\nname: Release notes\ndescription: Use when a release needs its notes drafted from merged PRs.\ntools: Read, Grep, Bash\nhooks:\n  PostToolUse: []\n---\nDraft release notes from the merged pull requests since the last tag.\n",
  ".codex/agents/reviewer.toml":
    'name = "reviewer"\ndescription = "Our own reviewer."\ndeveloper_instructions = "Review the diff."\n',
  ".cursor/agents/broken.md": "no frontmatter here",
};

const PREVIEW_ASSIGNMENT: AgentAssignment = {
  id: "assignment-preview-1",
  requestId: "assign:preview-1",
  agentConfigId: "ui-maintainer",
  agentName: "UI maintainer",
  agentContentHash: "preview",
  assignment: "Tighten the spacing of the settings sidebar.\nKeep the keyboard order.",
  providerId: "claude-code",
  model: null,
  repositoryPath: "/tmp/preview-repo",
  workspaceMode: "new-worktree",
  workspaceId: "preview-workspace",
  taskId: "preview-task",
  branch: "agent/ui-maintainer-spacing",
  state: "started",
  detail: null,
  createdAt: "2026-09-28T09:00:00.000Z",
  updatedAt: "2026-09-28T09:01:00.000Z",
} as unknown as AgentAssignment;

function installBridgeStubs() {
  const api = ((window as { api?: Record<string, unknown> }).api ??= {});
  const folders = (directoryPath: string) => {
    const prefix = `${directoryPath}/`;
    const entries = Object.keys(REPOSITORY_FILES)
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map((path) => ({ name: path.slice(prefix.length), path, type: "file" as const }));
    return entries.length ? { ok: true, entries } : { ok: false, entries: [], stderr: "missing" };
  };
  api.fs = {
    ...(api.fs as object | undefined),
    listDirectory: async (args: { directoryPath?: string }) => folders(args.directoryPath ?? ""),
    readFile: async (args: { filePath: string }) =>
      args.filePath in REPOSITORY_FILES
        ? { ok: true, content: REPOSITORY_FILES[args.filePath], revision: "1" }
        : { ok: false, content: "", revision: "", stderr: "missing" },
  };
  const written: Record<string, string> = {};
  (api.fs as Record<string, unknown>).createFile = async (args: { filePath: string }) =>
    args.filePath in REPOSITORY_FILES || args.filePath in written ? { ok: false, alreadyExists: true } : ((written[args.filePath] = ""), { ok: true, revision: "0" });
  (api.fs as Record<string, unknown>).writeFile = async (args: { filePath: string; content: string }) => {
    written[args.filePath] = args.content;
    return { ok: true, revision: "1" };
  };
  api.agents = {
    assign: async () => ({ ok: true, value: PREVIEW_ASSIGNMENT }),
    listAssignments: async (args?: { agentConfigId?: string }) => ({
      ok: true,
      value: args?.agentConfigId === "ui-maintainer" ? [PREVIEW_ASSIGNMENT] : [],
    }),
    subscribeChanged: () => () => {},
  };
}

export function AgentsPreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const [seeded, setSeeded] = useState(false);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
  }, [theme, builtinTheme]);
  useLayoutEffect(() => {
    installBridgeStubs();
    const custom = {
      ...duplicateAgent(getBuiltinAgent("implementer")!, []),
      id: "ui-maintainer",
      name: "UI maintainer",
      description: "Use for small UI fixes that must keep the design tokens and keyboard order.",
    };
    useAppStore.getState().updateSettings({ patch: { customAgents: [custom] } });
    useAppStore.setState({
      repositoryPath: "/tmp/preview-repo",
      activeWorkspaceId: "preview-workspace",
      workspacePathById: { "preview-workspace": "/tmp/preview-repo" },
    } as never);
    setSeeded(true);
    if (params.get("sheet") === "1") {
      useAgentsUiStore.getState().openAssignSheet({ assignment: "Work on tracker ticket WEB-418.", source: "WEB-418" });
    }
  }, []);
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.frame)}>{seeded ? <AgentsTab /> : null}</div>
      <AssignAgentSheetHost />
    </main>
  );
}

const styles = stylex.create({
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  frame: { flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" },
});
