import { describe, expect, test } from "bun:test";
import {
  TerminalSessionRouter,
  type TerminalSessionExitInfo,
} from "../src/lib/terminal/terminal-session-router";

function flushMicrotasks() {
  return new Promise<void>((resolve) => queueMicrotask(() => resolve()));
}

describe("terminal session router", () => {
  test("delivers cached screen state to late subscribers", async () => {
    const router = new TerminalSessionRouter();
    router.publishSnapshot({
      sessionId: "session-1",
      screenState: "screen-state",
    });

    const events: string[] = [];
    router.subscribe("session-1", {
      onScreenState: (screenState) => {
        events.push(`screen:${screenState}`);
      },
      onOutput: (output) => {
        events.push(`output:${output}`);
      },
    });

    await flushMicrotasks();
    expect(events).toEqual(["screen:screen-state"]);
  });

  test("buffers output while there are no subscribers", async () => {
    const router = new TerminalSessionRouter();
    router.publishOutput("session-1", "alpha");
    router.publishOutput("session-1", "beta");

    const events: string[] = [];
    router.subscribe("session-1", {
      onScreenState: (screenState) => {
        events.push(`screen:${screenState}`);
      },
      onOutput: (output) => {
        events.push(`output:${output}`);
      },
    });

    await flushMicrotasks();
    expect(events).toEqual(["output:alphabeta"]);
  });

  test("screen state replaces buffered output as the restore baseline", async () => {
    const router = new TerminalSessionRouter();
    router.publishOutput("session-1", "stale-output");
    router.publishSnapshot({
      sessionId: "session-1",
      screenState: "fresh-screen",
    });

    const events: string[] = [];
    router.subscribe("session-1", {
      onScreenState: (screenState) => {
        events.push(`screen:${screenState}`);
      },
      onOutput: (output) => {
        events.push(`output:${output}`);
      },
    });

    await flushMicrotasks();
    expect(events).toEqual(["screen:fresh-screen"]);
  });

  test("replays exit info to late subscribers", async () => {
    const router = new TerminalSessionRouter();
    const exitInfo: TerminalSessionExitInfo = { exitCode: 0 };
    router.publishExit("session-1", exitInfo);

    const events: string[] = [];
    router.subscribe("session-1", {
      onScreenState: () => {},
      onOutput: () => {},
      onExit: (info) => {
        events.push(`exit:${info.exitCode}`);
      },
    });

    await flushMicrotasks();
    expect(events).toEqual(["exit:0"]);
  });
});
