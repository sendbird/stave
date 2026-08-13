import type { CraneStaveJobV1 } from "./contract";
import { getCraneTeamKey } from "./project-mapping";

/**
 * Crane issue keys (`CRN-42`) are shaped exactly like Jira issue keys, so a
 * Crane-dispatched task used to leak the Crane number into branch names, PR
 * titles and the Jira section of the Information panel. For company products the
 * Jira key is the identifier that matters, so everything user-visible resolves
 * through here.
 *
 * Resolution order, most to least authoritative:
 *   1. `job.issue.links[]` with `rel: "jira"` — the declared link, and the only
 *      channel Crane is expected to use. Structured, extensible to other
 *      systems, and read in array order.
 *   2. A Jira issue URL found in the issue title/description/instruction.
 *   3. A bare Jira key found in the same text, excluding the Crane issue's own
 *      team prefix so `TFE-94` is never mistaken for Jira.
 *
 * (2) and (3) are not a Crane channel: they are a best effort for issues where
 * a human pasted the Jira link into the body and Crane has no tracker link to
 * declare.
 */

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]}]+/g;

export const CRANE_JIRA_LINK_REL = "jira";

export type CraneJiraReferenceSource =
  "crane_link" | "issue_url" | "issue_text";

export interface CraneJiraReference {
  key: string;
  /** Empty when only a bare key was found and no canonical URL is known. */
  url: string;
  source: CraneJiraReferenceSource;
}

type CraneJobLike = Pick<CraneStaveJobV1, "issue" | "instruction">;

function isJiraHost(hostname: string) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return host.endsWith("atlassian.net") || host.includes("jira");
}

function firstJiraKeyIn(value: string, excludedPrefixes: Set<string>) {
  for (const match of value.matchAll(JIRA_KEY_PATTERN)) {
    const key = match[1]?.toUpperCase();
    if (!key) {
      continue;
    }
    const prefix = key.slice(0, key.lastIndexOf("-"));
    if (excludedPrefixes.has(prefix)) {
      continue;
    }
    return key;
  }
  return null;
}

function collectExcludedPrefixes(job: CraneJobLike) {
  const excluded = new Set<string>();
  const teamKey = getCraneTeamKey(job.issue.key);
  if (teamKey) {
    excluded.add(teamKey.toUpperCase());
  }
  return excluded;
}

/**
 * Whether a URL points at a Jira issue. Host-gated on purpose: the issue-key
 * pattern alone false-positives on Crane task URLs and on branch names embedded
 * in arbitrary links.
 */
export function extractJiraIssueUrlReference(
  value: string,
): { key: string; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (!isJiraHost(parsed.hostname)) {
    return null;
  }
  const haystack = `${decodeURIComponent(parsed.pathname)} ${decodeURIComponent(
    parsed.search,
  )}`;
  const key = firstJiraKeyIn(haystack, new Set());
  return key ? { key, url: value.trim() } : null;
}

/**
 * Read the first `rel: "jira"` entry of `issue.links`. The key may be stated
 * outright or derived from the URL, and the URL is host-checked before it is
 * surfaced as a Jira link, so a mislabelled entry degrades to key-only rather
 * than filing a non-Jira address in the panel's Jira section.
 */
function jiraLinkReference(
  links: CraneJobLike["issue"]["links"],
): { key: string; url: string } | null {
  for (const link of links ?? []) {
    if (link.rel.trim().toLowerCase() !== CRANE_JIRA_LINK_REL) {
      continue;
    }
    const fromUrl = extractJiraIssueUrlReference(link.url ?? "");
    const key = link.key?.trim().toUpperCase() || fromUrl?.key;
    if (!key) {
      continue;
    }
    return { key, url: fromUrl?.url ?? "" };
  }
  return null;
}

/** Resolve the Jira issue a Crane job is really about, if any. */
export function resolveCraneJiraReference(
  job: CraneJobLike,
): CraneJiraReference | null {
  const link = jiraLinkReference(job.issue.links);
  if (link) {
    return { ...link, source: "crane_link" };
  }

  const excluded = collectExcludedPrefixes(job);
  const text = [job.issue.title, job.issue.description, job.instruction]
    .filter(Boolean)
    .join("\n");

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?…]+$/, "");
    const reference = extractJiraIssueUrlReference(url);
    if (
      reference &&
      !excluded.has(reference.key.slice(0, reference.key.lastIndexOf("-")))
    ) {
      return { ...reference, source: "issue_url" };
    }
  }

  const bareKey = firstJiraKeyIn(text, excluded);
  return bareKey ? { key: bareKey, url: "", source: "issue_text" } : null;
}

/**
 * The issue key that should drive user-visible naming (branch, task title, PR
 * title): the linked Jira key when the job has one, else the Crane key.
 */
export function resolveCranePrimaryIssueKey(job: CraneJobLike): string {
  return resolveCraneJiraReference(job)?.key || job.issue.key.trim();
}

function slugifyIssueKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Default branch name proposed in the Crane dispatch approval dialog. */
export function buildCraneDispatchBranchName(job: CraneJobLike): string {
  return `crane/${slugifyIssueKey(resolveCranePrimaryIssueKey(job)) || "issue"}`;
}

/** Task title for a locally approved Crane dispatch. */
export function buildCraneDispatchTaskTitle(job: CraneJobLike): string {
  const jira = resolveCraneJiraReference(job);
  const prefix = jira ? jira.key : `Crane ${job.issue.key.trim()}`;
  return `${prefix}: ${job.issue.title.trim()}`;
}
