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
    return `Bash: ${bashPrefix}`;
  }
  return entry.trim();
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
      return prefix ? command.startsWith(prefix) : false;
    });
  }

  return entries.some((entry) => {
    if (isTrustedToolEntryForBash(entry)) {
      return false;
    }
    return normalizeTrustedToolName(entry) === normalizedToolName;
  });
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
