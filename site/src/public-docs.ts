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
        routePath: "conversation-history-actions",
        sourcePath: "docs/features/conversation-history-actions.md",
        title: "Conversation History Actions",
        description:
          "Fork or roll back provider conversations from an earlier response without reverting workspace files.",
      },
    ],
  },
  {
    id: "workspace",
    title: "Workspace",
    docs: [
      {
        routePath: "project-instructions",
        sourcePath: "docs/features/project-instructions.md",
        title: "Project Instructions",
        description:
          "Save repository-level rules once so every task in that project starts with the same guidance.",
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
        routePath: "routines",
        sourcePath: "docs/features/routines.md",
        title: "Routines",
        description:
          "Schedule recurring Claude or Codex tasks with their own environment, model, permissions, and Information resources.",
      },
      {
        routePath: "child-tasks",
        sourcePath: "docs/features/child-tasks.md",
        title: "Child Tasks",
        description:
          "Delegate work from one task to a durable child task, optionally on the other provider or in its own worktree.",
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
        title: "Fleet Needs Me",
        description:
          "Work through questions, approvals, failed runs, results, and pull request blockers across every workspace.",
      },
      {
        routePath: "sidebar-views",
        sourcePath: "docs/features/sidebar-views.md",
        title: "Sidebar Views",
        description:
          "Switch the left sidebar between the Projects tree and the Work queue, which groups every workspace by what it needs from you.",
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
