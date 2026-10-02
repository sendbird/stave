import type { ProviderAccountProviderId } from "./provider-accounts";

/**
 * What a managed account takes from System default, entry by entry.
 *
 * - `link`: a symlink to the System default entry. The account stays in sync:
 *   a skill added later shows up in every account.
 * - `copy`: a filtered copy written once and refreshed on request. Used where a
 *   link would be wrong (the file can name credentials, or the CLI rewrites it
 *   per account).
 * - `skip`: never touched. Listed so the rule is visible and tested, not just
 *   implied by omission.
 *
 * The table is data on purpose: the renderer reads the labels, Electron main
 * executes the plan, and the tests assert it.
 */
export type SetupSharingAction = "link" | "copy" | "skip";

export interface SetupSharingEntry {
  /** Path inside the provider's configuration directory. */
  name: string;
  action: SetupSharingAction;
  /** `link` entries only: whether the entry is a folder or a single file. */
  kind?: "directory" | "file";
  /** Plain noun for the UI ("skills"). Empty for skipped entries. */
  label: string;
  /** Why this action, in one sentence. */
  reason: string;
  /** `copy` entries only: how the profile's file is derived from the source. */
  filter?: "claude-settings";
}

const CLAUDE_PLAN: readonly SetupSharingEntry[] = [
  { name: "skills", action: "link", kind: "directory", label: "skills", reason: "A link keeps every account in sync with the skills you add or edit." },
  { name: "agents", action: "link", kind: "directory", label: "agents", reason: "A link keeps every account in sync with your subagents." },
  { name: "commands", action: "link", kind: "directory", label: "commands", reason: "A link keeps every account in sync with your slash commands." },
  { name: "plugins", action: "link", kind: "directory", label: "plugins", reason: "A link keeps installed plugins and their marketplaces in one place." },
  { name: "CLAUDE.md", action: "link", kind: "file", label: "instructions", reason: "You edit it by hand and it holds no login, so a link applies each edit everywhere." },
  { name: "settings.json", action: "copy", kind: "file", label: "settings", filter: "claude-settings", reason: "It can name API keys and login rules, and the CLI rewrites it per account, so each account gets a filtered copy." },
  { name: ".credentials.json", action: "skip", label: "", reason: "The login. Every account signs in on its own." },
  { name: ".claude.json", action: "skip", label: "", reason: "Holds who is signed in, per-project history and caches. MCP servers are not shared." },
  { name: "projects", action: "skip", label: "", reason: "Conversation history belongs to the account that had it." },
  { name: "history.jsonl", action: "skip", label: "", reason: "Prompt history belongs to the account that typed it." },
  { name: "todos", action: "skip", label: "", reason: "Session state belongs to the account that created it." },
  { name: "shell-snapshots", action: "skip", label: "", reason: "Session state belongs to the account that created it." },
  { name: "statsig", action: "skip", label: "", reason: "Feature flags and caches are tied to the signed-in account." },
];

const CODEX_PLAN: readonly SetupSharingEntry[] = [
  { name: "skills", action: "link", kind: "directory", label: "skills", reason: "A link keeps every account in sync with the skills you add or edit." },
  { name: "prompts", action: "link", kind: "directory", label: "prompts", reason: "A link keeps every account in sync with your custom prompts." },
  { name: "AGENTS.md", action: "link", kind: "file", label: "instructions", reason: "You edit it by hand and it holds no login, so a link applies each edit everywhere." },
  { name: "config.toml", action: "skip", label: "", reason: "Codex can keep endpoint, login and MCP credential settings here and rewrites the file itself, so it is not shared." },
  { name: "auth.json", action: "skip", label: "", reason: "The login. Every account signs in on its own." },
  { name: "history.jsonl", action: "skip", label: "", reason: "Prompt history belongs to the account that typed it." },
  { name: "sessions", action: "skip", label: "", reason: "Conversation history belongs to the account that had it." },
];

/**
 * Names that no plan may link or copy, whatever the table says. A future edit
 * that puts one of these in a `link` or `copy` entry fails the planner instead
 * of quietly sharing a login or a history.
 */
export const NEVER_SHARED_NAMES: ReadonlySet<string> = new Set([
  ".credentials.json",
  "auth.json",
  ".claude.json",
  "config.toml",
  "projects",
  "sessions",
  "history.jsonl",
  "todos",
  "shell-snapshots",
  "statsig",
]);

export function setupSharingPlan(providerId: ProviderAccountProviderId): readonly SetupSharingEntry[] {
  const plan = providerId === "claude-code" ? CLAUDE_PLAN : CODEX_PLAN;
  for (const entry of plan) {
    if (entry.action !== "skip" && NEVER_SHARED_NAMES.has(entry.name))
      throw new Error(`${entry.name} can never be shared between accounts.`);
  }
  return plan;
}

/** Entries the plan acts on, in the order it applies them. */
export function sharedSetupEntries(providerId: ProviderAccountProviderId) {
  return setupSharingPlan(providerId).filter((entry) => entry.action !== "skip");
}

/** "skills, agents, commands, plugins, instructions and settings". */
export function sharedSetupSummary(providerId: ProviderAccountProviderId) {
  const labels = [...new Set(sharedSetupEntries(providerId).map((entry) => entry.label))];
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : (labels[0] ?? "");
}
