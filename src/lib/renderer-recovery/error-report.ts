/**
 * The "Copy error details" text for the renderer recovery screen. It is a
 * diagnostic report for bug reports, so it stays in English; everything in it
 * passes through `redactSensitiveText` before it reaches the clipboard.
 */

export type RendererFailureKind = "startup" | "render" | "chunk-load";

const MAX_CAUSE_DEPTH = 5;
const MAX_REPORT_CHARS = 20_000;
const REDACTED = "<redacted>";

/*
 * Paths under a user's home directory name the account. Keep the rest of the
 * path (it is what makes a stack useful) and replace only the account segment.
 * Windows profile folders may contain spaces, so that segment runs to the next
 * separator.
 */
const HOME_PATH_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/(\/Users\/)[^/\s:'"`)]+/g, "$1<user>"],
  [/(\/home\/)[^/\s:'"`)]+/g, "$1<user>"],
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n:'"`)]+/gi, "$1<user>"],
];

/*
 * Credentials that can show up in error messages: bearer headers, URL
 * userinfo, `name=value` pairs whose name says secret, and well-known token
 * shapes.
 */
const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
  [
    /\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|cookie|session[_-]?id|signature)[A-Za-z0-9_-]*)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}\]]+/gi,
    `$1$2${REDACTED}`,
  ],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bnpm_[A-Za-z0-9]{30,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
];

/** Replace home-directory account names and credentials in diagnostic text. */
export function redactSensitiveText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of HOME_PATH_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

interface DescribedError {
  title: string;
  stack: string | null;
}

function describeOne(value: unknown): DescribedError {
  if (value instanceof Error) {
    const title = value.message ? `${value.name}: ${value.message}` : value.name;
    // V8 stacks start with the same "Name: message" line; keep only the frames.
    const frames = value.stack?.startsWith(title)
      ? value.stack.slice(title.length).replace(/^\n/, "")
      : (value.stack ?? null);
    return { title, stack: frames || null };
  }
  if (typeof value === "string") return { title: value, stack: null };
  try {
    return { title: JSON.stringify(value) ?? String(value), stack: null };
  } catch {
    return { title: String(value), stack: null };
  }
}

/** The error, then each `cause` in order, stopping at cycles and a fixed depth. */
export function describeErrorChain(error: unknown): DescribedError[] {
  const chain: DescribedError[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (chain.length <= MAX_CAUSE_DEPTH) {
    if (typeof current === "object" && current !== null) {
      if (seen.has(current)) break;
      seen.add(current);
    }
    chain.push(describeOne(current));
    const cause =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
    if (cause === undefined) break;
    current = cause;
  }
  return chain;
}

export interface RendererErrorReportInput {
  error: unknown;
  kind: RendererFailureKind;
  appVersion: string | null;
  platform: string | null;
  userAgent: string | null;
  componentStack?: string | null;
  occurredAt: Date;
}

export function buildRendererErrorReport(input: RendererErrorReportInput): string {
  const lines = [
    "Stave renderer error",
    `Kind: ${input.kind}`,
    `Time: ${input.occurredAt.toISOString()}`,
    `App version: ${input.appVersion ?? "unknown"}`,
    `Platform: ${input.platform ?? "unknown"}`,
    `User agent: ${input.userAgent ?? "unknown"}`,
    "",
  ];
  describeErrorChain(input.error).forEach((entry, index) => {
    // The title already starts with the error's name ("TypeError: ...").
    lines.push(index === 0 ? entry.title : `Caused by: ${entry.title}`);
    if (entry.stack) lines.push(entry.stack);
  });
  const componentStack = input.componentStack?.trim();
  if (componentStack) {
    lines.push("", "Component stack:", componentStack);
  }
  const report = redactSensitiveText(lines.join("\n"));
  return report.length > MAX_REPORT_CHARS
    ? `${report.slice(0, MAX_REPORT_CHARS)}\n[truncated]`
    : report;
}
