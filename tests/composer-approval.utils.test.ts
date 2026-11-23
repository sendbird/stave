import { describe, expect, test } from "bun:test";
import {
  resolveShownApproval,
  stepShownApproval,
  summarizeApprovalRequest,
} from "@/components/session/composer-approval.utils";

const approval = (requestId: string, toolName = "Bash", input?: string, description = "") => ({
  messageId: `m-${requestId}`,
  part: { type: "approval" as const, toolName, description, input, requestId, state: "approval-requested" as const },
});
const queue = [approval("c"), approval("b"), approval("a")];

describe("resolveShownApproval", () => {
  test("leads with the latest request until another one is chosen", () => {
    expect(resolveShownApproval(queue, null)).toEqual({ item: queue[0]!, index: 0 });
    expect(resolveShownApproval(queue, "b")).toEqual({ item: queue[1]!, index: 1 });
  });

  test("falls back to the lead once the chosen request leaves the queue", () => {
    expect(resolveShownApproval(queue, "gone")).toEqual({ item: queue[0]!, index: 0 });
    expect(resolveShownApproval([], "a")).toBeNull();
  });
});

describe("stepShownApproval", () => {
  test("steps by request id and wraps at both ends", () => {
    expect(stepShownApproval(queue, null, 1)).toBe("b");
    expect(stepShownApproval(queue, "b", 1)).toBe("a");
    expect(stepShownApproval(queue, "a", 1)).toBe("c");
    expect(stepShownApproval(queue, "c", -1)).toBe("a");
    expect(stepShownApproval([], null, 1)).toBeNull();
  });
});

describe("summarizeApprovalRequest", () => {
  test("names what the tool would run from its input", () => {
    expect(summarizeApprovalRequest(approval("x", "Bash", JSON.stringify({ command: "bun test\nmore" })).part)).toBe("bun test");
    expect(summarizeApprovalRequest(approval("x", "Read", JSON.stringify({ file_path: "/repo/src/a.ts" })).part)).toBe("a.ts");
  });

  test("falls back to the description, then the raw input", () => {
    expect(summarizeApprovalRequest(approval("x", "Custom", undefined, "Open .env\nsecond line").part)).toBe("Open .env");
    expect(summarizeApprovalRequest(approval("x", "Custom", "plain input").part)).toBe("plain input");
    expect(summarizeApprovalRequest(approval("x", "Custom").part)).toBe("");
  });
});
