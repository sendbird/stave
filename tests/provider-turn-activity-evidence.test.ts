import { expect, test } from "bun:test";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-event-mapping";
import { buildTurnActivityItems } from "../src/components/session/turn-activity.utils";
import { resolveTurnRunState } from "../src/components/session/composer-shelf/composer-shelf.utils";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import {
  decideTurnStall,
  observeProviderActivity,
  resolveTurnStallEvidence,
  TURN_STALL_HARD_LIMIT_MS,
} from "../src/lib/providers/turn-activity-evidence";

test("Claude API retry survives event validation and shows as retrying until output resumes", () => {
  const [mapped] = mapClaudeMessageToEvents({
    message: {
      type: "system", subtype: "api_retry", attempt: 1, max_retries: 3,
      retry_delay_ms: 4000, error_status: 429, error: "rate_limit",
      uuid: "00000000-0000-0000-0000-000000000000", session_id: "session",
    },
    claudeDebugStream: false,
  });
  const event = NormalizedProviderEventSchema.parse(mapped);
  const activity = observeProviderActivity(undefined, event, 1_000);
  expect(resolveTurnStallEvidence(activity, null, 301_000)).toEqual({ kind: "retry" });
  expect(resolveTurnRunState({
    pendingInteraction: null, isStalled: false, steering: false, turnError: null,
    turnErrorRecoverable: false, completed: false, retrying: activity?.retrying,
  })).toBe("retrying");
  expect(buildTurnActivityItems({
    activity: null, retrying: activity?.retrying, idleLabel: null,
    isStalled: false, todos: [], workItems: [],
  })).toContainEqual(expect.objectContaining({ title: "Provider is retrying." }));

  const resumed = observeProviderActivity(activity, { type: "text", text: "Working again." }, 302_000);
  expect(resolveTurnStallEvidence(resumed, null, 303_000)).toEqual({ kind: "silence" });
});

test("background activity clears on the next empty provider snapshot and still has a hard ceiling", () => {
  const [mapped] = mapClaudeMessageToEvents({
    message: {
      type: "system", subtype: "background_tasks_changed",
      uuid: "00000000-0000-0000-0000-000000000000", session_id: "session",
      tasks: [
        { task_id: "task", task_type: "local_bash", description: "Compile" },
        { task_id: "watcher", task_type: "local_bash", description: "Watch", ambient: true },
      ],
    },
    claudeDebugStream: false,
  });
  const activity = observeProviderActivity(undefined, NormalizedProviderEventSchema.parse(mapped), 1_000);
  const evidence = resolveTurnStallEvidence(activity, null, 1_201_000);
  expect(evidence).toEqual({ kind: "background", count: 1 });
  expect(decideTurnStall(evidence, 1_200_000).decision).toBe("warn");
  expect(decideTurnStall(evidence, TURN_STALL_HARD_LIMIT_MS).decision).toBe("abort");
  expect(decideTurnStall({ kind: "user_input" }, TURN_STALL_HARD_LIMIT_MS * 2).decision).toBe("wait");
  expect(decideTurnStall({ kind: "transport_exit" }, 0).decision).toBe("abort");

  const settled = observeProviderActivity(activity, {
    type: "provider_activity", activity: { kind: "background", count: 0 },
  }, 1_202_000);
  expect(resolveTurnStallEvidence(settled, null, 1_203_000)).toEqual({ kind: "silence" });
});

test("tool result closes the activity from progress and partial output preserves it", () => {
  const running = observeProviderActivity(undefined, {
    type: "tool_progress", toolUseId: "cmd", toolName: "Bash", elapsedSeconds: 10,
  }, 11_000);
  const partial = observeProviderActivity(running, {
    type: "tool_result", tool_use_id: "cmd", output: "partial", isPartial: true,
  }, 12_000);
  expect(resolveTurnStallEvidence(partial, null, 13_000)).toEqual({
    kind: "tool", name: "Bash", elapsedMs: 12_000,
  });
  const settled = observeProviderActivity(partial, {
    type: "tool_result", tool_use_id: "cmd", output: "",
  }, 14_000);
  expect(resolveTurnStallEvidence(settled, null, 15_000)).toEqual({ kind: "silence" });
});
