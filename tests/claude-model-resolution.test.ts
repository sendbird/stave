import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";
import { expect, test } from "bun:test";
import { createClaudeModelResolutionTracker } from "../electron/providers/claude-model-resolution";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { shouldRenderInlineSystemEvent } from "../src/components/session/chat-panel.utils";

const assistant = (model: string, extra = {}) => ({ type: "assistant", parent_tool_use_id: null, message: { model }, ...extra });

test("version rejection surfaces models, minimum version and recovery without raw error payload", () => {
  const track = createClaudeModelResolutionTracker("claude-opus-5-5");
  const events = track({ type: "system", subtype: "model_fallback", originalModel: "claude-opus-5-5", fallbackModel: "claude-opus-4-8", content: 'Claude Code 2.1.276 does not support this model; version 2.1.280 or newer is required. claude_code_version_too_old request_id=private' });
  expect(events[0]).toEqual({ type: "model_resolved", resolvedProviderId: "claude-code", resolvedModel: "claude-opus-4-8" });
  const notice = events[1];
  expect(notice?.type).toBe("system");
  if (notice?.type !== "system") throw new Error("Missing notice");
  expect(notice.content).toContain("claude-opus-5-5 → claude-opus-4-8");
  expect(notice.content).toContain("2.1.276");
  expect(notice.content).toContain("2.1.280");
  expect(notice.content).toContain("claude update");
  expect(notice.content).not.toContain("private");
  expect(shouldRenderInlineSystemEvent(notice)).toBe(true);
  for (const event of events) expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
  expect(track(assistant("claude-opus-4-8"))).toEqual([]);
});

test("detects an unannounced actual model change once, without guessing its cause", () => {
  const track = createClaudeModelResolutionTracker("claude-opus-5-5[1m]");
  expect(track(assistant("claude-opus-5-5"))).toEqual([]);
  expect(track(assistant("claude-haiku-4-5", { parent_tool_use_id: "child" }))).toEqual([]);
  expect(track(assistant("<synthetic>"))).toEqual([]);
  const events = track(assistant("claude-opus-4-8"));
  expect(events[1]).toMatchObject({ type: "system", content: expect.stringContaining("did not report a reason") });
  expect(track(assistant("claude-opus-4-8"))).toEqual([]);
  expect(track(assistant("claude-opus-5-5"))[0]).toMatchObject({ resolvedModel: "claude-opus-5-5" });
});

test("does not confuse a dated model ID or malformed fallback with a switch", () => {
  const track = createClaudeModelResolutionTracker("claude-haiku-4-5");
  expect(track(assistant("claude-haiku-4-5-20251001"))).toEqual([]);
  expect(track({ type: "system", subtype: "model_fallback", fallbackModel: {} })).toEqual([]);
  expect(track(null)).toEqual([]);
});


test("fallback warning and actual model survive completion and transcript replay", () => {
  const track = createClaudeModelResolutionTracker("claude-opus-5-5");
  const events = track(assistant("claude-opus-4-8"));
  const replayed = replayProviderEventsToTaskState({
    taskId: "task", messages: [], provider: "claude-code", model: "claude-opus-5-5",
    events: [...events, { type: "text", text: "Response" }, { type: "done" }],
  });
  expect(replayed.messages.at(-1)?.model).toBe("claude-opus-4-8");
  expect(replayed.messages.at(-1)?.parts).toContainEqual({
    type: "system_event", content: expect.stringContaining("Model changed: claude-opus-5-5 → claude-opus-4-8"),
  });
});
