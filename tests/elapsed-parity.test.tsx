import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetQuietDuration, FleetTaskActivityLine } from "@/components/layout/FleetTaskActivityLine";
import { InboxRow } from "@/components/layout/InboxRow";
import { formatTurnActivityElapsedSeconds } from "@/components/session/turn-activity.utils";
import { agentRunDuration } from "@/lib/agent-runs/agent-run-status";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { formatProviderTurnElapsedDuration, type ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";

const SPAN_MS = 2 * 60_000 + 10_000;

/**
 * One elapsed value, two minutes and ten seconds, as each surface that shows
 * it reads it. Fleet, the Run panel, the turn's own status and the inbox the
 * bell shares with Fleet use one vocabulary, so the same moment never reads
 * "2m" in one place, "2m 10s" in another and "2 minutes ago" in a third.
 */
describe("the same elapsed value reads the same everywhere", () => {
  test("Fleet task rows", () => {
    const now = Date.now();
    const activity = {
      startedAt: now - SPAN_MS,
      lastEventAt: now - SPAN_MS,
      completedAt: null,
      orderedWorkItemIds: [],
      workItemsById: {},
      pendingInteraction: null,
    } as unknown as ProviderTurnActivitySnapshot;
    expect(renderToStaticMarkup(createElement(FleetTaskActivityLine, { activity, status: "running" }))).toContain("Running for 2m 10s");
    expect(renderToStaticMarkup(createElement(FleetQuietDuration, { since: new Date(now - SPAN_MS).toISOString() }))).toContain("No updates for 2m 10s");
  });

  test("the Run panel and Fleet's run strip", () => {
    const now = Date.now();
    const aggregate = agentRunFixture();
    const detail = agentRunDetail({
      ...aggregate,
      agentRun: { ...aggregate.agentRun, state: "running", createdAt: new Date(now - SPAN_MS).toISOString() },
    });
    expect(agentRunDuration(detail, now)).toBe("2m 10s");
  });

  test("a turn's status and its activity rows", () => {
    const now = Date.now();
    expect(formatProviderTurnElapsedDuration({ activity: { startedAt: now - SPAN_MS }, now })).toBe("2m 10s");
    expect(formatTurnActivityElapsedSeconds(SPAN_MS / 1000)).toBe("2m 10s");
  });

  test("the inbox Fleet and the bell share", () => {
    const entry = {
      id: "item-1", item: null, notifications: [], kind: "user_input", tier: "needs-you",
      title: "Add CSV export", detail: null, repositoryPath: null, repositoryName: null,
      workspaceId: "ws-1", workspaceName: "main", taskId: "task-1",
      at: new Date(Date.now() - SPAN_MS).toISOString(), unread: false, error: false,
    } as unknown as FleetInboxEntry;
    const html = renderToStaticMarkup(createElement(InboxRow, { entry, triggerId: "row-1", triggerLabel: "Add CSV export", onActivate: () => {} }));
    expect(html).toContain(">2m ago<");
  });
});
