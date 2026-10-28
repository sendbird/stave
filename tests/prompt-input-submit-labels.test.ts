import { afterEach, describe, expect, test } from "bun:test";
import { i18n } from "@/i18n";
import { resolvePromptInputSendLabels } from "@/components/ai-elements/prompt-input-submit-labels";
import { resolvePromptPlaceholder } from "@/components/ai-elements/prompt-input.utils";

/** The placeholder text the composer renders, through the one placeholder resolver. */
function placeholderText(args: Parameters<typeof resolvePromptPlaceholder>[0]): string {
  const placeholder = resolvePromptPlaceholder(args);
  if (placeholder.kind === "text") return i18n.t(placeholder.key);
  return placeholder.kind;
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("prompt input submit labels", () => {
  test("a pending approval says that sending declines it and redirects the agent", () => {
    const base = { minimal: false, focused: false, steerOrQueue: false, queueNext: false };
    expect(placeholderText({ ...base, approvalRedirect: "steer" })).toBe(
      "Send to decline pending approvals and redirect the agent…",
    );
    expect(placeholderText({ ...base, approvalRedirect: "queue" })).toBe(
      "Send to decline pending approvals and queue this for the next turn…",
    );
    expect(placeholderText({ ...base, minimal: true, approvalRedirect: "steer" })).toBe(
      "Decline and redirect…",
    );
    // The redirect hint wins over the running turn's steer/queue label.
    expect(placeholderText({ ...base, steerOrQueue: true, approvalRedirect: "steer" })).toBe(
      "Send to decline pending approvals and redirect the agent…",
    );
    // The minimal layout still hides it while focused.
    expect(placeholderText({ ...base, minimal: true, focused: true, approvalRedirect: "queue" })).toBe("none");
  });

  test("the send button shows the steer action while approvals wait", () => {
    expect(
      resolvePromptInputSendLabels({ submitMode: "redirect-steer", steerQueueEnterAction: "queue" }),
    ).toEqual({ ariaLabel: "Decline and steer", tooltip: "Decline and steer" });
    expect(
      resolvePromptInputSendLabels({ submitMode: "redirect-queue", steerQueueEnterAction: "steer" }),
    ).toEqual({ ariaLabel: "Decline and queue next turn", tooltip: "Decline and queue next turn" });
  });

  test("the other modes keep their labels", () => {
    expect(
      resolvePromptInputSendLabels({ submitMode: "steer-or-queue", steerQueueEnterAction: "steer" }),
    ).toEqual({ ariaLabel: "Steer this turn", tooltip: "Steer" });
    expect(
      resolvePromptInputSendLabels({ submitMode: "send", steerQueueEnterAction: "queue", assignOnSend: true }),
    ).toEqual({ ariaLabel: "Assign", tooltip: "Assign" });
    expect(
      placeholderText({ minimal: true, focused: true, steerOrQueue: false, queueNext: false, approvalRedirect: null }),
    ).toBe("none");
  });

  test("the Korean copy is used in Korean", async () => {
    await i18n.changeLanguage("ko");
    expect(
      placeholderText({
        minimal: false,
        focused: false,
        steerOrQueue: false,
        queueNext: false,
        approvalRedirect: "steer",
      }),
    ).toBe("보내면 대기 중인 승인 요청을 거절하고 에이전트의 방향을 조정합니다…");
    expect(
      resolvePromptInputSendLabels({ submitMode: "redirect-steer", steerQueueEnterAction: "queue" }).ariaLabel,
    ).toBe("거절하고 방향 조정");
  });
});
