import type { ToolingStatusId } from "../tooling-status";

/** The sign-in command each CLI documents; Settings copies it, Stave never runs it unasked. */
export const PROVIDER_LOGIN_COMMAND = {
  gh: "gh auth login",
  claude: "claude auth login",
  codex: "codex login",
  cursor: "agent login",
  kiro: "kiro-cli login",
  opencode: "opencode auth login",
} as const satisfies Partial<Record<ToolingStatusId, string>>;
