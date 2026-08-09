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
    expect(panelSource).toContain("<ConfirmationCompact");
    expect(panelSource).toContain("Steer now");
    expect(panelSource).toContain("Queue next");
    expect(panelSource).toContain("Stop");
    expect(panelSource).toContain("Open task");
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

  test("mounts the control panel from both the needs rail and the board card", () => {
    expect(inboxSource).toContain("<FleetTaskControlPanel");
    expect(workspaceCardSource).toContain("<FleetTaskControlPanel");
    expect(inboxSource).toContain("returnFocusElementId");
    expect(workspaceCardSource).toContain("returnFocusElementId");
  });
});
