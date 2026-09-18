import { expect, test } from "bun:test";
import {
  forgetCodexThreadSessionsForTask,
  rememberCodexThreadSession,
  resolveCodexThreadSession,
} from "../electron/providers/codex-thread-session";

test("Codex reuses a stable Advisor channel without retaining its active grant", () => {
  const threadKey = "advisor-session-task:/tmp/project:gpt-6-astra:chat:none";
  const executablePath = "/tmp/codex";
  const collaborationGrants = {
    consultKey: "stable-advisor-channel",
    advisorArmed: true,
  };

  expect(
    resolveCodexThreadSession({
      threadKey,
      executablePath,
      fallbackThreadId: "thread-without-advisor",
      collaborationGrants,
    }),
  ).toBeUndefined();

  rememberCodexThreadSession({
    threadKey,
    threadId: "thread-with-advisor-channel",
    executablePath,
    collaborationGrants,
  });

  expect(
    resolveCodexThreadSession({
      threadKey,
      executablePath,
      collaborationGrants: {
        consultKey: "stable-advisor-channel",
        advisorArmed: false,
      },
    }),
  ).toBe("thread-with-advisor-channel");

  expect(
    resolveCodexThreadSession({
      threadKey,
      executablePath,
      collaborationGrants: {
        consultKey: "stable-advisor-channel",
        advisorArmed: true,
      },
    }),
  ).toBe("thread-with-advisor-channel");

  expect(forgetCodexThreadSessionsForTask("advisor-session-task")).toEqual([
    threadKey,
  ]);
});
