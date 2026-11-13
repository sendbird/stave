/**
 * The check commands a Tars run's read-only reviewer may run (user decision
 * D6, 2026-11-09): the repository's own test, lint and typecheck scripts,
 * nothing else. They are Claude permission rules added to a read-only
 * delegation that keeps its read-only sandbox, so a check can read and run but
 * still cannot write the workspace. Codex needs no rule: its read-only sandbox
 * already runs commands and refuses writes.
 *
 * Permission is not an instruction to run them all: the review stage tells
 * the reviewer to confirm the work's evidence and run only checks covering
 * the changed files (`TARS_REVIEW_CHECK_SCOPE`), with broader runs only when
 * that evidence is missing, failed or stale. Each rule therefore also admits
 * the script with file filters after `--` (and `bun test <files>`), so a
 * scoped run needs no wider rule.
 */

export type TarsPackageManager = "bun" | "npm" | "pnpm" | "yarn";

/** Script names a check may use: test, lint, typecheck and their `:`-scoped variants. */
const CHECK_SCRIPT = /^(?:test|lint|typecheck|type-check|check)(?::[A-Za-z0-9_.-]+)*$/;
/** A script whose name says it writes, deploys or drives a browser is never a check. */
const NOT_A_CHECK = /(?:fix|write|update|format|fmt|deploy|publish|release|e2e|watch|snapshot|migrate|install|clean)/i;
const MAX_RULES = 40;

export function tarsPackageManagerOf(args: { packageManagerField?: unknown; lockfiles: readonly string[] }): TarsPackageManager {
  const field = typeof args.packageManagerField === "string" ? args.packageManagerField.split("@")[0] : "";
  if (field === "bun" || field === "npm" || field === "pnpm" || field === "yarn") return field;
  if (args.lockfiles.some((name) => name === "bun.lock" || name === "bun.lockb")) return "bun";
  if (args.lockfiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (args.lockfiles.includes("yarn.lock")) return "yarn";
  return "npm";
}

/** The scripts in `scripts` that count as checks, sorted for a stable rule list. */
export function tarsCheckScripts(scripts: unknown): string[] {
  if (!scripts || typeof scripts !== "object") return [];
  return Object.entries(scripts as Record<string, unknown>)
    .filter(([name, command]) => typeof command === "string" && CHECK_SCRIPT.test(name) && !NOT_A_CHECK.test(name))
    .map(([name]) => name)
    .sort();
}

/**
 * Claude permission rules for those scripts. Each script gets its exact
 * command and the same command with arguments after `--`, never a bare prefix:
 * `Bash(bun run lint:*)` would also match a different script such as
 * `lint-and-deploy`. Claude checks every part of a chained command against the
 * rules, so `bun run lint && rm -rf x` is not covered by `bun run lint`.
 */
export function tarsCheckCommandRules(manager: TarsPackageManager, scripts: readonly string[]): string[] {
  const run = manager === "npm" ? "npm run" : manager === "yarn" ? "yarn run" : `${manager} run`;
  const rules = scripts.flatMap((script) => [`Bash(${run} ${script})`, `Bash(${run} ${script} -- :*)`]);
  // Bun's own test runner is what `bun test` invokes; it takes file filters.
  if (manager === "bun") rules.push("Bash(bun test)", "Bash(bun test :*)");
  if (manager === "npm" && scripts.includes("test")) rules.push("Bash(npm test)", "Bash(npm test -- :*)");
  return [...new Set(rules)].slice(0, MAX_RULES);
}
