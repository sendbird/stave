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

test("Codex keeps its thread across mission turns on a stable mission channel", () => {
  const threadKey = "mission-session-task:/tmp/project:gpt-6-astra:chat:none";
  const executablePath = "/tmp/codex";
  const missionChannel = { missionKey: "stable-mission-channel" };

  rememberCodexThreadSession({
    threadKey,
    threadId: "thread-before-mission",
    executablePath,
  });
  // The first mission turn adds the reporting tools, which a resumed thread
  // would not see, so it starts a fresh thread once.
  expect(
    resolveCodexThreadSession({ threadKey, executablePath, turnGrants: missionChannel }),
  ).toBeUndefined();

  rememberCodexThreadSession({
    threadKey,
    threadId: "thread-with-mission-channel",
    executablePath,
    turnGrants: missionChannel,
  });
  // Later stage turns, and ordinary turns that keep sending the same key,
  // resume that thread.
  for (const turnGrants of [missionChannel, { ...missionChannel, callerKey: "task-key" }]) {
    expect(
      resolveCodexThreadSession({ threadKey, executablePath, turnGrants }),
    ).toBe("thread-with-mission-channel");
  }

  expect(forgetCodexThreadSessionsForTask("mission-session-task")).toEqual([threadKey]);
});
