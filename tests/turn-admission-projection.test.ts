import { expect, test } from "bun:test";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { applyProviderTurnActivityEvents, markProviderTurnStalled } from "../src/lib/providers/turn-status";
import { AgentRouteSettingsSchema } from "../src/lib/routing/agent-run-route";

test("admission events are strict and queued turns do not stall", () => {
  const event = { type: "turn_admission", state: "queued", ahead: 3 } as const;
  expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
  expect(NormalizedProviderEventSchema.safeParse({ ...event, ahead: -1 }).success).toBe(false);
  expect(NormalizedProviderEventSchema.safeParse({ ...event, extra: true }).success).toBe(false);
  const args = { activityByTask: {}, taskId: "task", turnId: "turn", providerId: "codex" as const, events: [event], now: 1 };
  const queued = applyProviderTurnActivityEvents(args);
  expect(queued.task?.admission).toEqual({ state: "queued", ahead: 3 });
  expect(markProviderTurnStalled({ activityByTask: queued, taskId: "task", turnId: "turn", now: 999999 }).task?.stalledAt).toBeNull();
  const running = applyProviderTurnActivityEvents({ ...args, activityByTask: queued, events: [{ ...event, state: "running", ahead: 0 }], now: 2 });
  expect(running.task?.admission?.state).toBe("running");
});

test("global turn cap accepts off and one through sixteen only", () => {
  const base = { routing: { autoRoutingEnabled: false }, classifier: null };
  for (const limit of [null, 1, 16]) expect(AgentRouteSettingsSchema.safeParse({ ...base, globalAgentTurnLimit: limit }).success).toBe(true);
  for (const limit of [0, 17, 1.5, "2"]) expect(AgentRouteSettingsSchema.safeParse({ ...base, globalAgentTurnLimit: limit }).success).toBe(false);
});
