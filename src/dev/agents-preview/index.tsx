import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { AgentsTab } from "@/components/agents/AgentsTab";
import { AgentsView } from "@/components/agents/AgentsView";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AGENT_COLORS } from "@/lib/agents/schema";
import { DeleteAgentDialog } from "@/components/agents/DeleteAgentDialog";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentAssignment } from "@/lib/agents/assign";
import { duplicateAgent } from "@/lib/agents/library";
import { revisionContentHash } from "@/lib/agents/revisions";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import { useAgentsViewStore } from "@/store/agents-view-store";
import { useAgentsUiStore } from "@/store/agents-ui-store";
/**
 * The Agents tab on the dev preview (`?stavePreview=agents`): one custom
 * agent, a repository with agent files (one refused field, one unreadable
 * file, one id clash with a built-in), and stubbed assign calls.
 * `&theme=dark` or `&theme=<built-in theme id>` renders under that theme;
 * `&surface=1` renders the whole Agents surface (Agents / Playbooks / My
 * standards) instead of the tab. `&new=1` opens the New agent dialog,
 * `&edit=1` selects the custom agent so its sectioned editor shows, and
 * `&avatars=1` shows every avatar hue at each size (with and without the
 * provider mark), next to a round person mark, and
 * `&delete=1` opens the delete dialog with a blocking playbook reference. Use
 * `?stavePreview=kickoff&agent=1` to see the Kickoff dialog with an agent
 * preselected.
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

/** A second, failed assignment so the Activity tab shows "couldn't start". */
const PREVIEW_ASSIGNMENT_FAILED: AgentAssignment = {
  ...PREVIEW_ASSIGNMENT,
  id: "assignment-preview-2",
  requestId: "assign:preview-2",
  assignment: "Rework the empty state.",
  taskId: "preview-task-2",
  state: "failed",
  createdAt: "2026-09-27T09:00:00.000Z",
  updatedAt: "2026-09-27T09:00:30.000Z",
} as unknown as AgentAssignment;

/** Set during seeding to the content hash of a seeded revision, so the History tab marks it "Ran". */
let previewRanContentHash = "preview";

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
    recordTask: async () => ({ ok: true, value: PREVIEW_ASSIGNMENT }),
    releaseTask: async () => ({ ok: true, value: null }),
    listAssignments: async (args?: { agentConfigId?: string }) => ({
      ok: true,
      value:
        args?.agentConfigId === "ui-maintainer"
          ? [{ ...PREVIEW_ASSIGNMENT, agentContentHash: previewRanContentHash }, PREVIEW_ASSIGNMENT_FAILED]
          : [],
    }),
    subscribeChanged: () => () => {},
  };
}

const AVATAR_SIZES = ["xs", "sm", "md", "lg"] as const;

function AvatarSheet() {
  return (
    <div className={sx(styles.sheet)} data-testid="avatar-sheet">
      {AGENT_COLORS.map((color) => (
        <div key={color} className={sx(styles.sheetRow)}>
          <span className={sx(styles.sheetLabel)}>{color}</span>
          {AVATAR_SIZES.map((size) => (
            <AgentAvatar key={size} agent={{ id: color, name: `${color} agent`, appearance: { color } }} size={size} aria-label={null} />
          ))}
          <AgentAvatar agent={{ id: color, name: `${color} agent`, appearance: { color } }} size="md" providerId="claude-code" status="running" aria-label={null} />
          <AgentAvatar agent={{ id: color, name: `${color} agent`, appearance: { color } }} size="md" providerId="codex" status="needs-you" aria-label={null} />
        </div>
      ))}
      <div className={sx(styles.sheetRow)}>
        <span className={sx(styles.sheetLabel)}>person</span>
        <span className={sx(styles.person)}>JK</span>
      </div>
    </div>
  );
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
      appearance: { color: "violet" as const },
    };
    // Two earlier versions, so History has rows and one is marked as having run
    // (its content hash matches the preview assignment).
    const olderVersion = { ...custom, description: "Use for UI tweaks.", instructions: "Keep the design tokens." };
    const olderStill = { ...custom, name: "UI helper", instructions: "Help with UI." };
    previewRanContentHash = revisionContentHash(olderVersion);
    useAppStore.getState().updateSettings({
      patch: {
        customAgents: [
          custom,
          {
            ...custom,
            id: "ship-ui",
            name: "Ship a UI fix",
            description: "Lands a small UI change and opens its PR.",
            workflow: [
              { id: "implement", title: "Implement", kind: "ai", instruction: "Make the change.", doneWhen: "It builds.", agentConfigId: "ui-maintainer" },
              { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
            ],
          },
        ],
        customAgentRevisions: {
          "ui-maintainer": [
            { savedAt: "2026-09-26T10:00:00.000Z", agent: olderVersion },
            { savedAt: "2026-09-24T10:00:00.000Z", agent: olderStill },
          ],
        },
      },
    });
    useAppStore.setState({
      repositoryPath: "/tmp/preview-repo",
      activeWorkspaceId: "preview-workspace",
      workspacePathById: { "preview-workspace": "/tmp/preview-repo" },
    } as never);
    if (params.get("edit") === "1" || params.get("tab")) useAgentsViewStore.getState().selectAgent("ui-maintainer");
    if (params.get("new") === "1") useAgentsUiStore.getState().requestNewAgent();
    setSeeded(true);
  }, []);
  const showDelete = params.get("delete") === "1";
  const custom = useAppStore((state) => state.settings.customAgents[0] ?? null);
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.frame)}>
        {seeded && params.get("avatars") === "1" ? <AvatarSheet /> : null}
        {seeded && params.get("avatars") !== "1" ? (params.get("surface") === "1" ? <AgentsView /> : <AgentsTab />) : null}
        {seeded && showDelete && custom ? (
          <DeleteAgentDialog
            open
            onOpenChange={() => {}}
            agent={custom}
            references={{
              blocking: [{ kind: "workflow-stage", label: "Ship a UI fix", detail: "Implement", ownerId: "ship-ui" }],
              soft: [{ kind: "task", label: "Tighten the settings sidebar", ownerId: "preview-task" }],
            }}
            onDelete={() => {}}
            onArchive={() => {}}
          />
        ) : null}
      </div>
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
  sheet: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"], padding: vars["--ads-space-24"] },
  sheetRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-16"] },
  sheetLabel: { width: 64, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  person: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-surface-tint"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
  },
});
