import { describe, expect, test } from "bun:test";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import {
  createWebFetchAuthWallTracker,
  maybeStartProviderBrowserFallbackTurn,
  shouldStartProviderBrowserFallbackTurn,
} from "@/store/provider-browser-auto-fallback";

const trackerContext = {
  prompt: "Summarize https://claude.ai/code/artifact/abc",
  turnOrigin: "conversation",
  runtimeOptions: {},
} as const;

const fetchCall = (toolUseId: string, url: string): NormalizedProviderEvent => ({
  type: "tool",
  toolUseId,
  toolName: "WebFetch",
  input: JSON.stringify({ url, prompt: "read it" }),
  state: "input-available",
});

const fetchResult = (
  toolUseId: string,
  output: string,
): NormalizedProviderEvent => ({
  type: "tool_result",
  tool_use_id: toolUseId,
  output,
});

describe("web fetch auth wall tracker", () => {
  test("correlates a blocked result flushed in a later batch", () => {
    const tracker = createWebFetchAuthWallTracker(trackerContext);
    tracker.observe([fetchCall("t1", "https://claude.ai/code/artifact/abc")]);
    expect(tracker.detected).toBe(false);
    tracker.observe([fetchResult("t1", "Request failed with status code 403")]);
    expect(tracker.detected).toBe(true);
    expect(tracker.blockedUrls()).toEqual([
      "https://claude.ai/code/artifact/abc",
    ]);
  });

  test("ignores results from tools that are not plain fetches", () => {
    const tracker = createWebFetchAuthWallTracker(trackerContext);
    tracker.observe([
      {
        type: "tool",
        toolUseId: "t1",
        toolName: "Bash",
        input: JSON.stringify({ command: "curl https://claude.ai" }),
        state: "input-available",
      },
      fetchResult("t1", "HTTP 403 Forbidden"),
    ]);
    expect(tracker.detected).toBe(false);
  });

  test("ignores a fetch that merely failed for another reason", () => {
    const tracker = createWebFetchAuthWallTracker(trackerContext);
    tracker.observe([
      fetchCall("t1", "https://example.test/a"),
      fetchResult("t1", "404 Not Found"),
    ]);
    expect(tracker.detected).toBe(false);
    expect(tracker.blockedUrls()).toEqual([]);
  });

  test("reads a provider that carries the result on the tool event", () => {
    const tracker = createWebFetchAuthWallTracker(trackerContext);
    tracker.observe([
      {
        type: "tool",
        toolUseId: "t9",
        toolName: "web_fetch",
        input: JSON.stringify({ url: "https://wiki.corp.example/x" }),
        output: "Attention Required! | Cloudflare",
        state: "output-available",
      },
    ]);
    expect(tracker.detected).toBe(true);
    expect(tracker.blockedUrls()).toEqual(["https://wiki.corp.example/x"]);
  });

  test("dedupes repeated blocks on one URL", () => {
    const tracker = createWebFetchAuthWallTracker(trackerContext);
    tracker.observe([
      fetchCall("t1", "https://claude.ai/a"),
      fetchResult("t1", "HTTP 403 Forbidden"),
      fetchCall("t2", "https://claude.ai/a"),
      fetchResult("t2", "HTTP 403 Forbidden"),
    ]);
    expect(tracker.blockedUrls()).toEqual(["https://claude.ai/a"]);
  });
});

describe("provider browser fallback turn guard", () => {
  const base = {
    detected: true,
    autoFallbackEnabled: true,
    originalPromptRequestedBrowser: false,
    conversationTurn: true,
    planMode: false,
    turnAborted: false,
    hasQueuedUserTurn: false,
  };

  test("starts the retry when every condition holds", () => {
    expect(shouldStartProviderBrowserFallbackTurn(base)).toBe(true);
  });

  test("never retries a turn that already had the browser", () => {
    // This is the loop breaker: the retry prompt itself contains @web.
    expect(
      shouldStartProviderBrowserFallbackTurn({
        ...base,
        originalPromptRequestedBrowser: true,
      }),
    ).toBe(false);
  });

  test("holds off for every other blocking condition", () => {
    for (const blocked of [
      { detected: false },
      { autoFallbackEnabled: false },
      { conversationTurn: false },
      { planMode: true },
      { turnAborted: true },
      { hasQueuedUserTurn: true },
    ]) {
      expect(
        shouldStartProviderBrowserFallbackTurn({ ...base, ...blocked }),
      ).toBe(false);
    }
  });
});

describe("maybeStartProviderBrowserFallbackTurn", () => {
  const blockedTracker = (
    context: Partial<Parameters<typeof createWebFetchAuthWallTracker>[0]> = {},
  ) => {
    const tracker = createWebFetchAuthWallTracker({
      ...trackerContext,
      ...context,
    });
    tracker.observe([
      fetchCall("t1", "https://claude.ai/code/artifact/abc"),
      fetchResult("t1", "Request failed with status code 403"),
    ]);
    return tracker;
  };

  const stubStore = (autoFallback: boolean) => {
    const sent: Array<{ content: string; turnOrigin: string }> = [];
    return {
      sent,
      getState: () => ({
        settings: { providerBrowserAutoFallback: autoFallback },
        sendUserMessage: async (args: {
          content: string;
          turnOrigin: "conversation" | "utility";
        }) => {
          sent.push(args);
        },
      }),
    };
  };

  test("sends one @web retry naming the blocked URL", () => {
    const store = stubStore(true);
    maybeStartProviderBrowserFallbackTurn(store.getState, {
      taskId: "task-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
      tracker: blockedTracker(),
      session: null,
    });

    expect(store.sent).toHaveLength(1);
    expect(store.sent[0]?.content).toContain("@web");
    expect(store.sent[0]?.content).toContain(
      "https://claude.ai/code/artifact/abc",
    );
    // A Stave-authored turn must not re-run the task's armed Advisor.
    expect(store.sent[0]?.turnOrigin).toBe("utility");
  });

  test("stays silent when the setting is off", () => {
    const store = stubStore(false);
    maybeStartProviderBrowserFallbackTurn(store.getState, {
      taskId: "task-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
      tracker: blockedTracker(),
      session: null,
    });
    expect(store.sent).toHaveLength(0);
  });

  test("does not retry a turn the user aborted", () => {
    const store = stubStore(true);
    maybeStartProviderBrowserFallbackTurn(store.getState, {
      taskId: "task-1",
      events: [{ type: "done", stop_reason: "aborted" }],
      tracker: blockedTracker(),
      session: null,
    });
    expect(store.sent).toHaveLength(0);
  });

  test("does not retry a plan-mode turn, which cannot get the browser", () => {
    const store = stubStore(true);
    maybeStartProviderBrowserFallbackTurn(store.getState, {
      taskId: "task-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
      tracker: blockedTracker({
        runtimeOptions: { claudePermissionMode: "plan" },
      }),
      session: null,
    });
    expect(store.sent).toHaveLength(0);
  });

  test("yields to the user's own queued follow-up", () => {
    const store = stubStore(true);
    maybeStartProviderBrowserFallbackTurn(store.getState, {
      taskId: "task-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
      tracker: blockedTracker(),
      session: {
        promptDraftByTask: {
          "task-1": { queuedTurns: [{ id: "q1", content: "next" }] },
        },
      } as never,
    });
    expect(store.sent).toHaveLength(0);
  });

  test("never chains a second retry off its own @web turn", () => {
    const store = stubStore(true);
    maybeStartProviderBrowserFallbackTurn(store.getState, {
      taskId: "task-1",
      events: [{ type: "done", stop_reason: "end_turn" }],
      tracker: blockedTracker({
        prompt: "@web retry the blocked read",
      }),
      session: null,
    });
    expect(store.sent).toHaveLength(0);
  });
});
