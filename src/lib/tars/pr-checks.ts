import { z } from "zod";

export const TarsPrChecksSchema = z.object({
  state: z.enum(["pending", "passed", "failed", "none", "unavailable"]),
  failing: z.array(z.string().min(1).max(120)).max(10),
  checkedAt: z.iso.datetime(),
  headSha: z.string().regex(/^[0-9a-f]{7,64}$/).nullable(),
}).strict();
export type TarsPrChecks = z.infer<typeof TarsPrChecksSchema>;

/** Persisted scheduling and deduplication survive host restarts. */
export const TarsPrWatchSchema = z.object({
  startedAt: z.iso.datetime(), nextAt: z.iso.datetime(), polls: z.number().int().min(0),
  stopped: z.enum(["closed", "merged", "expired", "unavailable"]).nullable(),
  fixRounds: z.number().int().min(0).max(2),
  noticeAt: z.iso.datetime().optional(),
  rearmedBy: z.string().optional(),
  reviewHead: z.string().nullable().optional(),
  reviewChoice: z.enum(["ready", "keepDraft"]).optional(),
}).strict();

/** An option is an explicit decision; there is no planner action for making a PR ready. */
export const TarsPrReviewEffectSchema = z.object({
  kind: z.literal("prReview"), responsibilityId: z.string().min(1).max(256),
  headSha: z.string().regex(/^[0-9a-f]{7,64}$/), choice: z.enum(["ready", "keepDraft", "watch"]),
}).strict();

export const TarsPrReviewInputSchema = z.object({ decisionId: z.string().min(1).max(700) }).strict();

export const TARS_CI_FIX_ROUNDS = 2;

/** Parse only the documented gh JSON fields; unknown statuses never count as passing. */
export function parseTarsPrChecks(raw: unknown, checkedAt: string): {
  checks: TarsPrChecks; merged: boolean; closed: boolean; draft: boolean; branch: string;
} {
  const value = z.object({
    state: z.enum(["OPEN", "CLOSED", "MERGED"]), isDraft: z.boolean(), headRefName: z.string(),
    headRefOid: z.string().regex(/^[0-9a-f]{7,64}$/),
    statusCheckRollup: z.array(z.object({ name: z.string().optional(), context: z.string().optional(),
      status: z.string().optional(), conclusion: z.string().nullable().optional(), state: z.string().optional() })),
  }).parse(raw);
  const failing: string[] = [];
  let pending = false;
  for (const check of value.statusCheckRollup) {
    const state = (check.conclusion || check.state || check.status || "").toUpperCase();
    if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"].includes(state)) {
      const name = (check.name || check.context || "unknown").replace(/[\r\n\x00-\x1f]/g, " ").trim().slice(0, 120) || "unknown";
      if (!failing.includes(name) && failing.length < 10) failing.push(name);
    } else if (!["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)) pending = true;
  }
  return { checks: { state: failing.length ? "failed" : pending ? "pending" : value.statusCheckRollup.length ? "passed" : "none",
    failing, checkedAt, headSha: value.headRefOid }, merged: value.state === "MERGED", closed: value.state !== "OPEN", draft: value.isDraft, branch: value.headRefName };
}

/** A restarted monitoring window owns its own stopped notice, even on the same head. */
export function tarsPrWatchEpisode(head: string, startedAt?: string) { return `${head}:${startedAt ?? ""}`; }
