import { describe, expect, test } from "bun:test";
import { buildNativeNotificationRequest, createNativeNotificationActionResponder } from "../electron/main/native-notification-actions";

const approval = { id: "notice", kind: "task.approval_requested", workspaceId: "workspace", taskId: "task", turnId: "turn", resolvedAt: null,
  action: { type: "approval", requestId: "request", messageId: "message" }, payload: {} };
function fixture() {
  let pending = true;
  const calls: unknown[] = [];
  const request = buildNativeNotificationRequest(approval)!;
  const respond = createNativeNotificationActionResponder({
    isEnabled: () => true,
    isPending: async () => pending,
    respondApproval: async args => { calls.push(args); pending = false; return { ok: true }; },
    respondUserInput: async args => { calls.push(args); pending = false; return { ok: true }; },
    alreadyAnswered: () => calls.push("already"),
  });
  return { request, respond, calls, expire: () => { pending = false; } };
}
describe("native notification actions", () => {
  test.each([true, false])("approval %s uses request identity and once-only responder", async approved => {
    const f = fixture(); await f.respond(f.request, { type: "approval", approved });
    expect(f.calls).toEqual([{ workspaceId: "workspace", taskId: "task", requestId: "request", expectedMessageId: "message", approved }]);
  });
  test("duplicate actions are a no-op", async () => {
    const f = fixture(); await Promise.all([f.respond(f.request, { type: "approval", approved: true }), f.respond(f.request, { type: "approval", approved: false })]);
    expect(f.calls).toHaveLength(1);
  });
  test("expired request shows follow-up without delivering", async () => {
    const f = fixture(); f.expire(); await f.respond(f.request, { type: "approval", approved: true }); expect(f.calls).toEqual(["already"]);
  });
  test("question options keep answer keys and values", () => {
    const request = buildNativeNotificationRequest({ ...approval, kind: "task.user_input_requested", action: null,
      payload: { requestId: "q", messageId: "m", questions: [{ key: "key", question: "Pick", options: [{ label: "First", value: "value" }] }] } });
    expect(request?.buttons).toEqual([{ label: "First", response: { type: "answer", answers: { key: "value" } } }]);
  });
  test.each(["option", "reply"])("question %s routes through the question responder", async mode => {
    const calls: unknown[] = [];
    const request = buildNativeNotificationRequest({ ...approval, kind: "task.user_input_requested", action: null,
      payload: { requestId: "q", messageId: "m", questions: [{ key: "key", question: "Pick", options: mode === "option" ? [{ label: "First", value: "value" }] : [] }] } })!;
    const respond = createNativeNotificationActionResponder({ isEnabled: () => true, isPending: async () => true,
      respondApproval: async () => { throw new Error("Wrong responder"); }, respondUserInput: async args => { calls.push(args); return { ok: true }; }, alreadyAnswered: () => {} });
    expect(request.replyKey).toBe(mode === "reply" ? "key" : undefined);
    await respond(request, mode === "option" ? request.buttons[0]!.response : { type: "answer", answers: { [request.replyKey!]: "typed answer" } });
    expect(calls).toEqual([{ workspaceId: "workspace", taskId: "task", requestId: "q", expectedMessageId: "m", answers: { key: mode === "option" ? "value" : "typed answer" } }]);
  });
  test("large or free-text question uses reply; multi-question cannot fit one reply", () => {
    const question = { key: "key", question: "Describe", options: [] };
    const row = { ...approval, kind: "task.user_input_requested", action: null, payload: { requestId: "q", messageId: "m", questions: [question] } };
    expect(buildNativeNotificationRequest(row)?.replyKey).toBe("key");
    expect(buildNativeNotificationRequest({ ...row, payload: { ...row.payload, questions: [question, question] } })).toBeNull();
  });
  test("async questions keep their follow-up-message guard", () => {
    expect(buildNativeNotificationRequest({ ...approval, kind: "task.user_input_requested", action: null,
      payload: { requestId: "q", messageId: "m", delivery: "async", questions: [{ question: "Scope?", options: [] }] } })).toBeNull();
  });
  test("setting off prevents delivery", async () => {
    let called = false;
    const respond = createNativeNotificationActionResponder({ isEnabled: () => false, isPending: async () => true,
      respondApproval: async () => { called = true; return { ok: true }; }, respondUserInput: async () => { called = true; return { ok: true }; }, alreadyAnswered: () => {} });
    await respond(fixture().request, { type: "approval", approved: true }); expect(called).toBe(false);
  });
});
