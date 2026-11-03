import { afterEach, describe, expect, test } from "bun:test";
import type { ApprovalPart } from "@/types/chat";
import { selectApprovalAnswersThroughHost, canOfferAllowAlways } from "@/store/approval-delivery";

/**
 * "Always allow" on a request whose grant Stave keeps lands in the trusted
 * approvals only once the answer was delivered, and only through the path
 * that answers the runtime directly.
 */
const originalWindow = globalThis.window;

function setWindow(api: unknown) {
  const values = new Map<string, string>();
  (globalThis as { window: unknown }).window = {
    api,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const ALWAYS: ApprovalPart = {
  type: "approval",
  requestId: "approval-always",
  toolName: "Bash",
  description: "Run the type check",
  input: "bun run typecheck",
  supportsAllowAlways: true,
  trustedToolEntry: "bash:bun run typecheck",
  state: "approval-requested",
};

async function seed(args: { part: ApprovalPart; controlMode?: "interactive" | "managed"; hostOwned?: boolean }) {
  const { useAppStore } = await import("@/store/app.store");
  const initial = useAppStore.getInitialState();
  useAppStore.setState({
    ...initial,
    hasHydratedWorkspaces: true,
    repositoryPath: "/tmp/stave-always",
    repositoryName: "stave-always",
    workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-11-01T00:00:00.000Z" }],
    activeWorkspaceId: "ws-main",
    activeTaskId: "task-always",
    workspacePathById: { "ws-main": "/tmp/stave-always" },
    workspaceBranchById: { "ws-main": "main" },
    workspaceDefaultById: { "ws-main": true },
    settings: { ...initial.settings, trustedTools: [] },
    tasks: [{
      id: "task-always", title: "Always", provider: "claude-code", updatedAt: "2026-11-01T00:00:00.000Z",
      unread: false, archivedAt: null, controlMode: args.controlMode ?? "interactive", controlOwner: "stave",
    }],
    messagesByTask: {
      "task-always": [{
        id: "message-always", role: "assistant", model: "claude-sonnet", providerId: "claude-code", content: "",
        turnId: "turn-always", parts: [args.part],
      }],
    },
    activeTurnIdsByTask: { "task-always": "turn-always" },
    hostOwnedTurnIdsByTask: args.hostOwned ? { "task-always": "turn-always" } : {},
    taskWorkspaceIdById: { "task-always": "ws-main" },
  } as never);
  return useAppStore;
}

afterEach(async () => {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("Always allow kept as a trusted approval", () => {
  test("a delivered always answer adds the request's entry and records the grant", async () => {
    const calls: Array<Record<string, unknown>> = [];
    setWindow({ provider: { respondApproval: async (args: Record<string, unknown>) => { calls.push(args); return { ok: true }; } } });
    const store = await seed({ part: ALWAYS });

    const outcome = await store.getState().resolveApproval({
      taskId: "task-always", messageId: "message-always", requestId: "approval-always", approved: true, scope: "always",
    });

    expect(outcome).toEqual({ status: "delivered" });
    expect(calls).toEqual([{ turnId: "turn-always", requestId: "approval-always", approved: true, scope: "always" }]);
    expect(store.getState().settings.trustedTools).toEqual(["bash:bun run typecheck"]);
    const part = store.getState().messagesByTask["task-always"]?.[0]?.parts[0] as ApprovalPart;
    expect(part.resolution).toMatchObject({ decision: "allowed", source: "user", scope: "always" });
  });

  test("a failed delivery keeps the trusted approvals unchanged", async () => {
    setWindow({ provider: { respondApproval: async () => ({ ok: false, message: "gone" }) } });
    const store = await seed({ part: ALWAYS });
    await store.getState().resolveApproval({
      taskId: "task-always", messageId: "message-always", requestId: "approval-always", approved: true, scope: "always",
    });
    expect(store.getState().settings.trustedTools).toEqual([]);
  });

  test("an always answer to a request that offered no grant stays a plain allow", async () => {
    const calls: Array<Record<string, unknown>> = [];
    setWindow({ provider: { respondApproval: async (args: Record<string, unknown>) => { calls.push(args); return { ok: true }; } } });
    const { supportsAllowAlways: _s, trustedToolEntry: _t, ...plain } = ALWAYS;
    const store = await seed({ part: plain });
    await store.getState().resolveApproval({
      taskId: "task-always", messageId: "message-always", requestId: "approval-always", approved: true, scope: "always",
    });
    expect(calls).toEqual([{ turnId: "turn-always", requestId: "approval-always", approved: true }]);
    expect(store.getState().settings.trustedTools).toEqual([]);
  });

  test("a managed task or a host-owned turn is not offered Always allow", async () => {
    setWindow({});
    let store = await seed({ part: ALWAYS });
    expect(selectApprovalAnswersThroughHost(store.getState(), "task-always")).toBe(false);
    expect(canOfferAllowAlways({ part: ALWAYS, answersThroughHost: false })).toBe(true);

    store = await seed({ part: ALWAYS, controlMode: "managed" });
    expect(selectApprovalAnswersThroughHost(store.getState(), "task-always")).toBe(true);

    store = await seed({ part: ALWAYS, hostOwned: true });
    expect(selectApprovalAnswersThroughHost(store.getState(), "task-always")).toBe(true);
    expect(canOfferAllowAlways({ part: ALWAYS, answersThroughHost: true })).toBe(false);
    expect(canOfferAllowAlways({ part: { supportsAllowAlways: undefined }, answersThroughHost: false })).toBe(false);
  });
});

describe("the trusted approvals never answer a guardrail", () => {
  test("a trusted command that crossed a guardrail still reaches the user", async () => {
    const { findTrustedApprovalResponses } = await import("@/store/app-notification-builders");
    const session = {
      messagesByTask: {
        "task-g": [{
          id: "message-g", role: "assistant", model: "claude", providerId: "claude-code", content: "",
          parts: [
            { type: "approval", requestId: "plain", toolName: "Bash", description: "", input: "git push origin feature", state: "approval-requested" },
            { type: "approval", requestId: "guarded", toolName: "Bash", description: "", input: "git push --force origin main", state: "approval-requested", risk: "irreversible-remote" },
          ],
        }],
      },
    };
    const responses = findTrustedApprovalResponses({
      session: session as never,
      taskId: "task-g",
      trustedTools: ["bash:git push"],
      events: [
        { type: "approval", requestId: "plain", toolName: "Bash", description: "", input: "git push origin feature" },
        { type: "approval", requestId: "guarded", toolName: "Bash", description: "", input: "git push --force origin main", risk: "irreversible-remote" },
      ],
    });
    expect(responses).toEqual([{ messageId: "message-g", requestId: "plain" }]);
  });
});
