/**
 * Branch names for the workspace Tars creates for one work unit.
 *
 * The planner proposes a name that follows the repository's branch naming
 * rule (the same rule a workspace kickoff uses). The proposal is model text,
 * so the host keeps only git-safe characters and always appends a short
 * suffix derived from the work unit's request id (8 hex). The suffix keeps the name
 * stable across retries (a lost creation acknowledgement reconciles to the
 * same workspace) and unique, so a Tars workspace can never attach to a
 * branch or workspace the user already has.
 */

/** Stated to the planner and enforced on the proposal. */
export const TARS_BRANCH_NAME_MAX_CHARS = 80;
/** Used when the repository saves no rule; matches the workspace kickoff default. */
export const TARS_DEFAULT_BRANCH_NAMING_RULE =
  "Use a short Conventional Commits-style prefix such as feat/, fix/, refactor/, docs/, test/, or chore/ followed by a lowercase kebab-case description.";
const SUFFIX_CHARS = 8;
/** The suffix and its separator. */
export const TARS_BRANCH_SUFFIX_CHARS = SUFFIX_CHARS + 1;

/** FNV-1a, enough to separate work units; not a security boundary. */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(SUFFIX_CHARS, "0");
}

/** Lowercase kebab words from free text; empty when nothing usable remains. */
function slug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
}

/** One path segment without `..`, repeated `-`, edge `.`/`-` or a `.lock` ending. */
function cleanSegment(segment: string): string {
  let next = segment.replace(/\.{2,}/g, ".").replace(/-{2,}/g, "-");
  // Repeat: removing one `.lock` or edge character can expose another.
  for (let previous = ""; previous !== next;) {
    previous = next;
    next = next.replace(/^[.-]+|[.-]+$/g, "").replace(/\.lock$/i, "");
  }
  return next;
}

/**
 * Keeps a proposal within `git check-ref-format` for a branch: ASCII letters,
 * digits, `.`, `_`, `-` and `/` separators, no empty, dot-led or `.lock`
 * segments, no `..`, `@{` or leading `-`. Returns "" when nothing remains.
 */
export function sanitizeTarsBranchName(value: string): string {
  const segments = value.trim()
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .split("/")
    .map(cleanSegment)
    .filter(Boolean);
  let name = segments.join("/");
  // Truncation can end a segment on `.lock` or an edge character again.
  if (name.length > TARS_BRANCH_NAME_MAX_CHARS) name = name.slice(0, TARS_BRANCH_NAME_MAX_CHARS).split("/").map(cleanSegment).filter(Boolean).join("/");
  return /^head$/i.test(name) ? "" : name;
}

/**
 * The branch for one admitted work unit: the planner's proposal when it is
 * usable, otherwise `tars/<title words>`, then `-<suffix>` from the request id.
 */
export function buildTarsBranchName(args: { proposed?: string | null; title: string; requestId: string }): string {
  const base = sanitizeTarsBranchName(args.proposed ?? "") || `tars/${slug(args.title) || "work"}`;
  return `${base}-${shortHash(args.requestId)}`;
}
