import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildFailedOutgoingSend } from "@/store/failed-send-recovery";

async function loadFailedOutgoingMessageBubble() {
  const localStorageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: localStorageStub,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    },
    configurable: true,
    writable: true,
  });

  const module = await import("@/components/session/FailedOutgoingMessages");
  return module.FailedOutgoingMessageBubble;
}

function buildSend(
  args: {
    text?: string;
    attachedFilePaths?: string[];
    reason?: string;
  } = {},
) {
  return buildFailedOutgoingSend({
    id: "failed-1",
    taskId: "task-1",
    failedAt: "2026-09-04T00:00:00.000Z",
    draft: {
      text: args.text ?? "Fix the login form",
      attachedFilePaths: args.attachedFilePaths ?? [],
      attachments: (args.attachedFilePaths ?? []).map((filePath) => ({
        kind: "file" as const,
        filePath,
      })),
    },
    error: new Error(args.reason ?? "provider unavailable"),
  });
}

describe("FailedOutgoingMessageBubble", () => {
  test("shows the unsent payload with retry and dismiss", async () => {
    const FailedOutgoingMessageBubble = await loadFailedOutgoingMessageBubble();
    const html = renderToStaticMarkup(
      createElement(FailedOutgoingMessageBubble, {
        send: buildSend({ attachedFilePaths: ["src/app.ts"] }),
        retryPending: false,
        onRetry: () => {},
        onDismiss: () => {},
      }),
    );

    expect(html).toContain("Fix the login form");
    expect(html).toContain("provider unavailable");
    expect(html).toContain("1 attachment");
    expect(html).toContain('data-failed-send-action="retry"');
    expect(html).toContain('data-failed-send-action="dismiss"');
    expect(html).toContain('data-failed-outgoing-message="failed-1"');
    // Reads as an outgoing message, not as an assistant reply.
    expect(html).toContain("is-user");
  });

  test("locks both actions while a retry is in flight", async () => {
    const FailedOutgoingMessageBubble = await loadFailedOutgoingMessageBubble();
    const html = renderToStaticMarkup(
      createElement(FailedOutgoingMessageBubble, {
        send: buildSend(),
        retryPending: true,
        onRetry: () => {},
        onDismiss: () => {},
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html.match(/<button[^>]*disabled/g) ?? []).toHaveLength(2);
  });

  test("says nothing about attachments for a text-only payload", async () => {
    const FailedOutgoingMessageBubble = await loadFailedOutgoingMessageBubble();
    const html = renderToStaticMarkup(
      createElement(FailedOutgoingMessageBubble, {
        send: buildSend(),
        retryPending: false,
        onRetry: () => {},
        onDismiss: () => {},
      }),
    );

    expect(html).not.toContain("attachment");
  });
});
