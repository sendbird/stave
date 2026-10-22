import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InboxRow } from "@/components/layout/InboxRow";
import { ScriptEntryRow } from "@/components/layout/WorkspaceScriptsPanel";
import { RelativeTime } from "@/components/system/RelativeTime";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";

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

  test("a subagent's return", () => {
    const now = new Date();
    const html = renderToStaticMarkup(createElement(RelativeTime, { date: now.getTime() + AHEAD_MS, now, past: true }));
    expect(html).toContain("just now");
    expect(html).not.toContain("in 3h");
  });
});
