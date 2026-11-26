import { i18n } from "@/i18n/runtime";
import { describe, expect, test } from "bun:test";

const panelSource = await Bun.file(
  new URL(
    "../src/components/layout/FleetTaskControlPanel.tsx",
    import.meta.url,
  ),
).text();
const inboxSource = await Bun.file(
  new URL("../src/components/layout/FleetAttentionInbox.tsx", import.meta.url),
).text();
const workspaceCardSource = await Bun.file(
  new URL("../src/components/layout/FleetWorkspaceCard.tsx", import.meta.url),
).text();

describe("Fleet inline control surface contract", () => {
  test("renders the complete interaction and running-turn controls", () => {
    expect(panelSource).toContain("<UserInputCard");
    expect(panelSource).toContain("<ToolApprovalCard");
    expect(panelSource).toContain("fleet:fleetTaskControlPanel.steerNow");
    expect(i18n.getFixedT("en", "fleet")("fleetTaskControlPanel.steerNow")).toBe("Steer now");
    expect(panelSource).toContain("fleet:fleetTaskControlPanel.queueNext");
    expect(i18n.getFixedT("en", "fleet")("fleetTaskControlPanel.queueNext")).toBe("Queue next");
    expect(panelSource).toContain("fleet:fleetTaskControlPanel.stop");
    expect(i18n.getFixedT("en", "fleet")("fleetTaskControlPanel.stop")).toBe("Stop");
    expect(panelSource).toContain("fleet:fleetTaskControlPanel.openTask");
    expect(i18n.getFixedT("en", "fleet")("fleetTaskControlPanel.openTask")).toBe("Open task");
    expect(panelSource).toContain("<TaskExecutionSummarySurface");
  });

  test("guards every mutating action with fresh identity validation", () => {
    expect(panelSource).toContain("getFreshCurrentState()");
    expect(panelSource).toContain("validateFleetInteractionAction");
    expect(panelSource).toContain("validateFleetTurnAction");
    expect(panelSource).toContain("validateFleetQueueAction");
    expect(panelSource).toContain("requestId: expected.requestId");
  });

  test("keeps keyboard, announcement, and double-submit affordances wired", () => {
    expect(panelSource).toContain('event.key !== "Escape"');
    expect(panelSource).toContain('aria-live="polite"');
    expect(panelSource).toContain("busyAction != null");
    expect(panelSource).toContain("restoreTriggerFocus");
    expect(inboxSource).toContain("aria-expanded");
    expect(workspaceCardSource).toContain('data-fleet-task-row="true"');
  });

  test("matches a question that outlived its turn the way its row does", () => {
    // Shown and sent without the turn, through the helper the row uses.
    expect(panelSource).toContain("fleetInteractionOutlivesTurn(pendingInteraction?.part)");
    expect(panelSource).toContain("fleetInteractionOutlivesTurn(pendingInteraction.part)");
  });

  test("a late answer outcome only settles the request the panel still shows", () => {
    // A card reuses one panel for its tasks: every send, approval or answer,
    // records itself before it goes out, and an outcome for an earlier one
    // leaves the current controls alone (fleetAnswerNotice gets false).
    const recorded = panelSource.indexOf("lastSentRequest.current = sentKey;");
    expect(recorded).toBeGreaterThan(-1);
    expect(recorded).toBeLessThan(panelSource.indexOf("resolveApproval({", recorded));
    expect(recorded).toBeLessThan(panelSource.indexOf("void resolveUserInput({", recorded));
    expect(panelSource).toContain("fleetAnswerNotice(outcome, panelOpen.current && lastSentRequest.current === sentKey)");
  });

  test("mounts the control panel from both the needs rail and the board card", () => {
    expect(inboxSource).toContain("<FleetTaskControlPanel");
    expect(workspaceCardSource).toContain("<FleetTaskControlPanel");
    expect(inboxSource).toContain("returnFocusElementId");
    expect(workspaceCardSource).toContain("returnFocusElementId");
  });
});
