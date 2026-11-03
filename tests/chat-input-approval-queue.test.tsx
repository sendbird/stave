import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatInputApprovalQueue } from "@/components/session/chat-input-approval-queue";

const BASH = {
  messageId: "message-2",
  part: {
    type: "approval" as const,
    toolName: "Bash",
    description: "Run npm test",
    input: JSON.stringify({ command: "npm test -- --watch=false" }),
    requestId: "req-2",
    state: "approval-requested" as const,
  },
};
const READ = {
  messageId: "message-1",
  part: {
    type: "approval" as const,
    toolName: "Read",
    description: "Open .env",
    requestId: "req-1",
    state: "approval-requested" as const,
  },
};

describe("ChatInputApprovalQueue", () => {
  test("shows the shown request once, as one row with its position in the queue", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [BASH, READ],
      onResolveApproval: () => {},
      onDraftGuidance: () => {},
    }));

    // One request on screen, named by its tool and the command it would run.
    expect(html.match(/data-approval-request-id=/g)).toHaveLength(1);
    expect(html).toContain('data-approval-request-id="req-2"');
    expect(html).toContain(">Bash<");
    expect(html).toContain("npm test -- --watch=false");
    expect(html).toContain('aria-label="Bash needs your approval: npm test -- --watch=false"');
    // The queue reads as a position with steps, not a second card.
    expect(html).toContain("1 of 2");
    expect(html).toContain('aria-label="Previous request"');
    expect(html).toContain('aria-label="Next request"');
    expect(html).not.toContain("Open .env");
    // Decisions in the approval words; Enter is the shortcut for Allow once.
    expect(html).toContain("Allow once");
    expect(html).toContain('aria-keyshortcuts="Enter"');
    expect(html).toContain("Deny");
    // Details are folded: the description and full input wait behind the disclosure.
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Show details"');
    expect(html).not.toContain("Run npm test<");
    expect(html).not.toContain("guide instead");
  });

  test("a controlled step shows the stepped-to request", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [BASH, READ],
      shownRequestId: "req-1",
      onResolveApproval: () => {},
    }));
    expect(html).toContain('data-approval-request-id="req-1"');
    expect(html).toContain("2 of 2");
    // Read names its file, and the description stands in when there is no input.
    expect(html).toContain("Open .env");
  });

  test("offers Always allow on the row whenever the runtime honors it, as the card does", () => {
    const always = { ...BASH, part: { ...BASH.part, supportsAllowAlways: true, trustedToolEntry: "bash:npm test" } };
    const withSupport = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [always],
      onResolveApproval: () => {},
      onDraftGuidance: () => {},
    }));
    const withoutSupport = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [BASH],
      onResolveApproval: () => {},
    }));
    // Answered through the host, which keeps no grant: not offered.
    const throughHost = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [always],
      allowAlways: false,
      onResolveApproval: () => {},
    }));

    // A button beside Allow once, with the details still folded: never a
    // link hidden behind the disclosure.
    expect(withSupport).toContain(">Always allow<");
    expect(withSupport).toContain('aria-expanded="false"');
    expect(withSupport).not.toMatch(/always allow Bash/i);
    expect(withoutSupport).not.toContain(">Always allow<");
    expect(throughHost).not.toContain(">Always allow<");
    // A single request has no position to step through.
    expect(withSupport).not.toContain("1 of 1");
  });

  test("names the risk the request reported on the row, and keeps who asked for the details", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [{
        ...BASH,
        requestedBy: "Explore",
        part: { ...BASH.part, risk: "network-access" as const, ownerAgentId: "agent-1" },
      }],
      onResolveApproval: () => {},
    }));
    expect(html).toMatch(/data-approval-risk="" title="Network access">Network access</);
    // The row keeps its width for the command; the asking subagent is named
    // in the folded details.
    expect(html).not.toContain("requested by");
    // A request without a risk shows none.
    const plain = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [BASH],
      onResolveApproval: () => {},
    }));
    expect(plain).not.toContain("data-approval-risk");
  });

  test("omits the keyboard hint when disabled and says why", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [{ ...READ, part: { ...READ.part, toolName: "Write", description: "Edit src/App.tsx" } }],
      disabled: true,
      disabledReason: "Managed elsewhere.",
      onResolveApproval: () => {},
    }));

    expect(html).toContain(">Write<");
    expect(html).toContain("Managed elsewhere.");
    expect(html).not.toContain('aria-keyshortcuts="Enter"');
    expect(html).not.toContain("↵");
  });

  test("renders nothing without a pending request", () => {
    expect(renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [],
      onResolveApproval: () => {},
    }))).toBe("");
  });
});
