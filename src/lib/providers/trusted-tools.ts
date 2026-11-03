import type { ApprovalRisk } from "@/lib/approvals/approval-resolution";

const BASH_TRUST_PREFIX = "bash:";
const MAX_TRUSTED_TOOL_ENTRY_LENGTH = 500;
const MAX_CLAUDE_ALLOWED_TOOL_LENGTH = 200;
const MAX_TRUSTED_TOOL_ENTRIES = 200;

export function normalizeTrustedToolName(toolName: string) {
  return toolName.trim().toLowerCase();
}

export function isBashToolName(toolName: string) {
  return normalizeTrustedToolName(toolName) === "bash";
}

export function normalizeTrustedToolEntries(
  entries?: readonly string[] | null,
) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries ?? []) {
    const trimmed = entry.trim().slice(0, MAX_TRUSTED_TOOL_ENTRY_LENGTH);
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
    if (normalized.length >= MAX_TRUSTED_TOOL_ENTRIES) {
      break;
    }
  }

  return normalized;
}

export function buildTrustedToolEntryForApproval(args: {
  toolName: string;
  input?: string;
}) {
  const toolName = args.toolName.trim();
  if (!toolName) {
    return null;
  }

  if (!isBashToolName(toolName)) {
    return toolName;
  }

  const commandPrefix = args.input?.trim();
  if (!commandPrefix) {
    return null;
  }
  return `${BASH_TRUST_PREFIX}${commandPrefix}`;
}

export function isTrustedToolEntryForBash(entry: string) {
  return entry.trim().toLowerCase().startsWith(BASH_TRUST_PREFIX);
}

function resolveTrustedBashCommandPrefix(entry: string) {
  if (!isTrustedToolEntryForBash(entry)) {
    return null;
  }
  return entry.trim().slice(BASH_TRUST_PREFIX.length).trim();
}

export function formatTrustedToolEntry(entry: string) {
  const bashPrefix = resolveTrustedBashCommandPrefix(entry);
  if (bashPrefix) {
    // i18n-ignore: canonical tool name and shell command prefix
    return `Bash: ${bashPrefix}`;
  }
  return entry.trim();
}

/**
 * Shell syntax that chains, pipes, redirects or substitutes another command.
 * Arguments appended to a trusted command may not carry any of it, so trusting
 * `git status` never also trusts `git status; rm -rf ~`.
 */
const SHELL_CONTROL_PATTERN = /[;&|<>`$(){}\n\r]/;

/**
 * Whether `command` is the trusted command itself, or that command with more
 * plain arguments. The match ends at a word boundary (`bun test` does not
 * trust `bun testing`) and the added arguments hold no shell control syntax.
 */
export function matchesTrustedBashCommand(prefix: string, command: string) {
  if (!prefix || !command.startsWith(prefix)) {
    return false;
  }
  const rest = command.slice(prefix.length);
  if (rest.length === 0) {
    return true;
  }
  return /^\s/.test(rest) && !SHELL_CONTROL_PATTERN.test(rest);
}

export function isTrustedApproval(args: {
  trustedTools?: readonly string[] | null;
  toolName: string;
  input?: string;
}) {
  const entries = normalizeTrustedToolEntries(args.trustedTools);
  if (entries.length === 0) {
    return false;
  }

  const normalizedToolName = normalizeTrustedToolName(args.toolName);
  if (normalizedToolName === "bash") {
    const command = args.input?.trim();
    if (!command) {
      return false;
    }
    return entries.some((entry) => {
      const prefix = resolveTrustedBashCommandPrefix(entry);
      return prefix ? matchesTrustedBashCommand(prefix, command) : false;
    });
  }

  return entries.some((entry) => {
    if (isTrustedToolEntryForBash(entry)) {
      return false;
    }
    return normalizeTrustedToolName(entry) === normalizedToolName;
  });
}

/**
 * Risks of a request that crossed a Stave guardrail (Claude G1–G3). Such a
 * request always reaches the user: no trusted entry answers it.
 */
const GUARDRAIL_RISKS: ReadonlySet<ApprovalRisk> = new Set([
  "write-outside-repository",
  "credential-access",
  "irreversible-remote",
]);

export function isGuardrailApprovalRisk(risk: ApprovalRisk | undefined) {
  return risk !== undefined && GUARDRAIL_RISKS.has(risk);
}

/**
 * Whether the user's trusted tools answer this request without asking: the
 * request matches an entry and did not cross a guardrail.
 */
export function isTrustedApprovalRequest(args: {
  trustedTools?: readonly string[] | null;
  request: { toolName: string; input?: string; risk?: ApprovalRisk };
}) {
  return (
    !isGuardrailApprovalRisk(args.request.risk) &&
    isTrustedApproval({
      trustedTools: args.trustedTools,
      toolName: args.request.toolName,
      input: args.request.input,
    })
  );
}

/** Whether `entry` is still among the trusted tools (case-insensitive, as stored). */
export function hasTrustedToolEntry(args: {
  entries?: readonly string[] | null;
  entry: string;
}) {
  const key = args.entry.trim().toLowerCase();
  return Boolean(key) && (args.entries ?? []).some((entry) => entry.trim().toLowerCase() === key);
}

export function addTrustedToolEntry(args: {
  entries?: readonly string[] | null;
  entry: string;
}) {
  return normalizeTrustedToolEntries([...(args.entries ?? []), args.entry]);
}

export function removeTrustedToolEntry(args: {
  entries?: readonly string[] | null;
  entry: string;
}) {
  const removeKey = args.entry.trim().toLowerCase();
  return normalizeTrustedToolEntries(args.entries).filter(
    (entry) => entry.toLowerCase() !== removeKey,
  );
}

export function toClaudeAllowedToolsFromTrustedEntries(
  entries?: readonly string[] | null,
) {
  return normalizeTrustedToolEntries(entries).filter(
    (entry) => !isTrustedToolEntryForBash(entry),
  ).map((entry) => entry.slice(0, MAX_CLAUDE_ALLOWED_TOOL_LENGTH));
}
