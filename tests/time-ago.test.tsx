import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InboxRow } from "@/components/layout/InboxRow";
import { WorkspaceResumeBrief } from "@/components/layout/WorkspaceResumeBrief";
import { ScriptEntryRow } from "@/components/layout/WorkspaceScriptsPanel";
import { RunHistoryRow } from "@/components/session/TaskResultReviews";
import { describeReturnSummary } from "@/components/session/return-summary/return-summary.utils";
import { RelativeTime } from "@/components/system/RelativeTime";
import { Accordion } from "@/components/ui/accordion";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { emptyResumeBriefFields } from "@/lib/workspace-resume-brief";

const AHEAD_MS = 3 * 60 * 60_000;

/**
 * Something that already happened never reads as the future. When the clock
 * moves back after a script finishes, or another machine stamps an event a
 * little ahead of this one, the time reads "just now", not "in 3h".
 */
describe("a past event stamped ahead of the clock reads just now", () => {
  test("a script's completion", () => {
    const html = renderToStaticMarkup(createElement(ScriptEntryRow, {
      scriptId: "dev", scriptKind: "action", label: "Dev", description: "", targetLabel: "", orbitEnabled: false,
      state: { running: false, log: "", exitCode: 0, startedAt: Date.now() - 1_000, endedAt: Date.now() + AHEAD_MS },
      lensAvailable: false, onOpenOrbitUrlInLens: async () => {}, onRun: () => {}, onStop: () => {}, onClearLog: () => {},
      selected: false, onInspect: () => {},
    }));
    expect(html).toContain(">just now<");
    expect(html).not.toContain("in 3h");
  });

  test("an inbox row", () => {
    const entry = {
      id: "item-1", item: null, notifications: [], kind: "user_input", tier: "needs-you",
      title: "Add CSV export", detail: null, repositoryPath: null, repositoryName: null,
      workspaceId: "ws-1", workspaceName: "main", taskId: "task-1",
      at: new Date(Date.now() + AHEAD_MS).toISOString(), unread: false, error: false,
    } as unknown as FleetInboxEntry;
    const html = renderToStaticMarkup(createElement(InboxRow, { entry, triggerId: "row-1", triggerLabel: "Add CSV export", onActivate: () => {} }));
    expect(html).toContain(">just now<");
  });

  test("a saved output", () => {
    const result = {
      id: "result-1", repositoryPath: "/tmp/project", repositoryName: "Project", workspaceId: "workspace",
      workspaceName: "Workspace", taskId: "task", taskTitle: "Task", turnId: "turn", outcome: "completed" as const,
      summary: "Done.", createdAt: new Date(Date.now() + AHEAD_MS).toISOString(), reviewedAt: null,
    };
    const html = renderToStaticMarkup(createElement(Accordion, {}, createElement(RunHistoryRow, {
      result, expanded: false, busy: false, disabled: false, onReview: () => {}, onFollowUp: () => {},
    })));
    expect(html).toMatch(/<time[^>]*>just now<\/time>/);
  });

  test("a workspace's shared instructions", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceResumeBrief, {
      workspaceId: "w",
      brief: { ...emptyResumeBriefFields(), instructions: "Run the tests.", updatedAt: new Date(Date.now() + AHEAD_MS).toISOString(), sourceTaskId: null },
    }));
    expect(html).toContain("Updated just now");
    expect(html).not.toContain("in 3h");
  });

  test("a subagent's return", () => {
    const now = new Date();
    const html = renderToStaticMarkup(createElement(RelativeTime, { date: now.getTime() + AHEAD_MS, now, past: true }));
    expect(html).toContain("just now");
    expect(html).not.toContain("in 3h");
  });

  test("a return summary's last turn, in the short form the other surfaces use", () => {
    const now = Date.now();
    const stopLine = (at: string) => describeReturnSummary({
      decision: null,
      changes: { turns: 0, files: 0, steps: 0 },
      stop: { kind: "finished", at },
      next: { kind: "continue" },
    }, now).find((line) => line.id === "stop")?.text;
    expect(stopLine(new Date(now + AHEAD_MS).toISOString())).toBe("Finished its last turn just now.");
    expect(stopLine(new Date(now - 2 * 60 * 60_000).toISOString())).toBe("Finished its last turn 2h ago.");
  });
});
