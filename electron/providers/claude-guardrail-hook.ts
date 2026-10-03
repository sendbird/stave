import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";
import type { TurnGuardrailSpec, TurnPolicy } from "../../src/lib/policy/turn-policy";
import { shouldKeepClaudeReadOnlyPrompt } from "./claude-auto-mode";
import { extractClaudeBashCommand } from "./claude-permission-policy";
import { isNeverAutoApprovedStaveLocalMcpTool } from "./stave-local-mcp-approval";

/**
 * Stave's opt-in guardrails for Claude turns. Each one the user turned on
 * (Settings > Providers > Claude, `claudeGuardrails`; all off by default)
 * still stops an autonomous turn, and holds under Bypass too, because a
 * PreToolUse hook runs before the permission mode is consulted:
 *
 * - G1 a write outside the task's repository: the workspace, the repository's
 *   main checkout and every worktree of it (including the conventional
 *   `../.worktrees/<repo>` folder), temp dirs and tool caches stay allowed
 * - G2 reading or writing a protected credential path or env var
 * - G3 an irreversible remote effect: force-pushing a default or protected
 *   branch, deleting remote refs, releases or repos, publishing, `sudo`
 *
 * The hook answers `ask`, never `deny`: the call becomes an ordinary approval
 * the user answers. G4 (the agent's own questions) is the AskUserQuestion
 * hook in `claude-sdk-runtime.ts`.
 *
 * The Bash matcher is deliberately literal. It flags what a command names
 * outright and does not guess at variables, scripts or indirection; the
 * sandbox (when the user enabled it) is what bounds those.
 */

export const CLAUDE_GUARDRAIL_REASON_PREFIX = "Stave guardrail";

export interface ClaudeGuardrailHit {
  id: "G1" | "G2" | "G3";
  reason: string;
}

/** Well-known credential locations, protected on top of the user's own list. */
export const BASELINE_CREDENTIAL_PATHS = [
  "~/.ssh",
  "~/.aws",
  "~/.gnupg",
  "~/.netrc",
  "~/.git-credentials",
  "~/.npmrc",
  "~/.pypirc",
  "~/.docker/config.json",
  "~/.kube/config",
  "~/.azure",
  "~/.config/gcloud",
  "~/.config/gh/hosts.yml",
  "~/.codex/auth.json",
  "~/.claude/.credentials.json",
  "~/Library/Keychains",
] as const;

const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "trunk", "develop", "production"]);
const DEV_SINKS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"]);
const FILE_WRITE_TOOLS: Readonly<Record<string, string>> = {
  write: "file_path",
  edit: "file_path",
  multiedit: "file_path",
  notebookedit: "notebook_path",
};

export interface ClaudeGuardrailContext {
  spec: TurnGuardrailSpec;
  /**
   * Checkouts of the workspace's repository (main checkout and worktrees);
   * empty when unknown. `refresh` skips any cache, for a worktree just added.
   */
  repositoryRoots?: (root: string, options?: { refresh?: boolean }) => string[];
  /** The directory relative paths resolve against (the session's cwd). */
  cwd: string;
  homeDir?: string;
  /** Branch a bare `git push` targets; null when unknown (treated as protected). */
  currentBranch?: (cwd: string) => string | null;
  /** The repository's default branch, when it can be read. */
  defaultBranch?: (cwd: string) => string | null;
}

type ShellWord = { text: string; redirect: boolean };

/** Drops here-document bodies, which are data (commit messages, file contents), not commands. */
function stripHeredocBodies(command: string) {
  const lines = command.split("\n");
  const kept: string[] = [];
  let delimiter: string | null = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    kept.push(line);
    delimiter = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/)?.[2] ?? null;
  }
  return kept.join("\n");
}

/** Splits a command into simple-command segments. Quotes and escapes are honored; substitutions split. */
export function splitShellSegments(rawCommand: string): ShellWord[][] {
  const command = stripHeredocBodies(rawCommand);
  const segments: ShellWord[][] = [];
  let words: ShellWord[] = [];
  let current = "";
  let started = false;
  let quote: "'" | '"' | null = null;
  let redirectNext = false;
  const endWord = () => {
    if (started) words.push({ text: current, redirect: redirectNext });
    if (started) redirectNext = false;
    current = "";
    started = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
    redirectNext = false;
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && index + 1 < command.length) current += command[++index];
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\" && index + 1 < command.length) {
      current += command[++index];
      started = true;
    } else if (/\s/.test(char)) {
      if (char === "\n") endSegment();
      else endWord();
    } else if (char === ">") {
      // `2>`, `&>`: the fd prefix is not a word.
      if (/^(?:\d+|&)$/.test(current)) {
        current = "";
        started = false;
      }
      endWord();
      if (command[index + 1] === ">" || command[index + 1] === "|") index += 1;
      if (command[index + 1] === "&") {
        index += 1; // `>&2` duplicates a descriptor
        while (/[\d-]/.test(command[index + 1] ?? "")) index += 1;
        continue;
      }
      redirectNext = true;
    } else if (char === "$" && command[index + 1] === "(") {
      endSegment();
      index += 1;
    } else if (";&|()`".includes(char)) {
      endSegment();
    } else {
      current += char;
      started = true;
    }
  }
  endSegment();
  return segments;
}

function expandHome(value: string, homeDir: string): string | null {
  let expanded = value;
  if (expanded === "~" || expanded.startsWith("~/")) expanded = homeDir + expanded.slice(1);
  expanded = expanded.replace(/\$\{?HOME\}?(?=\/|$)/g, homeDir).replace(/\$\{?TMPDIR\}?(?=\/|$)/g, os.tmpdir());
  return expanded.includes("$") ? null : expanded;
}

function isWithin(child: string, parent: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function credentialPaths(spec: TurnGuardrailSpec, homeDir: string, cwd: string) {
  return [...BASELINE_CREDENTIAL_PATHS, ...spec.credentialFiles]
    .map((entry) => expandHome(entry.trim(), homeDir))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => path.resolve(cwd, entry));
}

function tempRoots() {
  return [...new Set([os.tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].map((root) => path.resolve(root)))];
}

/**
 * The folders a turn writes to without G1. Agents routinely carry work into a
 * sibling worktree, the main checkout or a worktree they create beside it, so
 * the boundary is the repository, not the one folder the task runs in:
 *
 * - the workspace root, and the folder holding its Stave worktrees
 *   (`<repo>/.stave/workspaces`) even when git cannot be read
 * - every checkout git reports for the repository (main checkout and worktrees)
 * - `<parent>/.worktrees/<repo>`, where the worktree PR flow puts new worktrees
 * - Claude's own per-project folder (auto memory) and common tool caches
 *
 * Other repositories, the home directory and the rest of the disk still stop.
 */
export function guardrailWriteRoots(
  root: string,
  context?: Pick<ClaudeGuardrailContext, "repositoryRoots" | "homeDir">,
  options?: { refresh?: boolean },
): string[] {
  const resolved = path.resolve(root);
  const roots = [resolved];
  // `git worktree list` names the main checkout first.
  const checkouts = (context?.repositoryRoots?.(resolved, options) ?? []).map((checkout) => path.resolve(checkout));
  const parts = resolved.split(path.sep);
  let mainCheckout = checkouts[0] ?? null;
  for (let index = parts.length - 3; index >= 0; index -= 1) {
    if (parts[index] === ".stave" && parts[index + 1] === "workspaces") {
      roots.push(parts.slice(0, index + 2).join(path.sep));
      mainCheckout ??= parts.slice(0, index).join(path.sep) || path.sep;
      break;
    }
  }
  roots.push(...checkouts);
  if (mainCheckout) {
    roots.push(mainCheckout, path.join(path.dirname(mainCheckout), ".worktrees", path.basename(mainCheckout)));
  }
  const homeDir = context?.homeDir ?? os.homedir();
  const claudeConfigDirs = [path.join(homeDir, ".claude"), process.env.CLAUDE_CONFIG_DIR?.trim()].filter((dir): dir is string => Boolean(dir));
  roots.push(
    ...claudeConfigDirs.flatMap((dir) => ["projects", "plans"].map((name) => path.join(path.resolve(dir), name))),
    path.join(homeDir, ".cache"),
    path.join(homeDir, "Library", "Caches"),
  );
  return [...new Set(roots)];
}

const guardrailEnabled = (spec: TurnGuardrailSpec, id: ClaudeGuardrailHit["id"]) => !spec.enabled || spec.enabled.includes(id);
const keepEnabled = (spec: TurnGuardrailSpec, hit: ClaudeGuardrailHit | null) => hit && guardrailEnabled(spec, hit.id) ? hit : null;

const HANDOFF_PLAN_SEGMENTS = [".stave", "context", "plans"];

function isStaveHandoffPlanPath(resolved: string) {
  const parts = resolved.split(path.sep);
  return parts.some((_, index) => HANDOFF_PLAN_SEGMENTS.every((segment, offset) => parts[index + offset] === segment));
}

function writeHit(target: string, context: ClaudeGuardrailContext, cwd: string): ClaudeGuardrailHit | null {
  const homeDir = context.homeDir ?? os.homedir();
  const expanded = expandHome(target, homeDir);
  if (!expanded || DEV_SINKS.has(expanded) || expanded.startsWith("/dev/fd/")) return null;
  const resolved = path.resolve(cwd, expanded);
  if (guardrailEnabled(context.spec, "G2") && credentialPaths(context.spec, homeDir, cwd).some((entry) => isWithin(resolved, entry))) {
    return { id: "G2", reason: `writes the protected credential path ${resolved}` };
  }
  if (!guardrailEnabled(context.spec, "G1")) return null;
  const allowed = (roots: string[]) => [...roots, ...tempRoots()].some((entry) => isWithin(resolved, entry));
  const writeRoots = guardrailWriteRoots(context.spec.root, context);
  if (allowed(writeRoots)) return null;
  // The `../.worktrees` folder itself, which worktree cleanup removes once it is empty.
  if (writeRoots.some((entry) => path.basename(path.dirname(entry)) === ".worktrees" && path.dirname(entry) === resolved)) return null;
  // A Stave handoff plan: the procedure writes it into the target workspace, which may be another repository's.
  if (isStaveHandoffPlanPath(resolved)) return null;
  // A worktree the turn added moments ago may not be in the cached list yet.
  if (context.repositoryRoots && allowed(guardrailWriteRoots(context.spec.root, context, { refresh: true }))) return null;
  return { id: "G1", reason: `writes ${resolved}, outside the workspace's repository ${writeRoots[0]}` };
}

const COMMAND_WRAPPERS = new Set(["command", "exec", "nohup", "time", "nice", "env", "builtin"]);

function commandWords(words: ShellWord[]) {
  const plain = words.filter((word) => !word.redirect).map((word) => word.text);
  let start = 0;
  while (start < plain.length) {
    const word = plain[start]!;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || COMMAND_WRAPPERS.has(path.basename(word))) start += 1;
    else if (start > 0 && path.basename(plain[start - 1]!) === "env" && word.startsWith("-")) start += 1;
    else break;
  }
  return plain.slice(start);
}

const positional = (args: string[]) => args.filter((arg) => !arg.startsWith("-"));

function protectedBranch(branch: string | null, context: ClaudeGuardrailContext, cwd: string) {
  if (!branch) return true;
  const name = branch.replace(/^refs\/heads\//, "");
  if (PROTECTED_BRANCH_NAMES.has(name) || name.startsWith("release/")) return true;
  const fallback = context.defaultBranch?.(cwd);
  return Boolean(fallback && fallback === name);
}

function gitPushHit(args: string[], context: ClaudeGuardrailContext, cwd: string): ClaudeGuardrailHit | null {
  const shortFlags = args.filter((arg) => /^-[A-Za-z]+$/.test(arg)).join("");
  const has = (flag: string) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  const refspecs = positional(args).slice(1);
  if (has("--delete") || shortFlags.includes("d") || refspecs.some((spec) => spec.startsWith(":"))) {
    return { id: "G3", reason: "deletes a remote branch or tag" };
  }
  if (has("--mirror") || has("--prune")) return { id: "G3", reason: "can delete remote refs (--mirror/--prune)" };
  const forced = has("--force") || has("--force-with-lease") || has("--force-if-includes") || shortFlags.includes("f");
  const forcedSpecs = refspecs.filter((spec) => forced || spec.startsWith("+"));
  if (!forced && forcedSpecs.length === 0) return null;
  if (has("--all") || has("--branches")) return { id: "G3", reason: "force-pushes every branch" };
  const targets = forcedSpecs.length > 0
    ? forcedSpecs.map((spec) => {
        const destination = spec.replace(/^\+/, "").split(":").at(-1) ?? "";
        return destination === "HEAD" || destination === "" ? context.currentBranch?.(cwd) ?? null : destination;
      })
    : [context.currentBranch?.(cwd) ?? null];
  const hit = targets.find((branch) => protectedBranch(branch, context, cwd));
  return hit === undefined ? null : { id: "G3", reason: `force-pushes ${hit ?? "an unknown branch"}, a default or protected branch` };
}

function segmentG3(words: string[], context: ClaudeGuardrailContext, cwd: string): ClaudeGuardrailHit | null {
  const [head, ...args] = words;
  if (!head) return null;
  const command = path.basename(head);
  // `gh -R owner/repo release delete`: a flag's value is not a verb.
  const verbs = positional(args.filter((arg, index) => !["-R", "--repo"].includes(args[index - 1] ?? "")));
  if (command === "sudo" || command === "doas") return { id: "G3", reason: "runs a command as another user (sudo)" };
  if (["npm", "pnpm", "bun"].includes(command) && ["publish", "unpublish"].includes(verbs[0] ?? "")) {
    return { id: "G3", reason: `${command} ${verbs[0]} publishes to a package registry` };
  }
  if (command === "yarn" && (verbs[0] === "publish" || (verbs[0] === "npm" && verbs[1] === "publish"))) {
    return { id: "G3", reason: "yarn publish publishes to a package registry" };
  }
  if ((command === "cargo" && verbs[0] === "publish") || (command === "gem" && verbs[0] === "push") ||
      (command === "twine" && verbs[0] === "upload") || (command === "poetry" && verbs[0] === "publish")) {
    return { id: "G3", reason: `${command} ${verbs[0]} publishes a package` };
  }
  if (command === "gh") {
    if (verbs[0] === "release" && ["create", "delete", "delete-asset", "upload", "edit"].includes(verbs[1] ?? "")) {
      return { id: "G3", reason: `gh release ${verbs[1]} changes a published release` };
    }
    if (verbs[0] === "repo" && verbs[1] === "delete") return { id: "G3", reason: "gh repo delete deletes a repository" };
    const method = args.findIndex((arg) => arg === "-X" || arg === "--method");
    if (verbs[0] === "api" && (args[method + 1]?.toUpperCase() === "DELETE" || args.some((arg) => /^(?:-XDELETE|--method=DELETE)$/i.test(arg)))) {
      return { id: "G3", reason: "gh api DELETE deletes a remote resource" };
    }
  }
  if (command === "git") {
    let index = 0;
    while (index < args.length && args[index]!.startsWith("-")) index += ["-C", "-c"].includes(args[index]!) ? 2 : 1;
    if (args[index] === "push") return gitPushHit(args.slice(index + 1), context, cwd);
  }
  return null;
}

const ALL_ARGS_WRITE = new Set(["rm", "rmdir", "unlink", "touch", "mkdir", "truncate", "shred", "tee"]);
const AFTER_FIRST_WRITE = new Set(["chmod", "chown", "chgrp"]);
const DESTINATION_WRITE = new Set(["cp", "mv", "ln", "install", "rsync"]);

/**
 * The files `sed -i` rewrites. The script is the first operand unless `-e` or
 * `-f` supplied it, and BSD's `-i ''` suffix is not an operand, so a script
 * such as `/pattern/d` is never read as a path.
 */
function sedInPlaceFiles(args: string[]): string[] {
  const operands: string[] = [];
  let scriptGiven = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (/^-[A-Za-z]*[ef]$/.test(arg) || arg === "--expression" || arg === "--file") {
      scriptGiven = true;
      index += 1;
    } else if (/^--(?:expression|file)=/.test(arg)) {
      scriptGiven = true;
    } else if (arg === "-i" && args[index + 1] === "") {
      index += 1;
    } else if (!arg.startsWith("-")) {
      operands.push(arg);
    }
  }
  return scriptGiven ? operands : operands.slice(1);
}

function writeTargets(words: string[]): string[] {
  const [head, ...args] = words;
  if (!head) return [];
  const command = path.basename(head);
  const operands = positional(args);
  if (ALL_ARGS_WRITE.has(command)) return operands;
  if (AFTER_FIRST_WRITE.has(command)) return operands.slice(1);
  if (DESTINATION_WRITE.has(command)) return operands.length > 1 ? operands.slice(-1) : [];
  if (command === "dd") return args.filter((arg) => arg.startsWith("of=")).map((arg) => arg.slice(3));
  if (command === "sed" && args.some((arg) => /^-[A-Za-z]*i/.test(arg) || arg.startsWith("--in-place"))) return sedInPlaceFiles(args);
  return [];
}

function bashCredentialHit(segment: ShellWord[], words: string[], context: ClaudeGuardrailContext, cwd: string): ClaudeGuardrailHit | null {
  const homeDir = context.homeDir ?? os.homedir();
  const protectedPaths = credentialPaths(context.spec, homeDir, cwd);
  for (const word of segment) {
    const text = word.text.trim();
    if (!/^(?:~|\.|\/|\$\{?HOME)/.test(text) && !text.includes("/")) continue;
    const expanded = expandHome(text.replace(/^[A-Za-z_]+=/, ""), homeDir);
    if (!expanded) continue;
    const resolved = path.resolve(cwd, expanded);
    if (protectedPaths.some((entry) => isWithin(resolved, entry))) {
      return { id: "G2", reason: `touches the protected credential path ${resolved}` };
    }
  }
  const envVars = context.spec.credentialEnvVars;
  if (envVars.length === 0) return null;
  const head = path.basename(words[0] ?? "");
  if ((head === "env" || head === "printenv" || head === "set") && words.length === 1) {
    return { id: "G2", reason: "prints the environment, which holds protected variables" };
  }
  const named = envVars.find((name) =>
    segment.some((word) => new RegExp(`\\$\\{?${name}\\b`).test(word.text)) ||
    (head === "printenv" && words.includes(name)));
  return named ? { id: "G2", reason: `reads the protected environment variable ${named}` } : null;
}

function evaluateBash(command: string, context: ClaudeGuardrailContext): ClaudeGuardrailHit | null {
  let cwd = context.cwd;
  for (const segment of splitShellSegments(command)) {
    const words = commandWords(segment);
    if (path.basename(words[0] ?? "") === "cd" && words[1]) {
      const next = expandHome(words[1], context.homeDir ?? os.homedir());
      if (next) cwd = path.resolve(cwd, next);
      continue;
    }
    const hit =
      keepEnabled(context.spec, segmentG3(words, context, cwd)) ??
      keepEnabled(context.spec, bashCredentialHit(segment, words, context, cwd)) ??
      [...segment.filter((word) => word.redirect).map((word) => word.text), ...writeTargets(words)]
        .map((target) => writeHit(target, context, cwd))
        .find((entry) => entry !== null) ?? null;
    if (hit) return hit;
  }
  return null;
}

/** The guardrail one Claude tool call crosses, or null when it may run as the turn's mode decides. */
export function evaluateClaudeGuardrail(args: {
  toolName: string;
  input: Record<string, unknown>;
  context: ClaudeGuardrailContext;
}): ClaudeGuardrailHit | null {
  const tool = args.toolName.trim().toLowerCase();
  const pathKey = FILE_WRITE_TOOLS[tool];
  if (pathKey) {
    const target = args.input[pathKey];
    return typeof target === "string" && target.trim() ? writeHit(target.trim(), args.context, args.context.cwd) : null;
  }
  if (tool === "bash") {
    const command = extractClaudeBashCommand(args.input);
    return command ? evaluateBash(command, args.context) : null;
  }
  if (!["read", "notebookread", "grep", "glob", "ls"].includes(tool) || !guardrailEnabled(args.context.spec, "G2")) return null;
  return shouldKeepClaudeReadOnlyPrompt({
    toolName: tool, input: args.input, cwd: args.context.cwd, homeDir: args.context.homeDir ?? os.homedir(),
    protectedCredentialFiles: [...BASELINE_CREDENTIAL_PATHS, ...args.context.spec.credentialFiles],
  }) ? { id: "G2", reason: "reads a protected credential path" } : null;
}

function gitOutput(cwd: string, gitArgs: string[]) {
  try {
    return execFileSync("git", gitArgs, { cwd, encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

const REPOSITORY_ROOTS_TTL_MS = 10_000;
const repositoryRootsCache = new Map<string, { at: number; roots: string[] }>();

/**
 * The checkouts of `root`'s repository, main checkout first, from
 * `git worktree list`. Cached briefly because the hook runs before every tool
 * call; a write the cached list does not cover re-reads it, so a worktree the
 * turn just added is covered at once.
 */
function liveRepositoryRoots(root: string, options?: { refresh?: boolean }): string[] {
  const cached = repositoryRootsCache.get(root);
  if (!options?.refresh && cached && Date.now() - cached.at < REPOSITORY_ROOTS_TTL_MS) return cached.roots;
  const roots = (gitOutput(root, ["worktree", "list", "--porcelain"]) ?? "")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter(Boolean);
  repositoryRootsCache.set(root, { at: Date.now(), roots });
  return roots;
}

/** Live git lookups: branches when a force push needs its target, checkouts for G1. */
export const gitBranchLookups = {
  repositoryRoots: liveRepositoryRoots,
  currentBranch: (cwd: string) => {
    const branch = gitOutput(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return branch && branch !== "HEAD" ? branch : null;
  },
  defaultBranch: (cwd: string) =>
    gitOutput(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])?.replace(/^[^/]+\//, "") ?? null,
};

export function createClaudeGuardrailPreToolUseHook(spec: TurnGuardrailSpec): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const toolInput = input.tool_input && typeof input.tool_input === "object" ? input.tool_input as Record<string, unknown> : {};
    const hit = evaluateClaudeGuardrail({
      toolName: input.tool_name, input: toolInput,
      context: { spec, cwd: input.cwd || spec.root, ...gitBranchLookups },
    });
    if (!hit) return {};
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `${CLAUDE_GUARDRAIL_REASON_PREFIX} ${hit.id}: this ${hit.reason}.`,
      },
    };
  };
}

/** Whether the turn runs any guardrail. The resolver always sets the list; absent means all three. */
function hasEnabledGuardrails(policy: TurnPolicy) {
  return !policy.guardrails.enabled || policy.guardrails.enabled.length > 0;
}

/** Registers the guardrail hook first and lets sandboxed Bash run without asking on autonomous turns. */
export function withClaudeTurnGuardrails(options: Options, policy: TurnPolicy | undefined): Options {
  if (!policy || policy.autonomy === "read-only") return options;
  const sandbox = policy.autonomy === "autonomous" && options.sandbox?.enabled && options.sandbox.autoAllowBashIfSandboxed === undefined
    ? { ...options.sandbox, autoAllowBashIfSandboxed: true } : options.sandbox;
  if (!hasEnabledGuardrails(policy)) return { ...options, ...(sandbox ? { sandbox } : {}) };
  return {
    ...options,
    ...(sandbox ? { sandbox } : {}),
    hooks: {
      ...options.hooks,
      PreToolUse: [{ hooks: [createClaudeGuardrailPreToolUseHook(policy.guardrails)] }, ...(options.hooks?.PreToolUse ?? [])],
    },
  };
}

/** The guardrail a call that reached Stave's permission callback crosses, if any. */
export function resolveClaudeTurnGuardrail(args: {
  policy: TurnPolicy | undefined;
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
  decisionReason?: string;
}): ClaudeGuardrailHit | null {
  if (!args.policy || args.policy.autonomy === "read-only" || !hasEnabledGuardrails(args.policy)) return null;
  if (args.decisionReason?.startsWith(CLAUDE_GUARDRAIL_REASON_PREFIX)) {
    return { id: (args.decisionReason.match(/G[123]/)?.[0] ?? "G3") as ClaudeGuardrailHit["id"], reason: args.decisionReason };
  }
  return evaluateClaudeGuardrail({
    toolName: args.toolName, input: args.input,
    context: { spec: args.policy.guardrails, cwd: args.cwd, ...gitBranchLookups },
  });
}

/**
 * Whether Stave answers a handed-over call itself on an autonomous turn: every
 * call except guardrails (checked by the caller), the user's own ask rules,
 * questions, and Stave tools that answer another task's prompt.
 */
export function shouldAllowClaudeAutonomousCall(args: {
  policy: TurnPolicy | undefined;
  toolName: string;
  matchedAskRule?: unknown;
}) {
  return (
    args.policy?.autonomy === "autonomous" &&
    !args.matchedAskRule &&
    args.toolName.trim().toLowerCase() !== "askuserquestion" &&
    !isNeverAutoApprovedStaveLocalMcpTool(args.toolName)
  );
}
