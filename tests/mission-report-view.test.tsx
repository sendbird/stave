import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionReportView } from "../src/components/missions/MissionReportView";
import type { MissionReport } from "../src/lib/missions/report";
import { formatMissionReportMarkdown } from "../src/lib/missions/report-markdown";

const REPORT: MissionReport = {
  missionId: "mission-1",
  workflowName: "Request → PR",
  assignment: "Add CSV export to the billing page.",
  outcome: "stopped",
  reason: "The lead task was archived.",
  startedAt: "2026-09-26T10:00:00.000Z",
  endedAt: "2026-09-26T10:34:00.000Z",
  turnCount: 11,
  stages: [
    {
      stageId: "verify",
      title: "Verify",
      kind: "ai",
      status: "completed",
      attempts: 1,
      summary: "Checks pass.",
      decisions: [{ decision: "Container query", reason: "Keeps SSR stable." }],
      evidence: [
        { label: "Visual check at 375px", kind: "observation", source: "agent" },
        { label: "Typecheck", kind: "check", command: "bun run typecheck", source: "stave" },
      ],
      detail: null,
      plan: null,
    },
  ],
  acceptanceCriteria: [
    { text: "Table scrolls below 768px", status: "met" },
    { text: "Safari 16", status: "unverified" },
  ],
  links: [{ label: "Opened draft PR #612", url: "https://github.com/acme/app/pull/612", source: "stave" }],
  leftBehind: ["Branch feat/billing is pushed."],
};

test("the report leads with outcome and figures, then decisions, open items and what was left", () => {
  const html = renderToStaticMarkup(createElement(MissionReportView, { report: REPORT }));
  expect(html).toContain("Mission stopped");
  expect(html).toMatch(/Duration<\/dt><dd[^>]*>34m/);
  expect(html).toMatch(/Turns<\/dt><dd[^>]*>11/);
  expect(html).toMatch(/Verified<\/dt><dd[^>]*>1/);
  expect(html).toContain("The lead task was archived.");
  expect(html).toContain("Opened draft PR #612");
  expect(html).toContain("Container query");
  expect(html).toContain("Safari 16");
  expect(html).toContain("Not verified");
  expect(html).not.toContain("Table scrolls below 768px");
  expect(html).toContain("Branch feat/billing is pushed.");
  // Verified by Stave comes first.
  expect(html.indexOf("Typecheck")).toBeLessThan(html.indexOf("Visual check at 375px"));
  expect(html).toContain("Copy Markdown");
});

test("stale or failed checks are never counted or exported as verified", () => {
  const report: MissionReport = { ...REPORT, stages: [{ ...REPORT.stages[0]!, evidence: [
    { label: "Old check", kind: "check", source: "stave", outcome: "succeeded", exitCode: 0, freshness: "stale" },
    { label: "Failed check", kind: "check", source: "provider", outcome: "failed", exitCode: 7, freshness: "unknown" },
  ] }] };
  const html = renderToStaticMarkup(createElement(MissionReportView, { report }));
  expect(html).toMatch(/Verified<\/dt><dd[^>]*>0/);
  expect(html).toContain("Stave result");
  expect(html).toContain("Provider result");
  const markdown = formatMissionReportMarkdown(report);
  expect(markdown).not.toContain("Verified by Stave: Old check");
  expect(markdown).toContain("Exit 0 · Changed since this check");
  expect(markdown).toContain("Failed · Exit 7 · Current work unverified");
});

test("under the Mission panel the report leaves the outcome and open items to the panel header", () => {
  const html = renderToStaticMarkup(createElement(MissionReportView, { report: REPORT, context: "panel" }));
  expect(html).not.toContain("Mission stopped");
  expect(html).not.toContain("The lead task was archived.");
  expect(html).not.toContain("Safari 16");
  expect(html).toContain("Container query");
  expect(html).toContain("Copy Markdown");
});

test("the Markdown copy carries the same story", () => {
  const markdown = formatMissionReportMarkdown(REPORT);
  expect(markdown).toContain("## Mission stopped · 34m · 11 turns");
  expect(markdown).toContain("**Request → PR:** Add CSV export to the billing page.");
  expect(markdown).toContain("- **Verify** — completed: Checks pass.");
  expect(markdown).toContain("  - Decision: Container query — Keeps SSR stable.");
  expect(markdown).toContain("  - Verified by Stave: Typecheck (`bun run typecheck`)");
  expect(markdown).toContain("- [x] Table scrolls below 768px");
  expect(markdown).toContain("- [?] Safari 16");
  expect(markdown).toContain("- [Opened draft PR #612](https://github.com/acme/app/pull/612) — Verified by Stave");
  expect(markdown).toContain("### Left behind\n- Branch feat/billing is pushed.");
});


test("the report footer says how much the mission needed you", async () => {
  const { computeMissionMetrics } = await import("../src/lib/missions/report");
  const { describeMissionMetrics } = await import("../src/lib/missions/report-markdown");
  const at = (minute: number) => new Date(Date.parse("2026-09-26T10:00:00.000Z") + minute * 60_000).toISOString();
  const event = (kind: string, minute: number) =>
    ({ id: `${kind}-${minute}`, missionId: "m", sequence: minute, kind, idempotencyKey: null, detail: {}, createdAt: at(minute) }) as never;
  const metrics = computeMissionMetrics({
    providerId: "codex",
    events: [
      event("mission-started", 0),
      event("stage-completed", 3),
      event("sign-off", 15),
      event("user-turn", 16),
      event("nudge", 20),
      event("stage-completed", 30),
      event("sign-off", 34),
    ],
  });
  expect(metrics).toMatchObject({
    providerId: "codex",
    userReplies: 1,
    nudges: 1,
    stuckStages: 0,
    signOffs: 2,
    signOffWaitAverageMs: 8 * 60_000,
    signOffWaitLongestMs: 12 * 60_000,
  });
  expect(describeMissionMetrics(metrics)).toBe(
    "1 reply from you · 1 reminder to report · 0 stuck · 2 sign-offs waited 8m on average (longest 12m)",
  );
  const html = renderToStaticMarkup(createElement(MissionReportView, { report: { ...REPORT, metrics } }));
  expect(html).toContain("2 sign-offs waited 8m on average");
  expect(formatMissionReportMarkdown({ ...REPORT, metrics })).toContain("_1 reply from you");
});

test("a one-stage run's report shows the agent's plan, and the Markdown copy checks it off", () => {
  const report: MissionReport = {
    ...REPORT,
    stages: [{
      ...REPORT.stages[0]!,
      plan: [
        { content: "Reproduce", status: "completed" },
        { content: "Add the export", status: "pending" },
      ],
    }],
  };
  const html = renderToStaticMarkup(createElement(MissionReportView, { report, agentOrigin: true }));
  expect(html).toContain("Plan · 1 of 2 done");
  expect(html).toContain("Add the export");
  const markdown = formatMissionReportMarkdown(report);
  expect(markdown).toContain("  - [x] Reproduce");
  expect(markdown).toContain("  - [ ] Add the export");
});

test("a run with a workflow counts its stages; a one-stage run does not", () => {
  const twoStages: MissionReport = {
    ...REPORT,
    stages: [REPORT.stages[0]!, { ...REPORT.stages[0]!, stageId: "ship", title: "Ship", status: "pending" }],
  };
  expect(renderToStaticMarkup(createElement(MissionReportView, { report: twoStages, agentOrigin: true }))).toContain("1/2");
  expect(renderToStaticMarkup(createElement(MissionReportView, { report: REPORT, agentOrigin: true }))).not.toContain(">Stages<");
});
