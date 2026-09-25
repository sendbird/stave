import { describe, expect, test } from "bun:test";
import { createCodexTurnNotificationGate } from "../electron/providers/codex-turn-notification-gate";

type Notification = {
  method: string;
  params?: { turnId?: string; turn?: { id: string; status?: string } };
};

describe("Codex turn notification ownership", () => {
  test("keeps early current output and discards a prior canceled turn after the new turn is acknowledged", () => {
    const gate = createCodexTurnNotificationGate<Notification>();
    const prior = {
      method: "item/agentMessage/delta",
      params: { turnId: "canceled-turn" },
    };
    const earlyCurrent = {
      method: "item/agentMessage/delta",
      params: { turnId: "retry-turn" },
    };

    expect(gate.shouldDeliver(prior, "")).toBe(false);
    expect(gate.shouldDeliver(earlyCurrent, "")).toBe(false);
    expect(gate.takePending("retry-turn")).toEqual([earlyCurrent]);
    expect(gate.takePending("retry-turn")).toEqual([]);
    expect(gate.shouldDeliver(prior, "retry-turn")).toBe(false);
    expect(gate.shouldDeliver(earlyCurrent, "retry-turn")).toBe(true);
  });

  test("routes nested turn completion ids and retains only the acknowledged completion", () => {
    const gate = createCodexTurnNotificationGate<Notification>();
    const staleCompletion = {
      method: "turn/completed",
      params: { turn: { id: "canceled-turn", status: "interrupted" } },
    };
    const currentCompletion = {
      method: "turn/completed",
      params: { turn: { id: "retry-turn", status: "completed" } },
    };

    expect(gate.shouldDeliver(staleCompletion, "")).toBe(false);
    expect(gate.shouldDeliver(currentCompletion, "")).toBe(false);
    expect(gate.takePending("retry-turn")).toEqual([currentCompletion]);
    expect(gate.shouldDeliver(staleCompletion, "retry-turn")).toBe(false);
    expect(gate.shouldDeliver(currentCompletion, "retry-turn")).toBe(true);
  });

  test("replays linked child notifications after the parent opener in arrival order", () => {
    const gate = createCodexTurnNotificationGate<Notification>();
    const parent = { method: "item/started", params: { turnId: "retry-turn" } };
    const child = { method: "item/completed", params: { turnId: "child-turn" } };
    const completion = {
      method: "turn/completed",
      params: { turn: { id: "retry-turn", status: "completed" } },
    };

    expect(gate.shouldDeliver(parent, "")).toBe(false);
    gate.holdForeign(child);
    expect(gate.shouldDeliver(completion, "")).toBe(false);
    expect(gate.takePending("retry-turn")).toEqual([parent, child, completion]);
  });

  test("passes thread lifecycle notifications without a turn id", () => {
    const gate = createCodexTurnNotificationGate<Notification>();
    const accountEvent = { method: "account/updated" };
    const threadEvent = { method: "thread/goal/updated", params: {} };

    expect(gate.shouldDeliver(accountEvent, "")).toBe(true);
    expect(gate.shouldDeliver(threadEvent, "")).toBe(true);
    expect(gate.takePending("retry-turn")).toEqual([]);
  });

  test("bounds pre-ack notifications and clears pending state on cancellation", () => {
    const gate = createCodexTurnNotificationGate<Notification>();
    for (let index = 0; index < 1_025; index += 1) {
      expect(gate.shouldDeliver({
        method: `item/${index}`,
        params: { turnId: "retry-turn" },
      }, "")).toBe(false);
    }
    const retained = gate.takePending("retry-turn");
    expect(retained).toHaveLength(1_024);
    expect(retained[0]?.method).toBe("item/1");

    gate.shouldDeliver({ method: "item/pending", params: { turnId: "retry-turn" } }, "");
    gate.clear();
    expect(gate.takePending("retry-turn")).toEqual([]);
  });
});
