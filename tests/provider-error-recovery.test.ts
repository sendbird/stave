import { describe, expect, test } from "bun:test";
import {
  buildProviderFailureContinuationPrompt,
  findTransientTurnFailure,
  isProviderFailureRecoveryEligible,
  isProviderFailureRecoveryScopeCurrent,
  isTerminalProviderFailureStopReason,
  isTransientProviderFailureText,
  parseProviderErrorNotice,
} from "@/lib/providers/provider-error-recovery";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { ChatMessageSchema } from "@/lib/task-context/schemas";

describe("a turn that a passing provider failure ended", () => {
  const ended = (message: string, stopReason = "runtime_failure", after: NormalizedProviderEvent[] = []): NormalizedProviderEvent[] => [
    { type: "error", message, recoverable: false }, ...after, { type: "done", stop_reason: stopReason }];

  test("timeouts, dropped connections and overloaded services pass; the turn must have failed", () => {
    expect(findTransientTurnFailure(ended("workspace routing discovery timed out"))).toEqual({ message: "workspace routing discovery timed out" });
    for (const message of ["fetch failed", "read ECONNRESET", "503 Service Unavailable", "server_overloaded: try again", "stream closed before completion"])
      expect(isTransientProviderFailureText(message)).toBe(true);
    expect(findTransientTurnFailure(ended("workspace routing discovery timed out", "cancelled"))).toBeNull();
    expect(findTransientTurnFailure([{ type: "done", stop_reason: "runtime_failure" }])).toBeNull();
  });

  test("a usage limit, a permission error or a bad request does not pass", () => {
    expect(findTransientTurnFailure(ended("You've hit your usage limit. Try again at 3pm."))).toBeNull();
    for (const message of ["Permission denied: /etc/hosts", "invalid_request_error: max_tokens is too large", "Not logged in. Please run /login"])
      expect(isTransientProviderFailureText(message)).toBe(false);
  });
});

describe("provider error recovery", () => {
  test("recognizes a capacity failure without dropping its reason or guidance", () => {
    expect(
      parseProviderErrorNotice(
        "[error] Selected model is at capacity. (status: 503)\nRetry later, or choose another model before resuming.",
      ),
    ).toEqual({
      message: "Selected model is at capacity. (status: 503)",
      guidance: "Retry later, or choose another model before resuming.",
      capacityFailure: true,
      transportFailure: false,
    });
  });

  test("builds a continuation that reconciles state instead of replaying input", () => {
    const prompt = buildProviderFailureContinuationPrompt();

    expect(prompt).toContain("Inspect the current workspace and conversation");
    expect(prompt).toContain("finish only the remaining work");
    expect(prompt).toContain("Do not repeat completed side effects");
  });

  test("only treats failed provider completions as recoverable terminal state", () => {
    for (const stopReason of [
      "failed",
      "runtime_failure",
      "error",
      "aborted",
      "output_overflow",
    ]) {
      expect(isTerminalProviderFailureStopReason(stopReason)).toBe(true);
    }
    for (const stopReason of [
      undefined,
      "end_turn",
      "completed",
      "interrupted",
      "user_abort",
      "cancelled",
    ]) {
      expect(isTerminalProviderFailureStopReason(stopReason)).toBe(false);
    }
  });

  test("does not offer recovery when a capacity warning ends successfully or is interrupted", () => {
    const notice = parseProviderErrorNotice(
      "[error] Selected model is at capacity.",
    );
    if (!notice) throw new Error("Expected capacity notice");

    expect(
      isProviderFailureRecoveryEligible({
        notice,
        terminalStopReason: "end_turn",
      }),
    ).toBe(false);
    expect(
      isProviderFailureRecoveryEligible({
        notice,
        terminalStopReason: "interrupted",
      }),
    ).toBe(false);
    expect(
      isProviderFailureRecoveryEligible({
        notice,
        terminalStopReason: "failed",
      }),
    ).toBe(true);
  });

  test("offers recovery after a Cursor agent transport drop", () => {
    const notice = parseProviderErrorNotice(
      "[error] Cursor provider stream failed: Cursor's agent stream lost its server keepalive (PING timed out). This is a Cursor Agent network drop, not a Stave protocol error. Retry the turn.",
    );
    if (!notice) throw new Error("Expected transport notice");
    expect(notice.transportFailure).toBe(true);
    expect(notice.capacityFailure).toBe(false);
    expect(
      isProviderFailureRecoveryEligible({
        notice,
        terminalStopReason: "runtime_failure",
      }),
    ).toBe(true);
    expect(
      isProviderFailureRecoveryEligible({
        notice,
        terminalStopReason: "end_turn",
      }),
    ).toBe(false);
  });

  test("retains terminal failure evidence across workspace schema parsing", () => {
    const parsed = ChatMessageSchema.parse({
      id: "message-1",
      role: "assistant",
      model: "gpt-5.6",
      providerId: "codex",
      content: "",
      terminalStopReason: "failed",
      parts: [
        {
          type: "system_event",
          content: "[error] Selected model is at capacity. (status: 503)",
        },
      ],
    });

    expect(parsed.terminalStopReason).toBe("failed");
  });

  test("refuses recovery after the captured task scope changes", () => {
    const current = {
      capturedWorkspaceId: "workspace-1",
      currentWorkspaceId: "workspace-1",
      activeWorkspaceId: "workspace-1",
      scopedTaskId: "task-1",
      activeTaskId: "task-1",
      messageId: "message-1",
      latestMessageId: "message-1",
    };

    expect(isProviderFailureRecoveryScopeCurrent(current)).toBe(true);
    expect(
      isProviderFailureRecoveryScopeCurrent({
        ...current,
        activeWorkspaceId: "workspace-2",
      }),
    ).toBe(false);
    expect(
      isProviderFailureRecoveryScopeCurrent({
        ...current,
        activeTurnId: "turn-2",
      }),
    ).toBe(false);
  });
});
