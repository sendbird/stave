import { expect, test } from "bun:test";
import {
  forgetCodexThreadSessionsForTask,
  rememberCodexThreadSession,
  resolveCodexThreadSession,
} from "../electron/providers/codex-thread-session";

test("the per-task caller key never rotates a Codex thread", () => {
  const threadKey = "caller-session-task:/tmp/project:gpt-6-astra:chat:none";
  const executablePath = "/tmp/codex";
  rememberCodexThreadSession({ threadKey, threadId: "thread-1", executablePath, turnGrants: { callerKey: "task-key" } });
  expect(resolveCodexThreadSession({ threadKey, executablePath, turnGrants: { callerKey: "task-key" } })).toBe("thread-1");
  expect(resolveCodexThreadSession({ threadKey, executablePath, turnGrants: {} })).toBe("thread-1");
  expect(forgetCodexThreadSessionsForTask("caller-session-task")).toEqual([threadKey]);
});

test("Codex keeps its thread across run turns on a stable run channel", () => {
  const threadKey = "agent-run-session-task:/tmp/project:gpt-6-astra:chat:none";
  const executablePath = "/tmp/codex";
  const agentRunChannel = { agentRunKey: "stable-agent-run-channel" };

  rememberCodexThreadSession({
    threadKey,
    threadId: "thread-before-agent-run",
    executablePath,
  });
  // The first agent run turn adds the reporting tools, which a resumed thread
  // would not see, so it starts a fresh thread once.
  expect(
    resolveCodexThreadSession({ threadKey, executablePath, turnGrants: agentRunChannel }),
  ).toBeUndefined();

  rememberCodexThreadSession({
    threadKey,
    threadId: "thread-with-agent-run-channel",
    executablePath,
    turnGrants: agentRunChannel,
  });
  // Later stage turns, and ordinary turns that keep sending the same key,
  // resume that thread.
  for (const turnGrants of [agentRunChannel, { ...agentRunChannel, callerKey: "task-key" }]) {
    expect(
      resolveCodexThreadSession({ threadKey, executablePath, turnGrants }),
    ).toBe("thread-with-agent-run-channel");
  }

  expect(forgetCodexThreadSessionsForTask("agent-run-session-task")).toEqual([threadKey]);
});
