import path from "node:path";

/**
 * Claude Auto mode support that sits beside the permission policy: when a
 * read-only built-in handed over by the CLI must still reach a person, and
 * whether Claude's own auto classifier is running for the session.
 */

/** The input key that names the file or directory a read-only built-in reads. */
const CLAUDE_READ_ONLY_TOOL_PATH_KEYS: Readonly<Record<string, string>> = {
  read: "file_path",
  notebookread: "notebook_path",
  grep: "path",
  glob: "path",
  ls: "path",
};
/** Grep and Glob search the working directory when they name no path. */
const CLAUDE_CWD_SEARCH_TOOL_NAMES = new Set(["grep", "glob"]);

function resolveClaudeToolPath(args: {
  value: string;
  cwd: string;
  homeDir: string;
}) {
  const trimmed = args.value.trim();
  const expanded =
    trimmed === "~"
      ? args.homeDir
      : trimmed.startsWith("~/")
        ? path.join(args.homeDir, trimmed.slice(2))
        : trimmed;
  return path.resolve(args.cwd, expanded);
}

function claudePathsOverlap(left: string, right: string) {
  const isWithin = (child: string, parent: string) => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
  };
  return isWithin(left, right) || isWithin(right, left);
}

/**
 * Whether a read-only built-in call must still reach a person in auto mode,
 * exactly as it did before auto mode auto-allowed reads. Each case is the
 * user's own narrower setting or the CLI saying a person must answer:
 *
 * - a user ask rule forced the prompt (`matchedAskRule`)
 * - the CLI marked the ask default-to-no (`defaultToNo`)
 * - the tool is in the turn's disallowed tools (the CLI normally removes it
 *   before it can be called; this keeps the fast path from ever outranking it)
 * - it reads, or searches a directory containing, a protected credential
 *   file. The sandbox credential list guards sandboxed commands only, so the
 *   fast path must not become a way around it.
 */
export function shouldKeepClaudeReadOnlyPrompt(args: {
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
  homeDir: string;
  matchedAskRule?: unknown;
  defaultToNo?: boolean;
  disallowedTools?: readonly string[];
  protectedCredentialFiles?: readonly string[];
}): boolean {
  const normalizedToolName = args.toolName.trim().toLowerCase();
  if (args.matchedAskRule || args.defaultToNo === true) {
    return true;
  }
  if (
    args.disallowedTools?.some(
      (rule) =>
        rule.trim().split("(")[0]?.trim().toLowerCase() === normalizedToolName,
    )
  ) {
    return true;
  }
  const protectedPaths = (args.protectedCredentialFiles ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) =>
      resolveClaudeToolPath({ value: entry, cwd: args.cwd, homeDir: args.homeDir }),
    );
  const pathKey = CLAUDE_READ_ONLY_TOOL_PATH_KEYS[normalizedToolName];
  if (protectedPaths.length === 0 || !pathKey) {
    return false;
  }
  const rawPath = args.input[pathKey];
  const targets: string[] = [];
  if (typeof rawPath === "string" && rawPath.trim()) {
    targets.push(
      resolveClaudeToolPath({ value: rawPath, cwd: args.cwd, homeDir: args.homeDir }),
    );
  } else if (CLAUDE_CWD_SEARCH_TOOL_NAMES.has(normalizedToolName)) {
    targets.push(path.resolve(args.cwd));
  } else {
    // A read with no recognizable target cannot be checked: keep asking.
    return true;
  }
  // An absolute or home-relative Glob pattern names its own search root.
  const pattern = args.input.pattern;
  if (
    normalizedToolName === "glob" &&
    typeof pattern === "string" &&
    /^(?:\/|~(?:\/|$))/.test(pattern.trim())
  ) {
    const staticPrefix = pattern.trim().split(/[*?[{]/)[0] ?? "";
    targets.push(
      resolveClaudeToolPath({
        value: staticPrefix || "/",
        cwd: args.cwd,
        homeDir: args.homeDir,
      }),
    );
  }
  return targets.some((target) =>
    protectedPaths.some((protectedPath) => claudePathsOverlap(target, protectedPath)),
  );
}

/**
 * Whether Claude's own auto classifier runs for this session, from what the
 * SDK reports and nothing else:
 *
 * - `unavailable`: the session's init message reports a mode other than the
 *   `auto` Stave asked for, so the CLI fell back
 * - `unavailable-model`: the model list carries `supportsAutoMode` (the CLI
 *   sets it only when true) and none of the rows for the session's model has it
 * - `unknown`: the SDK said nothing usable — no model list, a CLI that predates
 *   the flag, or no row for the session's model — so no notice is guessed
 */
export type ClaudeAutoModeAvailability =
  | "available"
  | "unavailable"
  | "unavailable-model"
  | "unknown";

function normalizeClaudeModelIdForAutoMode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\[1m\]$/, "")
    : "";
}

export function resolveClaudeAutoModeAvailability(args: {
  initPermissionMode?: string | null;
  initModel?: string | null;
  models?: ReadonlyArray<{
    value?: string;
    resolvedModel?: string;
    supportsAutoMode?: boolean;
  }> | null;
}): ClaudeAutoModeAvailability {
  if (args.initPermissionMode && args.initPermissionMode !== "auto") {
    return "unavailable";
  }
  const models = args.models ?? [];
  // The CLI emits the flag only for models that support auto mode, so a list
  // with no flag at all says nothing (an older CLI) rather than "unsupported".
  if (!models.some((model) => model.supportsAutoMode === true)) {
    return "unknown";
  }
  const sessionModel = normalizeClaudeModelIdForAutoMode(args.initModel);
  if (!sessionModel) {
    return "unknown";
  }
  const rows = models.filter(
    (model) =>
      normalizeClaudeModelIdForAutoMode(model.resolvedModel) === sessionModel ||
      normalizeClaudeModelIdForAutoMode(model.value) === sessionModel,
  );
  if (rows.length === 0) {
    return "unknown";
  }
  return rows.some((model) => model.supportsAutoMode === true)
    ? "available"
    : "unavailable-model";
}

/** The one notice a turn shows when Auto falls back to asking; null otherwise. */
export function describeClaudeAutoModeFallback(
  availability: ClaudeAutoModeAvailability,
): string | null {
  switch (availability) {
    case "unavailable-model":
      return "Auto isn't available for this model; Claude will ask before actions.";
    case "unavailable":
      return "Auto isn't available right now; Claude will ask before actions.";
    default:
      return null;
  }
}

type ClaudeInitializationSource = {
  initializationResult?: () => Promise<{
    models?: ReadonlyArray<{ value?: string; resolvedModel?: string; supportsAutoMode?: boolean }>;
  } | null | undefined>;
};

/**
 * One Auto turn's view of Claude's own classifier: fed the session's init
 * message, it yields the fallback notice once, at the first prompt. The model
 * list rides the initialize response the SDK already holds, so it is read
 * without delaying the stream.
 */
export function createClaudeAutoModeNotice() {
  let availability: ClaudeAutoModeAvailability = "unknown";
  let announced = false;
  return {
    observeInit(init: { permissionMode?: string | null; model?: string | null }, source?: ClaudeInitializationSource | null) {
      const base = { initPermissionMode: init.permissionMode, initModel: init.model };
      availability = resolveClaudeAutoModeAvailability(base);
      if (availability !== "unknown" || typeof source?.initializationResult !== "function") return;
      void source
        .initializationResult()
        .then((initialization) => {
          availability = resolveClaudeAutoModeAvailability({ ...base, models: initialization?.models });
        })
        .catch(() => undefined);
    },
    /** The notice to show before the first prompt, or null after it or when Auto works. */
    take(): string | null {
      if (announced) return null;
      const notice = describeClaudeAutoModeFallback(availability);
      if (notice) announced = true;
      return notice;
    },
  };
}
