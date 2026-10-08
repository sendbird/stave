export type PublicDocRoute = {
  routePath: string;
  sourcePath: string;
  title: string;
  description: string;
  previewImage?: string;
};

export type PublicDocSection = {
  id: string;
  title: string;
  docs: PublicDocRoute[];
};

/**
 * Information architecture for the public Stave docs site.
 *
 * Rules:
 * - End-user content only. Contributor and architecture material stays under
 *   `docs/developer/**` and `docs/architecture/**`, which are excluded from
 *   this build.
 * - The first doc of the first section is treated as the docs home. Visiting
 *   `/docs/` renders that doc directly — there is no separate landing card.
 */
export const PUBLIC_DOC_SECTIONS: PublicDocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    docs: [
      {
        routePath: "install-guide",
        sourcePath: "docs/install-guide.md",
        title: "Install on macOS",
        description:
          "Install the latest Stave desktop build with GitHub CLI and open the workspace for the first time.",
        previewImage: "screenshots/stave-app.png",
      },
    ],
  },
  {
    id: "using-stave",
    title: "Using Stave",
    docs: [
      {
        routePath: "integrated-terminal",
        sourcePath: "docs/features/integrated-terminal.md",
        title: "Integrated Terminal",
        description:
          "Run a docked shell or a full Claude or Codex CLI session without leaving the workspace.",
        previewImage: "screenshots/integrated-terminal.png",
      },
      {
        routePath: "command-palette",
        sourcePath: "docs/features/command-palette.md",
        title: "Command Palette",
        description:
          "Jump to any action, setting, or workspace surface from one searchable launcher.",
        previewImage: "screenshots/command-palette.png",
      },
      {
        routePath: "runtime-safety",
        sourcePath: "docs/features/provider-sandbox-and-approval.md",
        title: "Runtime Safety Controls",
        description:
          "Decide how much file access, network access, and autonomy Claude or Codex has before you send a turn.",
        previewImage: "screenshots/provider-controls-claude.png",
      },
      {
        routePath: "attachments",
        sourcePath: "docs/features/attachments.md",
        title: "Attachments",
        description:
          "Add files and images to the chat composer so the model can work from exact local context.",
      },
      {
        routePath: "skill-selector",
        sourcePath: "docs/features/skill-selector.md",
        title: "Skill Selector",
        description:
          "Type $ in the composer to search installed skills and send them to Claude or Codex as provider-appropriate requests.",
        previewImage: "screenshots/skills-panel.png",
      },
      {
        routePath: "prompt-enhancement",
        sourcePath: "docs/features/prompt-enhancement.md",
        title: "Prompt Enhancement",
        description:
          "Rewrite a rough task draft into a clearer, execution-ready prompt before sending it.",
      },
      {
        routePath: "conversation-context",
        sourcePath: "docs/features/conversation-context.md",
        title: "Conversation Context",
        description:
          "See how full the current task conversation is and compact it from the composer without losing the draft.",
      },
      {
        routePath: "conversation-history-actions",
        sourcePath: "docs/features/conversation-history-actions.md",
        title: "Conversation History Actions",
        description:
          "Fork or roll back provider conversations from an earlier response without reverting workspace files.",
      },
      {
        routePath: "turn-activity",
        sourcePath: "docs/features/turn-activity.md",
        title: "Turn Activity",
        description:
          "Choose a docked, floating, or right-rail view for following tools, delegated tasks, todos, and other live turn data.",
      },
      {
        routePath: "accounts-and-gateways",
        sourcePath: "docs/features/accounts-and-gateways.md",
        title: "Accounts and API Connections",
        description:
          "Add a second Claude or Codex sign-in, switch the account new turns use, or bill Claude and Codex turns per token through one gateway key.",
      },
      {
        routePath: "standalone-cli",
        sourcePath: "docs/features/standalone-cli.md",
        title: "Standalone CLI",
        description:
          "Run the real Claude Code and Codex CLIs against any folder from the top bar without registering it as a project.",
      },
    ],
  },
  {
    id: "agents-and-runs",
    title: "Agents and Runs",
    docs: [
      {
        routePath: "agents",
        sourcePath: "docs/features/agents.md",
        title: "Agents",
        description:
          "Save workers with their own instructions, model, tool limits and permission, then start work with one from Kickoff and follow each task's flow.",
      },
      {
        routePath: "auto-routing",
        sourcePath: "docs/features/auto-routing.md",
        title: "Auto (Model Router)",
        description:
          "Let Stave pick an eligible provider, model and effort for each turn from the models you already use.",
      },
      {
        routePath: "agent-runs",
        sourcePath: "docs/features/agent-runs.md",
        title: "Agent runs",
        description:
          "Assign an outcome to an agent: Stave runs its workflow's stages, opens the PR, watches checks and checks in only where the agent says.",
      },
      {
        routePath: "results",
        sourcePath: "docs/features/results.md",
        title: "Agent performance and task outputs",
        description:
          "Compare delegated run performance across workspaces, inspect a task's saved outputs, and choose a follow-up.",
      },
      {
        routePath: "playbooks",
        sourcePath: "docs/features/playbooks.md",
        title: "Playbooks (retired)",
        description:
          "Playbooks folded into agents: each saved playbook became a custom agent with the same stages.",
      },
    ],
  },
  {
    id: "workspace",
    title: "Workspace",
    docs: [
      {
        routePath: "workspace-kickoff",
        sourcePath: "docs/features/workspace-kickoff.md",
        title: "Workspace Kickoff",
        description:
          "Create a workspace from an issue, a link or a prompt, review the proposed branch and task, and optionally hand it to an agent.",
      },
      {
        routePath: "repository-instructions",
        sourcePath: "docs/features/repository-instructions.md",
        title: "Repository Instructions",
        description:
          "Save repository-level rules once so every task in that repository starts with the same guidance.",
        previewImage: "screenshots/project-instructions.png",
      },
      {
        routePath: "workspace-scripts",
        sourcePath: "docs/features/workspace-scripts.md",
        title: "Workspace Scripts",
        description:
          "Run shared actions, long-running services, and lifecycle hooks from the workspace side panel.",
        previewImage: "screenshots/scripts-panel.png",
      },
      {
        routePath: "resource-manager",
        sourcePath: "docs/features/resource-manager.md",
        title: "Resource Manager",
        description:
          "Inspect Lens memory, sleep or release hidden pages, stop workspace execution, and clean up inactive worktrees.",
      },
      {
        routePath: "automations",
        sourcePath: "docs/features/automations.md",
        title: "Automations",
        description:
          "Schedule recurring Claude or Codex tasks with their own environment, model, permissions, and Information resources.",
      },
      {
        routePath: "wake-ups",
        sourcePath: "docs/features/wake-ups.md",
        title: "Wake-ups",
        description:
          "Resume an existing task on a schedule or when the work it delegated finishes, in the same provider session.",
      },
      {
        routePath: "workspace-documents",
        sourcePath: "docs/features/workspace-documents.md",
        title: "Workspace Documents",
        description:
          "Have an agent write a plan or report as a Markdown document, revise it in the chat or the editor, and compare its revisions.",
      },
      {
        routePath: "review-tasks",
        sourcePath: "docs/features/review-tasks.md",
        title: "Review Tasks",
        description:
          "Review local changes or a task's latest answer in a separate read-only task on the model you pick, then attach only the findings.",
      },
      {
        routePath: "review-prompts",
        sourcePath: "docs/features/review-prompts.md",
        title: "Review Prompt Rubrics",
        description:
          "Choose a review preset, installed skill, or custom prompt and understand the evidence standard used to assess findings.",
      },
      {
        routePath: "delegated-tasks",
        sourcePath: "docs/features/delegated-tasks.md",
        title: "Delegated Tasks",
        description:
          "Delegate work from one task to a durable delegated task, optionally on the other provider or in its own worktree.",
      },
      {
        routePath: "latest-turn-summary",
        sourcePath: "docs/features/workspace-latest-turn-summary.md",
        title: "Latest Turn Summary",
        description:
          "Keep a short workspace recap in the Information panel so switching context is faster.",
        previewImage: "screenshots/information-panel.png",
      },
      {
        routePath: "background-ai",
        sourcePath: "docs/features/background-ai-policy.md",
        title: "Background AI",
        description:
          "See every model call Stave makes on your behalf, switch each one off, and choose the provider and model it runs on.",
      },
      {
        routePath: "repository-memory",
        sourcePath: "docs/features/repository-memory.md",
        title: "Repository Memory",
        description:
          "Carry durable decisions, conventions, and gotchas across workspaces of the same repository as a curated recall aid.",
      },
      {
        routePath: "notifications",
        sourcePath: "docs/features/notifications.md",
        title: "Notifications",
        description:
          "Track approvals, task completions, and follow-up work across workspaces from the top-bar bell.",
        previewImage: "screenshots/notifications.png",
      },
      {
        routePath: "fleet-needs-me",
        sourcePath: "docs/features/fleet-needs-me.md",
        title: "Fleet Action Required",
        description:
          "Work through questions, approvals, failed runs, results, and pull request blockers across every workspace.",
      },
      {
        routePath: "sidebar-views",
        sourcePath: "docs/features/sidebar-views.md",
        title: "Sidebar Views",
        description:
          "Switch the left sidebar between the Repositories tree and the Work queue, which groups every workspace by what it needs from you.",
      },
      {
        routePath: "issues",
        sourcePath: "docs/features/issues.md",
        title: "Issues",
        description:
          "See the tracker tickets assigned to you from Crane and Jira, then start a local run from one with the project, workspace, and provider you choose.",
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    docs: [
      {
        routePath: "lens",
        sourcePath: "docs/features/lens.md",
        title: "Lens Browser",
        description:
          "Inspect a live page in the right rail and send DOM, console, or element context into a task draft.",
      },
      {
        routePath: "local-mcp",
        sourcePath: "docs/features/local-mcp-user-guide.md",
        title: "Local MCP",
        description:
          "Expose Stave's task and workspace tools to same-machine automation clients over loopback or stdio.",
        previewImage: "screenshots/mcp-settings.png",
      },
      {
        routePath: "mcp-server-management",
        sourcePath: "docs/features/mcp-server-management.md",
        title: "MCP Server Management",
        description:
          "Configure native Claude and Codex MCP servers with reviewable, conflict-safe changes and protected credentials.",
      },
      {
        routePath: "crane-connector",
        sourcePath: "docs/features/crane-connector.md",
        title: "Crane Connector",
        description:
          "Queue a Crane issue for local Claude or Codex execution with explicit per-job approval and status-only reporting.",
      },
      {
        routePath: "martin-sync",
        sourcePath: "docs/features/martin-sync.md",
        title: "Martin Workspace Sync",
        description:
          "Link a workspace to a Martin project, sync selected activity and resource links, and pull project context into Stave.",
      },
      {
        routePath: "language-intelligence",
        sourcePath: "docs/features/language-intelligence.md",
        title: "Language Intelligence",
        description:
          "Turn on language servers for TypeScript, JavaScript, and Python so the editor understands your project.",
        previewImage: "screenshots/language-intelligence.png",
      },
    ],
  },
  {
    id: "reference",
    title: "Reference",
    docs: [
      {
        routePath: "macos-folder-access",
        sourcePath: "docs/features/macos-folder-access-prompts.md",
        title: "macOS Folder Access",
        description:
          "Handle the system permission prompts that can keep reappearing for Desktop, Documents, and Downloads.",
      },
    ],
  },
];

export function flattenPublicDocs() {
  return PUBLIC_DOC_SECTIONS.flatMap((section) => section.docs);
}

export function getHomeDoc() {
  const first = PUBLIC_DOC_SECTIONS[0]?.docs[0];
  if (!first) {
    throw new Error("PUBLIC_DOC_SECTIONS must contain at least one doc.");
  }
  return first;
}
