import { describe, expect, test } from "bun:test";
import {
  REVIEW_FINDINGS_FENCE,
  buildReviewFindingsInstructions,
  buildReviewRecheckPrompt,
  describeReviewFindingsSummary,
  formatSelectedReviewFindings,
  parseReviewFindings,
  stripReviewFindingsBlock,
  summarizeReviewFindings,
  type ReviewFindingsReport,
} from "../src/lib/reviews/review-findings";
import { buildAttachedTaskSection } from "../src/lib/task-context/attached-task-context";
import { buildReviewTaskPrompt } from "../src/lib/reviews/review-task";
import type { ChatMessage } from "../src/types/chat";

function block(json: unknown, fence = "```") {
  return `${fence}${REVIEW_FINDINGS_FENCE}\n${typeof json === "string" ? json : JSON.stringify(json)}\n${fence}`;
}

const REPORT = {
  verdict: "request-changes",
  findings: [
    { id: "F1", severity: "minor", title: "Rename helper", file: "src/a.ts", line: 3 },
    { id: "F2", severity: "critical", title: "Offset not validated", file: "src/users.ts", line: 42, detail: "Negative offset reaches the query.", fix: "Clamp to 0." },
    { id: "F3", severity: "major", title: "Missing test", file: null, line: null },
  ],
};

const REPLY = `Two issues block this.\n\n${block(REPORT)}\n`;

describe("parsing review findings", () => {
  test("reads the block, ranks by severity and keeps the prose apart", () => {
    const parsed = parseReviewFindings(REPLY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.verdict).toBe("request-changes");
    expect(parsed.report.findings.map((finding) => finding.id)).toEqual(["F2", "F3", "F1"]);
    expect(parsed.report.previous).toBeNull();
    expect(stripReviewFindingsBlock(REPLY)).toBe("Two issues block this.");
  });

  test("fails safe: a missing or malformed block is never read as no findings", () => {
    expect(parseReviewFindings("No findings.")).toEqual({ ok: false, reason: "missing" });
    expect(parseReviewFindings(block("{not json"))).toEqual({ ok: false, reason: "invalid" });
    expect(parseReviewFindings(block({ verdict: "maybe", findings: [] }))).toEqual({ ok: false, reason: "invalid" });
    expect(parseReviewFindings(block({ verdict: "approve" }))).toEqual({ ok: false, reason: "invalid" });
    expect(parseReviewFindings(null)).toEqual({ ok: false, reason: "missing" });
  });

  test("odd fields are coerced one by one instead of costing the whole report", () => {
    const parsed = parseReviewFindings(
      block({
        verdict: "approve-with-changes",
        findings: [
          { id: "x".repeat(30), severity: "blocker", title: "t".repeat(300), line: "42" },
          { severity: "minor", title: "", detail: "Only a detail" },
          { severity: "minor", title: "Zero line", line: 0 },
        ],
        previous: [{ id: "F1", status: "done" }, { id: "F2", status: "resolved" }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [first, second, third] = parsed.report.findings;
    expect(first).toMatchObject({ id: "N1", severity: "major", line: 42 });
    expect(first!.title).toHaveLength(200);
    expect(second).toMatchObject({ title: "Only a detail" });
    expect(third).toMatchObject({ title: "Zero line", line: null });
    expect(parsed.report.findings).toHaveLength(3);
    expect(parsed.report.previous).toEqual([
      { id: "F1", status: "unchecked", note: "The reply did not provide a valid check status." },
      { id: "F2", status: "resolved", note: null },
    ]);
  });

  test("unreadable findings cannot turn a report into an approval or hide a blocker", () => {
    const incomplete = { id: "F1", severity: "critical" };
    for (const findings of [[incomplete], [...REPORT.findings, incomplete]]) {
      expect(parseReviewFindings(block({ verdict: "approve", findings }))).toEqual({
        ok: false, reason: "invalid",
      });
    }
    expect(parseReviewFindings(block({ verdict: "approve", findings: [] })))
      .toMatchObject({ ok: true, report: { findings: [] } });
  });

  test("only the block that ends the reply counts; CRLF and unclosed earlier blocks are fine", () => {
    const example = block(REPORT);
    expect(parseReviewFindings(`Quoting the format:\n${example}\nBut I found nothing to report.`)).toEqual({
      ok: false,
      reason: "missing",
    });
    const crlf = `Answer.\r\n${block({ verdict: "approve", findings: [] }).replace(/\n/g, "\r\n")}\r\n`;
    expect(parseReviewFindings(crlf)).toMatchObject({ ok: true, report: { verdict: "approve" } });
    expect(stripReviewFindingsBlock(crlf)).toBe("Answer.");
    const unclosed = `\`\`\`${REVIEW_FINDINGS_FENCE}\n{broken\n\nLater:\n${block({ verdict: "approve", findings: [] })}`;
    expect(parseReviewFindings(unclosed)).toMatchObject({ ok: true });
  });

  test("the last block wins, longer fences work, and ids stay unique", () => {
    const text = [
      block({ verdict: "approve", findings: [] }),
      "Corrected:",
      block(
        {
          verdict: "approve-with-changes",
          findings: [
            { id: "F1", severity: "major", title: "A" },
            { id: "F1", severity: "major", title: "B" },
            { id: "bad id!", severity: "minor", title: "C" },
          ],
        },
        "````",
      ),
    ].join("\n");
    const parsed = parseReviewFindings(text);
    expect(parsed.ok && parsed.report.findings.map((finding) => finding.id)).toEqual(["F1", "F1-2", "F3"]);
  });

  test("a re-check carries the status of each earlier finding", () => {
    const parsed = parseReviewFindings(
      block({
        verdict: "approve-with-changes",
        previous: [
          { id: "F1", status: "resolved" },
          { id: "F2", status: "unresolved", note: "Still unclamped" },
          { id: "F3", status: "outdated" },
        ],
        findings: [{ severity: "major", title: "New blocker" }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const summary = summarizeReviewFindings(parsed.report);
    expect(summary.previous).toEqual({ resolved: 1, unresolved: 1, outdated: 1, unchecked: 0 });
    expect(describeReviewFindingsSummary(summary)).toBe("1 of 3 fixed · 1 outdated · 1 new");
  });

  test("an empty previous list is still a first review, and longer closing fences are fine", () => {
    const parsed = parseReviewFindings(
      block({ verdict: "approve-with-changes", previous: [], findings: [{ severity: "minor", title: "A" }] }),
    );
    expect(parsed.ok && parsed.report.previous).toBeNull();
    expect(parsed.ok && parsed.report.findings[0]!.id).toBe("F1");
    expect(parsed.ok && describeReviewFindingsSummary(summarizeReviewFindings(parsed.report))).toBe("1 finding");
    const longerClose = `\`\`\`${REVIEW_FINDINGS_FENCE}\n${JSON.stringify({ verdict: "approve", findings: [] })}\n\`\`\`\`\n`;
    expect(parseReviewFindings(longerClose)).toMatchObject({ ok: true });
  });

  test("a re-check repeats unresolved findings by id, and only the rest count as new", () => {
    const parsed = parseReviewFindings(
      block({
        verdict: "request-changes",
        previous: [
          { id: "F1", status: "resolved" },
          { id: "F2", status: "unresolved" },
        ],
        findings: [{ id: "F2", severity: "major", title: "Still open" }],
      }),
    );
    expect(parsed.ok && describeReviewFindingsSummary(summarizeReviewFindings(parsed.report))).toBe("1 of 2 fixed");
    expect(parsed.ok && parsed.report.findings.map((finding) => finding.id)).toEqual(["F2"]);
  });
});

describe("summaries and selection", () => {
  const report = (parseReviewFindings(REPLY) as { ok: true; report: ReviewFindingsReport }).report;

  test("counts findings and names critical ones", () => {
    expect(describeReviewFindingsSummary(summarizeReviewFindings(report))).toBe("3 findings · 1 critical");
    expect(
      describeReviewFindingsSummary(summarizeReviewFindings({ verdict: "approve", findings: [], previous: null })),
    ).toBe("No findings");
  });

  test("formats only the chosen findings with their location and fix", () => {
    const text = formatSelectedReviewFindings({ report, findingIds: ["F2"] })!;
    expect(text).toContain("review verdict: request-changes");
    expect(text).toContain("selected findings (1 of 3):");
    expect(text).toContain("- [critical] F2 Offset not validated (src/users.ts:42)");
    expect(text).toContain("fix: Clamp to 0.");
    expect(text).not.toContain("Rename helper");
    expect(formatSelectedReviewFindings({ report, findingIds: ["nope"] })).toBeNull();
  });

  test("an attached review narrowed to findings sends those, else its whole reply", () => {
    const messages = [{ id: "a", role: "assistant", model: "m", providerId: "codex", content: REPLY, parts: [] }] as ChatMessage[];
    const narrowed = buildAttachedTaskSection({
      attachment: { taskId: "t", title: "Review", scope: "latest-reply", findingIds: ["F2", "F3"] },
      messages,
    })!;
    expect(narrowed).toContain("selected findings (2 of 3):");
    expect(narrowed).not.toContain("Rename helper");
    const unreadable = buildAttachedTaskSection({
      attachment: { taskId: "t", title: "Review", scope: "latest-reply", findingIds: ["F2"] },
      messages: [{ ...messages[0]!, content: "Plain answer without a block." }],
    })!;
    expect(unreadable).toContain("latest reply:\nPlain answer without a block.");
    const later = buildAttachedTaskSection({
      attachment: { taskId: "t", title: "Review", scope: "latest-reply", findingIds: ["F2"], findingsReplyId: "old" },
      messages,
    })!;
    expect(later).toContain("latest reply:");
    expect(later).not.toContain("selected findings");
    expect(
      buildAttachedTaskSection({
        attachment: { taskId: "t", title: "Review", scope: "latest-reply", findingIds: ["F2"], findingsReplyId: "a" },
        messages,
      }),
    ).toContain("selected findings (1 of 3):");
  });
});

describe("prompts", () => {
  test("every review prompt asks for the findings block", () => {
    const prompt = buildReviewTaskPrompt({ target: "working-tree", focuses: [] })!;
    expect(prompt).toContain(`\`\`\`${REVIEW_FINDINGS_FENCE}`);
    expect(prompt).toContain("critical (breaks correctness, security or data)");
    expect(buildReviewFindingsInstructions({ recheck: true })).toContain("previous: one entry per earlier finding id");
  });

  test("a re-check quotes the earlier findings and instructions as data", () => {
    const report = (parseReviewFindings(REPLY) as { ok: true; report: ReviewFindingsReport }).report;
    const prompt = buildReviewRecheckPrompt({ originalPrompt: "Review ```this``` scope.", report });
    expect(prompt).toContain("Do not review from scratch.");
    expect(prompt).toContain('"id":"F2"');
    expect(prompt).toContain("````text\nReview ```this``` scope.\n````");
    expect(prompt).toContain("previous: one entry per earlier finding id");
  });
});
