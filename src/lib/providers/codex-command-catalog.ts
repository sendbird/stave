import type { ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";

export interface CodexBuiltInSlashCommand extends ProviderSlashCommand {
  category: "session" | "runtime" | "workspace" | "inspection" | "integrations";
  availabilityNote?: string;
}

// Source:
// - https://developers.openai.com/codex/cli/slash-commands
// - verified against the installed Codex CLI on 2026-04-16
export const CODEX_CLI_SLASH_COMMANDS: readonly CodexBuiltInSlashCommand[] = [
  {
    name: "permissions",
    command: "/permissions",
    description: "Adjust approvals and sandbox behavior for the active thread.",
    category: "runtime",
  },
  {
    name: "sandbox-add-read-dir",
    command: "/sandbox-add-read-dir",
    description: "Add another readable directory to the Windows sandbox roots.",
    argumentHint: "<absolute-dir>",
    category: "runtime",
    availabilityNote: "Windows only.",
  },
  {
    name: "agent",
    command: "/agent",
    description: "Switch focus to a spawned subagent thread.",
    category: "session",
  },
  {
    name: "apps",
    command: "/apps",
    description: "Browse connectors and insert an app mention into the prompt.",
    category: "integrations",
  },
  {
    name: "plugins",
    command: "/plugins",
    description: "Inspect, install, and manage Codex plugins.",
    category: "integrations",
  },
  {
    name: "clear",
    command: "/clear",
    description: "Clear the terminal and start a fresh conversation.",
    category: "session",
  },
  {
    name: "compact",
    command: "/compact",
    description: "Summarize the current conversation to reclaim context.",
    category: "session",
  },
  {
    name: "copy",
    command: "/copy",
    description: "Copy the latest completed Codex output.",
    category: "inspection",
  },
  {
    name: "diff",
    command: "/diff",
    description: "Show the current git diff, including untracked files.",
    category: "inspection",
  },
  {
    name: "exit",
    command: "/exit",
    description: "Exit the CLI immediately.",
    category: "session",
  },
  {
    name: "experimental",
    command: "/experimental",
    description: "Toggle experimental Codex features.",
    category: "runtime",
  },
  {
    name: "feedback",
    command: "/feedback",
    description: "Send logs and diagnostics to the Codex maintainers.",
    category: "inspection",
  },
  {
    name: "init",
    command: "/init",
    description: "Generate an AGENTS.md scaffold for the current directory.",
    category: "workspace",
  },
  {
    name: "logout",
    command: "/logout",
    description: "Sign out of Codex on this machine.",
    category: "runtime",
  },
  {
    name: "mcp",
    command: "/mcp",
    description: "List configured MCP tools and servers.",
    category: "integrations",
  },
  {
    name: "mention",
    command: "/mention",
    description: "Attach a file or folder reference to the conversation.",
    category: "workspace",
  },
  {
    name: "model",
    command: "/model",
    description:
      "Choose the active model and, when supported, reasoning effort.",
    category: "runtime",
  },
  {
    name: "fast",
    command: "/fast",
    description: "Toggle or inspect Fast mode for GPT-5.4.",
    argumentHint: "on | off | status",
    category: "runtime",
  },
  {
    name: "plan",
    command: "/plan",
    description: "Switch the conversation into plan mode.",
    argumentHint: "[prompt]",
    category: "runtime",
  },
  {
    name: "personality",
    command: "/personality",
    description: "Choose how Codex communicates in the active thread.",
    category: "runtime",
    availabilityNote:
      "Hidden when the active model does not support personalities.",
  },
  {
    name: "ps",
    command: "/ps",
    description: "Show background terminals and recent output.",
    category: "inspection",
  },
  {
    name: "stop",
    command: "/stop",
    description: "Stop all background terminals started by the session.",
    category: "runtime",
  },
  {
    name: "fork",
    command: "/fork",
    description: "Fork the current conversation into a new thread.",
    category: "session",
  },
  {
    name: "resume",
    command: "/resume",
    description: "Resume a saved conversation from the session list.",
    category: "session",
  },
  {
    name: "new",
    command: "/new",
    description: "Start a new conversation without leaving the CLI.",
    category: "session",
  },
  {
    name: "quit",
    command: "/quit",
    description: "Exit the CLI immediately.",
    category: "session",
  },
  {
    name: "review",
    command: "/review",
    description: "Ask Codex to review the current working tree.",
    category: "inspection",
  },
  {
    name: "status",
    command: "/status",
    description:
      "Inspect the current model, permissions, roots, and context usage.",
    category: "inspection",
  },
  {
    name: "debug-config",
    command: "/debug-config",
    description: "Print config-layer and policy diagnostics.",
    category: "inspection",
  },
  {
    name: "statusline",
    command: "/statusline",
    description: "Configure which fields appear in the TUI footer.",
    category: "runtime",
  },
  {
    name: "title",
    command: "/title",
    description: "Configure terminal title fields interactively.",
    category: "runtime",
  },
];

export function listCodexSlashCommands(): ProviderSlashCommand[] {
  return CODEX_CLI_SLASH_COMMANDS.map((command) => ({
    name: command.name,
    command: command.command,
    description: command.description,
    ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
  }));
}

export function getCodexSlashCommandCatalogDetail() {
  return [
    "Loaded Codex slash commands from Stave's bundled official CLI reference.",
    "Commands are still forwarded to Codex unchanged because App Server does not expose a live slash-command catalog RPC.",
  ].join(" ");
}
