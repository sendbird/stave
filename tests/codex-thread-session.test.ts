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
    resolveCodexThreadSession({ threadKey, executablePath, collaborationGrants: missionChannel }),
  ).toBeUndefined();

  rememberCodexThreadSession({
    threadKey,
    threadId: "thread-with-mission-channel",
    executablePath,
    collaborationGrants: missionChannel,
  });
  // Later stage turns, and ordinary turns that keep sending the same key,
  // resume that thread.
  for (const collaborationGrants of [missionChannel, { ...missionChannel, consultKey: undefined }]) {
    expect(
      resolveCodexThreadSession({ threadKey, executablePath, collaborationGrants }),
    ).toBe("thread-with-mission-channel");
  }

  expect(forgetCodexThreadSessionsForTask("mission-session-task")).toEqual([threadKey]);
});
