import { createHash } from "node:crypto";
import { readDecisionReviews } from "./pull-request-watch-reader";
import { fetchPrContextIndex } from "./pr-context-runtime";
import type { ScmCommandRunner } from "./scm-runtime";
import type { TarsPublishRunner } from "./tars-publish";
import type { TarsPublication } from "../../src/lib/tars/publication";

/** Same authenticated, read-only gh readers as the general PR watch. Never read logs or post replies. */
export async function readTarsPrFeedback(publication: TarsPublication, cwd: string, run: TarsPublishRunner) {
  if (!publication.url || !publication.commit) return undefined;
  const runner: ScmCommandRunner = (request) =>
    run("gh", request.commandArgs ?? [], request.cwd ?? cwd);
  const index = await fetchPrContextIndex({ cwd, prUrl: publication.url, runCommand: runner });
  if (!index.ok || !index.index) throw new Error("Pull request comments are temporarily unavailable.");
  if (index.index.headSha !== publication.commit) return undefined;
  const result = await readDecisionReviews({ cwd, url: publication.url, run: runner, includeComments: true });
  if (!result.ok) throw new Error("Pull request reviews are temporarily unavailable.");
  const prior = publication.watch?.feedback;
  const seen = new Set(prior?.headSha === publication.commit ? prior.seen : []);
  const items = [
    ...index.index.threads.filter(t => !t.isResolved && !t.isOutdated).flatMap(thread => thread.comments
      .filter(c => !c.commitSha || c.commitSha === publication.commit).map(comment => ({
      id: comment.reviewId ? `review:${comment.reviewId}:changes` : `comment:${comment.id}`, requestedChanges: true,
      // i18n-ignore: model-facing, untrusted review evidence
      text: `${thread.path}:${thread.line ?? ""}: ${comment.body.slice(0, 2_000)}`,
    }))),
    ...result.reviews.filter(r => r.commitSha === publication.commit).map(review => ({
      id: `review:${review.id}:${review.state === "CHANGES_REQUESTED" ? "changes" : review.state}`, requestedChanges: review.state === "CHANGES_REQUESTED",
      // i18n-ignore: model-facing, untrusted review evidence
      text: `${review.author}: ${review.state}: ${review.body ?? ""}`,
    })),
  ];
  const fresh = items.filter(item => !seen.has(item.id));
  if (!fresh.length) return prior?.headSha === publication.commit ? prior : undefined;
  for (const item of fresh) seen.add(item.id);
  return { headSha: publication.commit, seen: [...seen].slice(-500),
    episode: createHash("sha256").update(`${publication.commit}:${fresh.map(i => i.id).sort().join(":")}`).digest("hex"),
    requestedChanges: fresh.some(item => item.requestedChanges),
    summary: fresh.map(item => item.text).join("\n").slice(0, 4_000) };
}
