import { describe, expect, test } from "bun:test";
import {
  buildApprovalGuidancePrompt,
  shouldHandleApprovalEnterShortcut,
  shouldHandleApprovalTabShortcut,
} from "@/components/session/chat-input.utils";

describe("approval shortcuts", () => {
  test("accepts Enter on neutral targets", () => {
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      targetTagName: "DIV",
      targetRole: null,
      targetIsContentEditable: false,
    })).toBe(true);
  });

  test("blocks Tab guidance shortcut inside editable targets", () => {
    expect(shouldHandleApprovalTabShortcut({
      key: "Tab",
      targetTagName: "TEXTAREA",
      targetRole: "textbox",
      targetIsContentEditable: false,
    })).toBe(false);
  });

  test("accepts Tab guidance shortcut on neutral targets", () => {
    expect(shouldHandleApprovalTabShortcut({
      key: "Tab",
      targetTagName: "DIV",
      targetRole: null,
      targetIsContentEditable: false,
    })).toBe(true);
  });
});

describe("buildApprovalGuidancePrompt", () => {
  test("stages a denied-approval follow-up with request context", () => {
    expect(buildApprovalGuidancePrompt({
      currentDraft: "",
      toolName: "bash",
      description: "Run npm test",
      guidance: "Use bun test for this repo instead.",
    })).toBe(
      [
        "The previous approval request for bash was denied.",
        "Requested action: Run npm test",
        "Continue with this guidance instead:",
        "Use bun test for this repo instead.",
      ].join("\n"),
    );
  });

  test("appends guidance to an existing draft", () => {
    expect(buildApprovalGuidancePrompt({
      currentDraft: "Check the current failures first.",
      toolName: "apply_patch",
      description: "Edit src/App.tsx",
      guidance: "Explain the change before editing.",
    })).toContain("Check the current failures first.\nThe previous approval request for apply_patch was denied.");
  });
});
