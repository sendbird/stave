import { ChatMessageSchema } from "../src/lib/task-context/schemas";
import { expect, test } from "bun:test";
import { createCodexModelResolutionTracker } from "../electron/providers/codex-model-resolution";
import { toCodexUserFacingErrorMessage } from "../electron/providers/codex-app-server-errors";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { buildModelSelectorOptions } from "../src/components/ai-elements/model-selector.utils";

test("thread model changes persist the notice and executed model through completion", () => {
  const track = createCodexModelResolutionTracker("gpt-6-sol");
  const events = track.resolve("gpt-5.6-sol");
  for (const event of events) expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
  const state = replayProviderEventsToTaskState({ taskId: "task", messages: [], provider: "codex", model: "gpt-6-sol", events: [...events, { type: "text", text: "Answer" }, { type: "done" }] });
  expect(state.messages.at(-1)?.model).toBe("gpt-5.6-sol");
  expect(state.messages.at(-1)?.parts).toContainEqual({ type: "system_event", content: expect.stringContaining("gpt-6-sol → gpt-5.6-sol") });
  expect(track.resolve("gpt-5.6-sol")).toEqual([]);
});

test("policy rerouting reports its reason without claiming a version problem", () => {
  const track = createCodexModelResolutionTracker("gpt-6-sol");
  const events = track.resolve("gpt-6-astra", "gpt-6-sol", "highRiskCyberActivity");
  expect(events[1]).toMatchObject({ type: "system", content: expect.stringContaining("high-risk cyber activity policy") });
  expect(JSON.stringify(events)).not.toContain("update");
});

test("unknown reasons are not exposed as raw payloads and malformed models are ignored", () => {
  const track = createCodexModelResolutionTracker();
  expect(track.resolve({ model: "invalid" })).toEqual([]);
  expect(track.resolve("gpt-6-sol")).toHaveLength(1);
  expect(track.resolve("gpt-6-luna", undefined, "private payload")[1]).toMatchObject({ content: expect.stringContaining("did not provide a recognized reason") });
  expect(track.resolve("gpt-6-sol")).toHaveLength(2);
});

test("reroutes that arrive before the turn id apply only to that turn", () => {
  const track = createCodexModelResolutionTracker("gpt-6-sol");
  expect(track.noteReroute({ toModel: "gpt-6-terra" }, "")).toEqual([]);
  expect(track.noteReroute({ turnId: "other-turn", toModel: "gpt-6-luna" }, "")).toEqual([]);
  expect(track.noteReroute({ turnId: "turn-1", toModel: "gpt-6-astra", reason: "highRiskCyberActivity" }, "")).toEqual([]);
  const events = track.flush("turn-1");
  expect(events[0]).toMatchObject({ type: "model_resolved", resolvedModel: "gpt-6-astra" });
  expect(events[1]?.content).toContain("high-risk cyber activity policy");
  expect(track.flush("other-turn")).toEqual([]);
});

test("compatibility errors retain supplied minimum versions and provide installation-specific updates", () => {
  const message = toCodexUserFacingErrorMessage({ message: "This model requires Codex version 0.156.0 or newer." });
  expect(message).toContain("0.156.0");
  expect(message).toContain("npm install -g @openai/codex@latest");
  expect(message).toContain("brew upgrade --cask codex");
  expect(toCodexUserFacingErrorMessage({ message: "Model gpt-6-sol is not supported with this account" })).toContain("account");
  expect(toCodexUserFacingErrorMessage({ message: "Network closed" })).toBe("Network closed");
});

test("Codex selector explains availability without inventing a minimum version", () => {
  const option = buildModelSelectorOptions({ providerIds: ["codex"] }).find(option => option.model === "gpt-6-sol");
  expect(option?.description).toContain("Runtime support unconfirmed");
  expect(option?.description).toContain("You can still select this model");
});


test("execution evidence survives schema persistence and a same-turn plan split", () => {
  const track = createCodexModelResolutionTracker("gpt-6-sol");
  const events = track.resolve("gpt-6-luna");
  const state = replayProviderEventsToTaskState({ taskId: "task", messages: [], provider: "codex", model: "gpt-6-sol", events: [...events, { type: "plan_ready", planText: "Implement the requested change." }, { type: "text", text: "Complete." }, { type: "done" }] });
  const saved = ChatMessageSchema.parse(JSON.parse(JSON.stringify(state.messages.at(-1))));
  expect(saved.modelExecution).toMatchObject({ requestedModel: "gpt-6-sol", actualModel: "gpt-6-luna" });
});
