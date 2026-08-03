import { createHash } from "node:crypto";
import type {
  McpConfigProvider,
  McpConfigScope,
  McpConfigTransport,
  McpHeaderEnvBinding,
  McpServerConfigDraft,
  McpServerConfigMutationPreview,
  McpServerConfigTarget,
} from "../../src/lib/providers/mcp-config.types";

const ENV_REFERENCE_PATTERN = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const BEARER_REFERENCE_PATTERN = /^Bearer\s+\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/i;
const DIAGNOSTIC_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const DIAGNOSTIC_BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const DIAGNOSTIC_SECRET_ASSIGNMENT_PATTERN =
  /(["']?)(authorization|cookie|credential|password|private[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key)(["']?)(\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi;

export const PROTECTED_MCP_SERVER_NAMES = new Set([
  "stave-local",
  "stave-local-mcp",
]);

export function asMcpRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function cloneMcpJsonRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function getMcpConfigRevision(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getMcpConfigSnapshotId(args: McpServerConfigTarget) {
  return [args.provider, args.scope, encodeURIComponent(args.name)].join(":");
}

export function isProtectedMcpServerName(name: string) {
  return PROTECTED_MCP_SERVER_NAMES.has(name.trim().toLowerCase());
}

export function parseEnvReference(value: unknown) {
  if (typeof value !== "string") return null;
  return value.match(ENV_REFERENCE_PATTERN)?.[1] ?? null;
}

export function parseBearerEnvReference(value: unknown) {
  if (typeof value !== "string") return null;
  return value.match(BEARER_REFERENCE_PATTERN)?.[1] ?? null;
}

export function toEnvReference(name: string) {
  return `\${${name}}`;
}

export function getSafeHeaderEnvBindings(args: {
  headers: Record<string, unknown> | null;
  bearerHeader?: boolean;
}) {
  const bindings: McpHeaderEnvBinding[] = [];
  let bearerTokenEnvVar: string | undefined;
  let hiddenValueCount = 0;
  for (const [name, value] of Object.entries(args.headers ?? {})) {
    const bearerEnv = args.bearerHeader ? parseBearerEnvReference(value) : null;
    if (name.toLowerCase() === "authorization" && bearerEnv) {
      bearerTokenEnvVar = bearerEnv;
      continue;
    }
    const envVar = parseEnvReference(value);
    if (envVar) {
      bindings.push({ name, envVar });
    } else {
      hiddenValueCount += 1;
    }
  }
  return { bindings, bearerTokenEnvVar, hiddenValueCount };
}

export function sanitizeMcpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return { value: undefined, redacted: false, hiddenValueCount: 0 };
  }
  try {
    const parsed = new URL(value);
    const redacted = Boolean(
      parsed.username || parsed.password || parsed.search || parsed.hash,
    );
    if (!redacted) {
      return { value, redacted: false, hiddenValueCount: 0 };
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return {
      value: parsed.toString(),
      redacted: true,
      hiddenValueCount: 1,
    };
  } catch {
    return { value: undefined, redacted: true, hiddenValueCount: 1 };
  }
}

function sanitizeDiagnosticUrl(rawUrl: string) {
  let candidate = rawUrl;
  let trailing = "";
  while (/[).\],]$/.test(candidate)) {
    trailing = candidate.slice(-1) + trailing;
    candidate = candidate.slice(0, -1);
  }
  const sanitized = sanitizeMcpUrl(candidate);
  if (!sanitized.redacted) return rawUrl;
  return `${sanitized.value ?? "[redacted URL]"}[redacted]${trailing}`;
}

export function sanitizeMcpDiagnosticText(value: unknown, maxChars = 2_000) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!text) return "";
  const sanitized = text
    .replace(DIAGNOSTIC_URL_PATTERN, sanitizeDiagnosticUrl)
    .replace(DIAGNOSTIC_BEARER_PATTERN, "Bearer [redacted]")
    .replace(
      DIAGNOSTIC_SECRET_ASSIGNMENT_PATTERN,
      (
        _match,
        leadingQuote: string,
        key: string,
        trailingQuote: string,
        separator: string,
      ) => `${leadingQuote}${key}${trailingQuote}${separator}[redacted]`,
    );
  return sanitized.length > maxChars
    ? `${sanitized.slice(0, Math.max(0, maxChars - 1))}…`
    : sanitized;
}

export function inferMcpTransport(
  value: Record<string, unknown>,
): McpConfigTransport {
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  if (type === "sse") return "sse";
  if (type === "http" || type === "streamable_http") return "http";
  return typeof value.url === "string" ? "http" : "stdio";
}

export function formatMcpProviderLabel(provider: McpConfigProvider) {
  return provider === "claude-code" ? "Claude" : "Codex";
}

export function formatMcpScopeLabel(scope: McpConfigScope) {
  switch (scope) {
    case "user":
      return "User";
    case "project":
      return "Project";
    case "local":
      return "Local project";
  }
}

export function buildMcpMutationPreview(args: {
  operation: McpServerConfigMutationPreview["operation"];
  revision: string;
  target?: McpServerConfigTarget;
  draft?: McpServerConfigDraft;
  hiddenValueCount?: number;
}) {
  const subject = args.draft ?? args.target;
  if (!subject) {
    throw new Error("MCP mutation requires a target server.");
  }
  const provider = formatMcpProviderLabel(subject.provider);
  const scope = formatMcpScopeLabel(subject.scope);
  const changes = [`Provider: ${provider}`, `Scope: ${scope}`];
  if (args.draft) {
    changes.push(`Transport: ${args.draft.transport}`);
    if (args.draft.transport === "stdio") {
      changes.push(
        `Command arguments: ${args.draft.args?.length ?? "preserve"}`,
      );
      changes.push(
        `Inherited environment variables: ${args.draft.envVars.length}`,
      );
    } else {
      changes.push(
        `Remote URL: ${args.draft.url ? "replace" : "preserve existing"}`,
      );
      changes.push(
        `Environment-backed headers: ${
          args.draft.headerEnvBindings.length +
          (args.draft.bearerTokenEnvVar ? 1 : 0)
        }`,
      );
    }
    if (args.target && args.target.name !== args.draft.name) {
      changes.push(`Rename: ${args.target.name} → ${args.draft.name}`);
    }
  }
  const hiddenValueCount = args.hiddenValueCount ?? 0;
  const warnings = hiddenValueCount
    ? [
        `${hiddenValueCount} existing sensitive or opaque value${hiddenValueCount === 1 ? " is" : "s are"} hidden and will be preserved when possible.`,
      ]
    : [];
  const verb =
    args.operation === "create"
      ? "Add"
      : args.operation === "update"
        ? "Update"
        : "Delete";
  return {
    operation: args.operation,
    revision: args.revision,
    title: `${verb} ${subject.name}`,
    changes,
    warnings,
  } satisfies McpServerConfigMutationPreview;
}

export function assertMcpDraftSupported(draft: McpServerConfigDraft) {
  if (draft.provider === "codex" && draft.scope !== "user") {
    throw new Error("Codex MCP editing currently supports user scope only.");
  }
  if (draft.provider === "codex" && draft.transport === "sse") {
    throw new Error("Codex does not support creating SSE MCP servers.");
  }
  if (isProtectedMcpServerName(draft.name)) {
    throw new Error(
      "The Stave Local MCP entry is managed by its dedicated settings control.",
    );
  }
  if (draft.transport === "stdio" && !draft.command?.trim()) {
    throw new Error("A command is required for a stdio MCP server.");
  }
  if (draft.transport !== "stdio" && draft.url !== undefined) {
    const parsed = new URL(draft.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Remote MCP URLs must use HTTP or HTTPS.");
    }
  }
}
