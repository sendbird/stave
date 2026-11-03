import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "../src/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildReviewRecheckPrompt, describeReviewFindingsSummary, formatSelectedReviewFindings,
  parseReviewFindings, reviewFindingsToRecheck, summarizeReviewFindings,
  type ReviewFindingsReport,
} from "../src/lib/reviews/review-findings";
import { parseReviewFindingsForPrompt, readReviewRecheckFindings } from "../src/lib/reviews/review-recheck-context";
import { ReviewFindingsPanel } from "../src/components/session/composer-shelf/ReviewFindingsPanel";
import { describeReviewShelfFindings, describeReviewShelfLine } from "../src/components/session/composer-shelf/composer-shelf.utils";
import type { ReviewShelfItem } from "../src/lib/reviews/review-task";

const originals: ReviewFindingsReport = {
  verdict: "request-changes", previous: null,
  findings: ["F1", "F2", "F3"].map((id) => ({
    id, severity: "major", title: `Problem ${id}`, file: "src/a.ts", line: 1, detail: "Still wrong", fix: null,
  })),
};
const prompt = buildReviewRecheckPrompt({ originalPrompt: "Review this workspace", report: originals });
const block = (previous?: unknown[], findings: unknown[] = []) => "```stave-review-findings\n" +
  JSON.stringify({ verdict: "approve", ...(previous === undefined ? {} : { previous }), findings }) + "\n```";
const parse = (previous?: unknown[], findings: unknown[] = []) => {
  const result = parseReviewFindingsForPrompt(block(previous, findings), prompt);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.report;
};

describe("re-check request coverage", () => {
  test("duplicate IDs cannot inflate the fixed count; conflicts remain unchecked", () => {
    const report = parse([
      { id: "F1", status: "resolved" }, { id: "F1", status: "resolved" },
      { id: "F2", status: "resolved" }, { id: "F2", status: "unresolved" },
      { id: "F3", status: "unresolved" },
    ]);
    expect(report.previous?.map(({ id, status }) => [id, status])).toEqual([
      ["F1", "resolved"], ["F2", "unchecked"], ["F3", "unresolved"],
    ]);
    expect(describeReviewFindingsSummary(summarizeReviewFindings(report))).toBe("1 of 3 fixed · 1 unchecked");
  });

  test("partial and absent previous lists retain every requested ID", () => {
    expect(parse([{ id: "F1", status: "resolved" }]).previous?.map(({ id, status }) => [id, status]))
      .toEqual([["F1", "resolved"], ["F2", "unchecked"], ["F3", "unchecked"]]);
    for (const report of [parse(), parse([])]) {
      expect(summarizeReviewFindings(report).previous?.unchecked).toBe(3);
      expect(describeReviewFindingsSummary(summarizeReviewFindings(report))).toBe("0 of 3 fixed · 3 unchecked");
    }
  });

  test("duplicate rows beyond the finding limit cannot hide a later conflicting check", () => {
    const report = parse([
      ...Array.from({ length: 50 }, () => ({ id: "F1", status: "resolved" })),
      { id: "F1", status: "unresolved" }, { id: "F2", status: "resolved" }, { id: "F3", status: "resolved" },
    ]);
    expect(report.previous?.[0]?.status).toBe("unchecked");
    expect(summarizeReviewFindings(report).previous).toEqual({ resolved: 2, unresolved: 0, outdated: 0, unchecked: 1 });
  });

  test("all-invalid statuses and unknown IDs cannot become No findings or count as fixed", () => {
    const report = parse([{ id: "F1", status: "done" }, { id: "F999", status: "resolved" }, { status: "resolved" }]);
    expect(summarizeReviewFindings(report).previous).toEqual({ resolved: 0, unresolved: 0, outdated: 0, unchecked: 3 });
    expect(report.previousWarnings).toHaveLength(2);
    expect(report.previous?.some((check) => check.id === "F999")).toBe(false);
    expect(parseReviewFindings(block([{ id: "bad id!", status: "resolved" }]))).toEqual({ ok: false, reason: "invalid" });
  });

  test("outdated is separate from fixed, and a supposedly fixed finding repeated as open is unchecked", () => {
    const report = parse([
      { id: "F1", status: "outdated" }, { id: "F2", status: "resolved" }, { id: "F3", status: "resolved" },
    ], [{ id: "F2", severity: "major", title: "Still open" }]);
    expect(summarizeReviewFindings(report).previous).toEqual({ resolved: 1, unresolved: 0, outdated: 1, unchecked: 1 });
    expect(describeReviewFindingsSummary(summarizeReviewFindings(report)))
      .toBe("1 of 3 fixed · 1 outdated · 1 unchecked");
  });

  test("unchecked originals can be checked again while selected findings remain response-only", () => {
    const report = parse([{ id: "F1", status: "resolved" }]);
    expect(report.findings).toEqual([]);
    expect(formatSelectedReviewFindings({ report, findingIds: ["F2"] })).toBeNull();
    expect(reviewFindingsToRecheck(report).map((finding) => finding.id)).toEqual(["F2", "F3"]);
    const next = buildReviewRecheckPrompt({ originalPrompt: prompt, report });
    const context = readReviewRecheckFindings(next);
    expect(context?.ok && context.findings.map((finding) => finding.id)).toEqual(["F2", "F3"]);
  });

  test("a malformed re-check request fails safe, while a normal first review keeps its behavior", () => {
    const badPrompt = prompt.replace('"id":"F1"', '"id":"F2"');
    expect(parseReviewFindingsForPrompt(block([]), badPrompt)).toEqual({ ok: false, reason: "invalid" });
    const first = parseReviewFindingsForPrompt(block([]), "Review the working tree");
    expect(first.ok && first.report.previous).toBeNull();
    expect(first.ok && describeReviewFindingsSummary(summarizeReviewFindings(first.report))).toBe("No findings");
  });

  test("a new finding without an ID cannot reuse an earlier N ID on a second re-check", () => {
    const earlier = { ...originals, findings: [{ ...originals.findings[0]!, id: "N1" }] };
    const secondPrompt = buildReviewRecheckPrompt({ originalPrompt: prompt, report: earlier });
    const result = parseReviewFindingsForPrompt(block([{ id: "N1", status: "resolved" }], [{ title: "New issue" }]), secondPrompt);
    expect(result.ok && result.report.findings[0]?.id).not.toBe("N1");
    expect(result.ok && summarizeReviewFindings(result.report).fresh).toBe(1);
    expect(result.ok && result.report.previous?.[0]?.status).toBe("resolved");
  });

  test("the panel exposes unchecked and outdated states, and the shelf cannot show completion", () => {
    const report = parse([{ id: "F1", status: "resolved" }, { id: "F2", status: "outdated" }]);
    const findings = { ok: true as const, report };
    const html = renderToStaticMarkup(createElement(ReviewFindingsPanel, {
      findings, attachedFindingIds: null, onAttachSelected: () => {}, onRecheck: () => {}, recheckBusy: false,
    }));
    expect(html).toContain("1 of 3 fixed · 1 outdated · 1 unchecked");
    expect(html).toContain(">Outdated<");
    expect(html).toContain(">Unchecked<");
    expect(html).toContain("Check fixes");
    const shelf = describeReviewShelfFindings(findings);
    expect(shelf).toMatchObject({ recheck: true, incomplete: true, blocking: true });
    const item = { status: "ready", child: { requestedModel: "model" } } as ReviewShelfItem;
    expect(describeReviewShelfLine({ item, now: 0, findings: shelf })).toMatchObject({ label: "Fix checks incomplete", tone: "danger" });
  });
});

describe("review findings panel copy", () => {
  afterEach(() => {
    applyAppLocale("en");
  });

  const renderPanel = (report: ReviewFindingsReport) =>
    renderToStaticMarkup(createElement(ReviewFindingsPanel, {
      findings: { ok: true as const, report }, attachedFindingIds: null,
      onAttachSelected: () => {}, onRecheck: null, recheckBusy: false,
    }));
  const report: ReviewFindingsReport = {
    verdict: "request-changes",
    previous: [{ id: "F0", status: "unresolved", note: null }],
    findings: [
      { id: "F1", severity: "critical", title: "A", file: null, line: null, detail: null, fix: null },
      { id: "F2", severity: "major", title: "B", file: null, line: null, detail: null, fix: null },
      { id: "F3", severity: "minor", title: "C", file: null, line: null, detail: null, fix: null },
    ],
  };

  test("severity and re-check state are words, and the attach count reads as one sentence", () => {
    const html = renderPanel(report);
    expect(html).toContain(">Critical<");
    expect(html).toContain(">Major<");
    expect(html).toContain(">Minor<");
    expect(html).toContain(">Unresolved<");
    expect(html).toContain("Attach 3 of 3");
    expect(html).not.toContain("Attach3");
  });

  test("Korean shows translated severity, state and a natural attach order", () => {
    applyAppLocale("ko");
    const html = renderPanel(report);
    for (const raw of [">critical<", ">major<", ">minor<", ">unresolved<"]) expect(html).not.toContain(raw);
    expect(html).toContain(">심각<");
    expect(html).toContain(">중요<");
    expect(html).toContain(">경미<");
    expect(html).toContain(">미해결<");
    expect(html).toContain("3개 중 3개 첨부");
  });
});
