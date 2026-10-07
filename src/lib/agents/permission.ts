import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import type { AgentPermission } from "./schema";

/**
 * An agent's permission is a ceiling on the turn's own permissions, never a
 * grant. Each turn of a task that runs as an agent keeps the user's settings
 * where they are already at or below the ceiling and lowers them where they
 * are above it; nothing here can raise a setting.
 *
 * Ceilings per provider:
 *
 * | Agent      | Claude                                  | Codex                          | Cursor              | Kiro   |
 * | ---------- | --------------------------------------- | ------------------------------ | ------------------- | ------ |
 * | Read only  | `default`, edit tools off, no skipping  | read-only files, `on-request`  | Ask mode, Manual    | Manual |
 * | Manual     | `default`, no skipping                  | workspace files, `untrusted`   | Manual              | Manual |
 * | Guided     | `acceptEdits`, no skipping              | workspace files, `untrusted`   | Guided              | Manual |
 * | Auto       | the user's settings                     | the user's settings            | the user's settings | the user's settings |
 *
 * Kiro has no read-only mode: a read-only agent there asks before every tool
 * and is told not to edit, so its file limit is reported as instructed.
 */

type PermissionOptions = Pick<
  ProviderRuntimeOptions,
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeDisallowedTools"
  | "codexFileAccess"
  | "codexApprovalPolicy"
  | "cursorMode"
  | "cursorApprovalMode"
  | "kiroApprovalMode"
>;

/** Claude tools that edit files; a read-only agent turns them off. */
export const CLAUDE_EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"] as const;

type ClaudeMode = NonNullable<ProviderRuntimeOptions["claudePermissionMode"]>;
// `dontAsk` denies what it would ask, but runs allowed tools unprompted, so it
// ranks with the autonomous modes below `bypass`.
const CLAUDE_MODE_RANK: Readonly<Record<ClaudeMode, number>> = {
  default: 1,
  acceptEdits: 2,
  dontAsk: 3,
  auto: 3,
  bypassPermissions: 4,
};
type CodexFiles = NonNullable<ProviderRuntimeOptions["codexFileAccess"]>;
const CODEX_FILE_RANK: Readonly<Record<CodexFiles, number>> = { "read-only": 0, "workspace-write": 1, "danger-full-access": 2 };
type CodexApproval = NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>;
const CODEX_APPROVAL_RANK: Readonly<Record<CodexApproval, number>> = { untrusted: 0, "on-request": 1, "on-failure": 2, never: 3 };
type CursorApproval = NonNullable<ProviderRuntimeOptions["cursorApprovalMode"]>;
const CURSOR_APPROVAL_RANK: Readonly<Record<CursorApproval, number>> = { manual: 0, guided: 1, auto: 2 };

interface Ceiling {
  claudeMode: ClaudeMode;
  claudeEditTools: boolean;
  codexFiles: CodexFiles;
  codexApproval: CodexApproval;
  cursorApproval: CursorApproval;
  cursorAsk: boolean;
}

const CEILINGS: Readonly<Record<Exclude<AgentPermission, "auto">, Ceiling>> = {
  "read-only": {
    claudeMode: "default",
    claudeEditTools: false,
    codexFiles: "read-only",
    codexApproval: "on-request",
    cursorApproval: "manual",
    cursorAsk: true,
  },
  manual: {
    claudeMode: "default",
    claudeEditTools: true,
    codexFiles: "workspace-write",
    codexApproval: "untrusted",
    cursorApproval: "manual",
    cursorAsk: false,
  },
  guided: {
    claudeMode: "acceptEdits",
    claudeEditTools: true,
    codexFiles: "workspace-write",
    codexApproval: "untrusted",
    cursorApproval: "guided",
    cursorAsk: false,
  },
};

/** The cap when the current value is above it, else nothing to change. An unset value counts as the provider default. */
function lower<T extends string>(current: T | undefined, cap: T, rank: Readonly<Record<T, number>>, providerDefault: T): T | undefined {
  const effective = current ?? providerDefault;
  return (rank[effective] ?? Number.POSITIVE_INFINITY) > rank[cap] ? cap : undefined;
}

/**
 * The option overrides that keep one turn at or below the agent's permission.
 * Only the fields that must change are returned, so merging them over the
 * turn's options narrows and never widens.
 */
export function agentPermissionOverrides(args: {
  permission: AgentPermission;
  providerId: ProviderId;
  options: PermissionOptions | undefined;
}): PermissionOptions {
  if (args.permission === "auto") return {};
  const cap = CEILINGS[args.permission];
  const options = args.options ?? {};
  const out: PermissionOptions = {};
  switch (args.providerId) {
    case "claude-code": {
      const mode = lower(options.claudePermissionMode, cap.claudeMode, CLAUDE_MODE_RANK, "default");
      if (mode) out.claudePermissionMode = mode;
      if (options.claudeAllowDangerouslySkipPermissions) out.claudeAllowDangerouslySkipPermissions = false;
      if (!cap.claudeEditTools) {
        const denied = new Set(options.claudeDisallowedTools ?? []);
        if (CLAUDE_EDIT_TOOLS.some((tool) => !denied.has(tool))) {
          out.claudeDisallowedTools = [...new Set([...(options.claudeDisallowedTools ?? []), ...CLAUDE_EDIT_TOOLS])];
        }
      }
      return out;
    }
    case "codex": {
      // Codex defaults to workspace writes without asking, so an unset value counts as that.
      const files = lower(options.codexFileAccess, cap.codexFiles, CODEX_FILE_RANK, "workspace-write");
      if (files) out.codexFileAccess = files;
      const approval = lower(options.codexApprovalPolicy, cap.codexApproval, CODEX_APPROVAL_RANK, "never");
      if (approval) out.codexApprovalPolicy = approval;
      return out;
    }
    case "cursor": {
      const approval = lower(options.cursorApprovalMode, cap.cursorApproval, CURSOR_APPROVAL_RANK, "manual");
      if (approval) out.cursorApprovalMode = approval;
      if (cap.cursorAsk && options.cursorMode !== "ask") out.cursorMode = "ask";
      return out;
    }
    case "kiro":
      if (options.kiroApprovalMode === "auto") out.kiroApprovalMode = "manual";
      return out;
  }
}

/** How firmly each provider holds an agent's permission: its file limit for read only, its approvals otherwise. */
export function agentPermissionSupport(permission: AgentPermission, providerId: ProviderId): "enforced" | "instructed" | null {
  if (permission === "auto") return null;
  if (permission === "read-only" && providerId === "kiro") return "instructed";
  return "enforced";
}
