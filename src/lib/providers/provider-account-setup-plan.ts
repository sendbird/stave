import { i18n } from "@/i18n/runtime";
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
 * An entry marked `modal` follows the account's settings mode: in `link` mode
 * it is linked when its `linkCheck` finds nothing private; otherwise it falls
 * back to its filtered copy, or is left unshared when it has no filter.
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
  /** How a copied file is derived from the source. */
  filter?: "claude-settings";
  /** The entry follows the account's settings mode (`link` or `copy`). */
  modal?: boolean;
  /** `modal` entries only: the check the source must pass before it is linked. */
  linkCheck?: "claude-settings" | "codex-config";
}

const CLAUDE_PLAN: readonly SetupSharingEntry[] = [
  { name: "skills", action: "link", kind: "directory", label: "skills", get reason() { return i18n.t("providers:providerAccountSetupPlan.aLinkKeepsEveryAccountIn"); } },
  { name: "agents", action: "link", kind: "directory", label: "agents", get reason() { return i18n.t("providers:providerAccountSetupPlan.aLinkKeepsEveryAccountInVariant977b670e"); } },
  { name: "commands", action: "link", kind: "directory", label: "commands", get reason() { return i18n.t("providers:providerAccountSetupPlan.aLinkKeepsEveryAccountInVariantee083f15"); } },
  { name: "plugins", action: "link", kind: "directory", label: "plugins", get reason() { return i18n.t("providers:providerAccountSetupPlan.aLinkKeepsInstalledPluginsAnd"); } },
  { name: "CLAUDE.md", action: "link", kind: "file", label: "instructions", get reason() { return i18n.t("providers:providerAccountSetupPlan.youEditItByHandAnd"); } },
  { name: "settings.json", action: "copy", kind: "file", label: "settings", filter: "claude-settings", modal: true, linkCheck: "claude-settings", get reason() { return i18n.t("providers:providerAccountSetupPlan.itCanNameAPIKeysAnd"); } },
  { name: ".credentials.json", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.theLoginEveryAccountSignsIn"); } },
  { name: ".claude.json", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.holdsWhoIsSignedInPer"); } },
  { name: "projects", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.conversationHistoryBelongsToTheAccount"); } },
  { name: "history.jsonl", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.promptHistoryBelongsToTheAccount"); } },
  { name: "todos", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.sessionStateBelongsToTheAccount"); } },
  { name: "shell-snapshots", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.sessionStateBelongsToTheAccount"); } },
  { name: "statsig", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.featureFlagsAndCachesAreTied"); } },
];

const CODEX_PLAN: readonly SetupSharingEntry[] = [
  { name: "skills", action: "link", kind: "directory", label: "skills", get reason() { return i18n.t("providers:providerAccountSetupPlan.aLinkKeepsEveryAccountIn"); } },
  { name: "prompts", action: "link", kind: "directory", label: "prompts", get reason() { return i18n.t("providers:providerAccountSetupPlan.aLinkKeepsEveryAccountInVariant40e8eda0"); } },
  { name: "AGENTS.md", action: "link", kind: "file", label: "instructions", get reason() { return i18n.t("providers:providerAccountSetupPlan.youEditItByHandAnd"); } },
  { name: "hooks.json", action: "link", kind: "file", label: "hooks", get reason() { return i18n.t("providers:providerAccountSetupPlan.youEditItByHandAnd"); } },
  { name: "config.toml", action: "link", kind: "file", label: "settings", modal: true, linkCheck: "codex-config", get reason() { return i18n.t("providers:providerAccountSetupPlan.codexCanKeepEndpointLoginAnd"); } },
  { name: "auth.json", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.theLoginEveryAccountSignsIn"); } },
  { name: "history.jsonl", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.promptHistoryBelongsToTheAccount"); } },
  { name: "sessions", action: "skip", label: "", get reason() { return i18n.t("providers:providerAccountSetupPlan.conversationHistoryBelongsToTheAccount"); } },
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
