import { afterEach, describe, expect, test } from "bun:test";
import { i18n } from "@/i18n";
import {
  resolvePromptInputPlaceholder,
  resolvePromptInputSendLabels,
} from "@/components/ai-elements/prompt-input-submit-labels";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("prompt input submit labels", () => {
  test("a pending approval says that sending declines it and redirects the agent", () => {
    const base = { minimal: false, focused: false, steerQueueEnterAction: "queue" as const };
    expect(resolvePromptInputPlaceholder({ ...base, submitMode: "redirect-steer" })).toBe(
      "Send to decline pending approvals and redirect the agent…",
    );
    expect(resolvePromptInputPlaceholder({ ...base, submitMode: "redirect-queue" })).toBe(
      "Send to decline pending approvals and queue this for the next turn…",
    );
    expect(resolvePromptInputPlaceholder({ ...base, minimal: true, submitMode: "redirect-steer" })).toBe(
      "Decline and redirect…",
    );
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
      resolvePromptInputPlaceholder({ submitMode: "send", minimal: true, focused: true, steerQueueEnterAction: "queue" }),
    ).toBe("");
  });

  test("the Korean copy is used in Korean", async () => {
    await i18n.changeLanguage("ko");
    expect(
      resolvePromptInputPlaceholder({
        submitMode: "redirect-steer",
        minimal: false,
        focused: false,
        steerQueueEnterAction: "queue",
      }),
    ).toBe("보내면 대기 중인 승인 요청을 거절하고 에이전트의 방향을 조정합니다…");
    expect(
      resolvePromptInputSendLabels({ submitMode: "redirect-steer", steerQueueEnterAction: "queue" }).ariaLabel,
    ).toBe("거절하고 방향 조정");
  });
});
