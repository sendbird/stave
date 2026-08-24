import { beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ScratchApprovalRow,
  ScratchTranscriptView,
  isStoreWiredPendingInteraction,
  stripStoreWiredPendingInteractions,
} from "@/components/layout/scratch-session/ScratchTranscript";
import type { ApprovalPart, ChatMessage } from "@/types/chat";

const editApproval: ApprovalPart = {
  type: "approval",
  toolName: "Edit",
  description: "Rewrite README.md",
  requestId: "req-1",
  state: "approval-requested",
};

describe("ScratchApprovalRow", () => {
  test("shows the tool name and the description", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchApprovalRow, {
        part: editApproval,
        disabled: false,
        onRespond: () => {},
      }),
    );

    expect(markup).toContain("Edit");
    expect(markup).toContain("Rewrite README.md");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
    // The Button's base className always carries `disabled:` Tailwind variants,
    // so a bare substring check for "disabled" would always match. Assert the
    // real HTML disabled *attribute* (`disabled=""`) is absent instead.
    expect(markup).not.toContain('disabled=""');
  });

  test("disables both decisions while a response is in flight", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchApprovalRow, {
        part: { ...editApproval, requestId: "req-2" },
        disabled: true,
        onRespond: () => {},
      }),
    );

    // Two buttons (Approve + Deny), both must carry the real disabled attribute.
    // The leading space distinguishes the standalone `disabled=""` attribute from
    // base-ui's `data-disabled=""` styling hook, which also ends in `disabled=""`.
    expect(markup.match(/ disabled=""/g)?.length).toBe(2);
  });
});

describe("stripStoreWiredPendingInteractions", () => {
  test("flags requested approval and user_input as store-wired", () => {
    expect(isStoreWiredPendingInteraction(editApproval)).toBe(true);
    expect(
      isStoreWiredPendingInteraction({
        type: "user_input",
        requestId: "u-1",
        toolName: "AskUserQuestion",
        questions: [],
        state: "input-requested",
      }),
    ).toBe(true);
  });

  test("keeps text and non-requested interaction history", () => {
    expect(
      isStoreWiredPendingInteraction({ type: "text", text: "hi" }),
    ).toBe(false);
    expect(
      isStoreWiredPendingInteraction({ ...editApproval, state: "approval-responded" }),
    ).toBe(false);
    expect(
      isStoreWiredPendingInteraction({ ...editApproval, state: "approval-interrupted" }),
    ).toBe(false);
  });

  test("removes only the requested parts from a message", () => {
    const message: ChatMessage = {
      id: "m-1",
      role: "assistant",
      model: "test-model",
      providerId: "claude-code",
      content: "",
      parts: [
        { type: "text", text: "working on it" },
        editApproval,
        { ...editApproval, requestId: "req-old", state: "approval-responded" },
      ],
    };

    const stripped = stripStoreWiredPendingInteractions(message);
    expect(stripped.parts).toHaveLength(2);
    expect(
      stripped.parts.some(
        (p) => p.type === "approval" && p.state === "approval-requested",
      ),
    ).toBe(false);
    expect(stripped.parts.some((p) => p.type === "text")).toBe(true);
  });
});

describe("ScratchTranscriptView", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: {
        api: {
          fs: {
            pickRoot: async () => ({ ok: false }),
            readFile: async () => ({ ok: false }),
            writeFile: async () => ({ ok: false }),
          },
        },
      },
      configurable: true,
    });
  });

  test("renders a pending approval exactly once and never through the app-store control", () => {
    const message: ChatMessage = {
      id: "m-1",
      role: "assistant",
      model: "test-model",
      providerId: "claude-code",
      content: "",
      parts: [
        { type: "text", text: "let me edit that" },
        editApproval,
      ],
    };

    const markup = renderToStaticMarkup(
      createElement(ScratchTranscriptView, {
        messages: [message],
        taskId: "scratch-task",
        inFlightRequestId: null,
        onRespond: () => {},
      }),
    );

    // The assistant body still renders its text content.
    expect(markup).toContain("let me edit that");
    // The scratch-owned approval row renders the approval exactly once.
    expect(markup.match(/Rewrite README\.md/g)?.length).toBe(1);
    expect(markup).toContain("Deny");
    // AssistantMessageBody must NOT render the pending approval step: the trace's
    // approval case stamps this attribute only for an approval-requested part.
    expect(markup).not.toContain("data-pending-interaction-request-id");
  });
});
