import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatInputApprovalQueue } from "@/components/session/chat-input-approval-queue";

describe("ChatInputApprovalQueue", () => {
  test("renders the latest approval with queued items collapsed", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [
        {
          messageId: "message-2",
          part: {
            type: "approval",
            toolName: "Bash",
            description: "Run npm test",
            requestId: "req-2",
            state: "approval-requested" as const,
          },
        },
        {
          messageId: "message-1",
          part: {
            type: "approval",
            toolName: "Read",
            description: "Open .env",
            requestId: "req-1",
            state: "approval-requested" as const,
          },
        },
      ],
      onResolveApproval: () => {},
      onDraftGuidance: () => {},
    }));

    // Latest tool is shown
    expect(html).toContain("Bash");
    expect(html).toContain("Run npm test");
    // Queued indicator
    expect(html).toContain("+1 more queued");
    // Guidance toggle present
    expect(html).toContain("guide instead");
    expect(html).toContain("Tab");
    // Keyboard hint for approve
    expect(html).toContain("approve");
    // Queued item visible inside details
    expect(html).toContain("Read");
    expect(html.indexOf("Run npm test")).toBeLessThan(html.indexOf("Open .env"));
  });

  test("offers Always allow only when the runtime advertised it", () => {
    const withSupport = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [
        {
          messageId: "message-1",
          part: {
            type: "approval",
            toolName: "`npm test`",
            description: "Run npm test",
            requestId: "req-1",
            state: "approval-requested" as const,
            supportsAllowAlways: true,
          },
        },
      ],
      onResolveApproval: () => {},
      onTrustAndApprove: () => {},
    }));
    const withoutSupport = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [
        {
          messageId: "message-1",
          part: {
            type: "approval",
            toolName: "`npm test`",
            description: "Run npm test",
            requestId: "req-1",
            state: "approval-requested" as const,
          },
        },
      ],
      onResolveApproval: () => {},
      onTrustAndApprove: () => {},
    }));

    expect(withSupport).toContain("Always allow");
    expect(withoutSupport).not.toContain("Always allow");
    // The provider owns persistence here, so Stave must not also offer its own
    // weaker client-side trusted-tools copy of the same decision.
    expect(withSupport).not.toContain("approve and always allow");
    expect(withoutSupport).toContain("approve and always allow");
  });

  test("omits guidance and keyboard hint when disabled", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [
        {
          messageId: "message-1",
          part: {
            type: "approval",
            toolName: "Write",
            description: "Edit src/App.tsx",
            requestId: "req-1",
            state: "approval-requested" as const,
          },
        },
      ],
      disabled: true,
      disabledReason: "Managed elsewhere.",
      onResolveApproval: () => {},
    }));

    expect(html).toContain("Write");
    expect(html).toContain("Managed elsewhere.");
    // No keyboard shortcuts or guidance when disabled
    expect(html).not.toContain("guide instead");
    expect(html).not.toContain("Tab");
  });
});
