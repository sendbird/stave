import { publishesStoredInteractionNotifications } from "../src/lib/notifications/interaction-policy";
import { describe, expect, test } from "bun:test";
import { buildNativeNotificationRequest, buildNativeReplyResponse, createNativeNotificationActionResponder } from "../electron/main/native-notification-actions";

const approval = { id: "notice", kind: "task.approval_requested", workspaceId: "workspace", taskId: "task", turnId: "turn", resolvedAt: null,
  action: { type: "approval", requestId: "request", messageId: "message" }, payload: {} };
function fixture() {
  let pending = true;
  const calls: unknown[] = [];
  const request = buildNativeNotificationRequest(approval)!;
  const respond = createNativeNotificationActionResponder({
    isEnabled: () => true,
    isPending: async () => pending ? "pending" as const : "answered" as const,
    respondApproval: async args => { calls.push(args); pending = false; return { ok: true }; },
    respondUserInput: async args => { calls.push(args); pending = false; return { ok: true }; },
    alreadyAnswered: () => calls.push("already"), couldNotAnswer: () => calls.push("could-not"),
  });
  return { request, respond, calls, expire: () => { pending = false; } };
}
describe("native notification actions", () => {
  test.each(["tars.decision_requested", "tars.result_ready", "tars.blocked"])("%s keeps its dedicated response path", kind => {
    expect(buildNativeNotificationRequest({ ...approval, kind })).toBeNull();
  });
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
    const respond = createNativeNotificationActionResponder({ isEnabled: () => true, isPending: async () => "pending" as const, couldNotAnswer: () => {},
      respondApproval: async () => { throw new Error("Wrong responder"); }, respondUserInput: async args => { calls.push(args); return { ok: true }; }, alreadyAnswered: () => {} });
    expect(request.reply?.key).toBe(mode === "reply" ? "key" : undefined);
    await respond(request, mode === "option" ? request.buttons[0]!.response : buildNativeReplyResponse(request, "typed answer")!);
    expect(calls).toEqual([{ workspaceId: "workspace", taskId: "task", requestId: "q", expectedMessageId: "m", answers: { key: mode === "option" ? "value" : "typed answer" } }]);
  });
  test("large or free-text question uses reply; multi-question cannot fit one reply", () => {
    const question = { key: "key", question: "Describe", options: [] };
    const row = { ...approval, kind: "task.user_input_requested", action: null, payload: { requestId: "q", messageId: "m", questions: [question] } };
    expect(buildNativeNotificationRequest(row)?.reply?.key).toBe("key");
    expect(buildNativeNotificationRequest({ ...row, payload: { ...row.payload, questions: [question, question] } })).toBeNull();
  });
  test("async questions keep their follow-up-message guard", () => {
    expect(buildNativeNotificationRequest({ ...approval, kind: "task.user_input_requested", action: null,
      payload: { requestId: "q", messageId: "m", delivery: "async", questions: [{ question: "Scope?", options: [] }] } })).toBeNull();
  });
  test("setting off prevents delivery", async () => {
    let called = false;
    const respond = createNativeNotificationActionResponder({ isEnabled: () => false, isPending: async () => "pending" as const, couldNotAnswer: () => {},
      respondApproval: async () => { called = true; return { ok: true }; }, respondUserInput: async () => { called = true; return { ok: true }; }, alreadyAnswered: () => {} });
    await respond(fixture().request, { type: "approval", approved: true }); expect(called).toBe(false);
  });
});

describe("a notification reply follows the question's input rules", () => {
  const question = (q: Record<string, unknown>) => buildNativeNotificationRequest({ ...approval, kind: "task.user_input_requested", action: null,
    payload: { requestId: "q", messageId: "m", questions: [{ key: "key", question: "Pick", options: [], ...q }] } });
  test("an enum that does not allow custom answers offers no free-text reply", () => {
    const options = ["a", "b", "c", "d", "e"].map(label => ({ label }));
    expect(question({ options, allowCustom: false })).toBeNull();
    expect(question({ options })?.reply?.key).toBe("key");
  });
  test("an empty-schema elicitation accept offers no reply action", () => {
    expect(question({ key: "__elicitation_accept__", inputType: "text", allowCustom: false, required: false })).toBeNull();
  });
  test("number and integer replies are validated before sending", async () => {
    const number = question({ inputType: "number" })!;
    const integer = question({ inputType: "integer" })!;
    expect(buildNativeReplyResponse(number, "abc")).toBeNull();
    expect(buildNativeReplyResponse(number, " 4.5 ")).toEqual({ type: "answer", answers: { key: "4.5" } });
    expect(buildNativeReplyResponse(integer, "4.5")).toBeNull();
    expect(buildNativeReplyResponse(integer, "12")).toEqual({ type: "answer", answers: { key: "12" } });
    expect(buildNativeReplyResponse(question({})!, "   ")).toBeNull();
  });
  test("answers are filed under the shared answer key", () => {
    expect(question({ key: "  " })?.reply?.key).toBe("Pick");
    const picked = question({ key: "  ", options: [{ label: "First", value: " v " }] });
    expect(picked?.buttons[0]?.response).toEqual({ type: "answer", answers: { Pick: "v" } });
  });
});

describe("approval buttons on a notification", () => {
  const labels = (payload: Record<string, unknown>) => buildNativeNotificationRequest({ ...approval, payload })?.buttons.map(button => button.label);
  test("a short, unflagged request can be allowed from the banner", () => {
    expect(labels({ toolName: "Bash", description: "bun test" })).toEqual(["allowOnce", "deny"]);
  });
  test("a risk-flagged request only opens for review", () => {
    expect(labels({ toolName: "Bash", description: "git push", risk: "irreversible-remote" })).toEqual(["openToReview", "deny"]);
  });
  test("a request longer than the banner shows only opens for review", () => {
    expect(labels({ toolName: "Bash", description: `rm -rf ${"x".repeat(80)}` })).toEqual(["openToReview", "deny"]);
    expect(labels({})).toEqual(["openToReview", "deny"]);
  });
});

describe("a failed response is not reported as answered", () => {
  test("a flush or transport failure says it could not answer and allows a retry", async () => {
    const notices: string[] = [];
    let state: "pending" | "answered" | "unavailable" = "unavailable";
    let failTransport = false;
    const calls: unknown[] = [];
    const respond = createNativeNotificationActionResponder({ isEnabled: () => true, isPending: async () => state,
      respondApproval: async args => { if (failTransport) throw new Error("host gone"); calls.push(args); return { ok: true }; },
      respondUserInput: async () => ({ ok: true }),
      alreadyAnswered: () => notices.push("already"), couldNotAnswer: () => notices.push("could-not"),
    } as never);
    const request = fixture().request;
    await respond(request, { type: "approval", approved: true });
    state = "pending"; failTransport = true;
    await respond(request, { type: "approval", approved: true });
    failTransport = false;
    await respond(request, { type: "approval", approved: true });
    expect(notices).toEqual(["could-not", "could-not"]);
    expect(calls).toHaveLength(1);
    state = "answered";
    await respond({ ...request, requestId: "other" }, { type: "approval", approved: true });
    expect(notices).toEqual(["could-not", "could-not", "already"]);
  });
});

describe("stored notification task ownership", () => {
  test("validates control fields without widening an unknown owner", () => {
    expect(publishesStoredInteractionNotifications({})).toBe(true);
    expect(publishesStoredInteractionNotifications({ controlMode: "managed", controlOwner: "external" })).toBe(false);
    expect(publishesStoredInteractionNotifications({ controlMode: "managed", controlOwner: "external", parentTaskId: "parent" })).toBe(true);
    expect(publishesStoredInteractionNotifications({ controlMode: "unknown", controlOwner: "external" })).toBe(false);
    expect(publishesStoredInteractionNotifications({ controlMode: "managed", controlOwner: "unknown" })).toBe(false);
    expect(publishesStoredInteractionNotifications({ controlMode: "managed", controlOwner: "external", parentTaskId: 1 })).toBe(false);
  });
});
