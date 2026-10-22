import { afterEach, describe, expect, test } from "bun:test";
import { useAppStore } from "@/store/app.store";
import { runUtilityTextTurn } from "@/store/utility-text-turn";

/**
 * Agent drafting and instruction suggestions run one tool-less utility turn.
 * The provider runtime refuses a turn without an absolute workspace folder,
 * so the turn must carry one, and a refused or failed turn must read as a
 * failure, not as an empty answer.
 */

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const initial = useAppStore.getState();
afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
  useAppStore.setState({
    activeWorkspaceId: initial.activeWorkspaceId,
    workspacePathById: initial.workspacePathById,
    repositoryPath: initial.repositoryPath,
  });
});

type SentTurn = { cwd?: string; runtimeOptions?: { toolsDisabled?: boolean } };

function provider(events: unknown[]) {
  const sent: SentTurn[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { api: { provider: { streamTurn: (args: SentTurn) => { sent.push(args); return events; } } } },
  });
  return sent;
}

describe("utility text turn", () => {
  test("runs tool-less in the active workspace's folder", async () => {
    useAppStore.setState({ activeWorkspaceId: "ws", workspacePathById: { ws: "/tmp/stave-ws" }, repositoryPath: "/tmp/stave-repo" });
    const sent = provider([{ type: "text", text: '{"name":"Reviewer"}' }, { type: "done", stop_reason: "end_turn" }]);
    const result = await runUtilityTextTurn({ prompt: "Draft an agent.", turnIdPrefix: "agent-draft" });
    expect(result).toEqual({ ok: true, text: '{"name":"Reviewer"}' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.cwd).toBe("/tmp/stave-ws");
    expect(sent[0]?.runtimeOptions?.toolsDisabled).toBe(true);
  });

  test("falls back to the repository folder when the workspace has none recorded", async () => {
    useAppStore.setState({ activeWorkspaceId: "ws", workspacePathById: {}, repositoryPath: "/tmp/stave-repo" });
    const sent = provider([{ type: "text", text: "ok" }]);
    await runUtilityTextTurn({ prompt: "Draft an agent.", turnIdPrefix: "agent-draft" });
    expect(sent[0]?.cwd).toBe("/tmp/stave-repo");
  });

  test("a refused or failed turn is a failure with the provider's reason", async () => {
    useAppStore.setState({ activeWorkspaceId: "ws", workspacePathById: { ws: "/tmp/stave-ws" }, repositoryPath: "/tmp/stave-repo" });
    provider([
      { type: "error", message: "Provider turn refused: the task has no resolved workspace folder.", recoverable: false },
      { type: "done", stop_reason: "runtime_failure" },
    ]);
    const result = await runUtilityTextTurn({ prompt: "Draft an agent.", turnIdPrefix: "agent-draft" });
    expect(result).toEqual({ ok: false, message: "Provider turn refused: the task has no resolved workspace folder." });
  });
});
