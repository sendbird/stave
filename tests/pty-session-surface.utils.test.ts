import { describe, expect, test } from "bun:test";
import {
  createLatestAsyncDispatcher,
  shouldCreatePtySession,
} from "../src/components/layout/pty-session-surface.utils";

describe("shouldCreatePtySession", () => {
  test("does not create a session while the surface is hidden", () => {
    expect(shouldCreatePtySession({
      isVisible: false,
      workspaceId: "ws-main",
      hasActiveTab: true,
    })).toBe(false);
  });

  test("does not create a session without a workspace id or active tab", () => {
    expect(shouldCreatePtySession({
      isVisible: true,
      workspaceId: "",
      hasActiveTab: true,
    })).toBe(false);
    expect(shouldCreatePtySession({
      isVisible: true,
      workspaceId: "ws-main",
      hasActiveTab: false,
    })).toBe(false);
  });

  test("creates a session only when the visible surface has an active tab", () => {
    expect(shouldCreatePtySession({
      isVisible: true,
      workspaceId: "ws-main",
      hasActiveTab: true,
    })).toBe(true);
  });
});

describe("createLatestAsyncDispatcher", () => {
  test("keeps at most one in-flight task and coalesces to the latest pending value", async () => {
    const started: number[] = [];
    const releases: Array<() => void> = [];
    const dispatcher = createLatestAsyncDispatcher<number>({
      run: (value) =>
        new Promise<void>((resolve) => {
          started.push(value);
          releases.push(resolve);
        }),
    });

    dispatcher.schedule(1);
    dispatcher.schedule(2);
    dispatcher.schedule(3);

    expect(started).toEqual([1]);

    releases[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual([1, 3]);

    releases[1]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual([1, 3]);
  });

  test("drops pending work when clear is called", async () => {
    const started: number[] = [];
    const releases: Array<() => void> = [];
    const dispatcher = createLatestAsyncDispatcher<number>({
      run: (value) =>
        new Promise<void>((resolve) => {
          started.push(value);
          releases.push(resolve);
        }),
    });

    dispatcher.schedule(1);
    dispatcher.schedule(2);
    dispatcher.clear();

    releases[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual([1]);
  });

  test("passes the failed value to onError", async () => {
    const failures: Array<{ error: unknown; value: number }> = [];
    const dispatcher = createLatestAsyncDispatcher<number>({
      run: async (value) => {
        throw new Error(`boom:${value}`);
      },
      onError: (error, value) => {
        failures.push({ error, value });
      },
    });

    dispatcher.schedule(7);
    await Promise.resolve();
    await Promise.resolve();

    expect(failures).toHaveLength(1);
    expect(failures[0]?.value).toBe(7);
    expect((failures[0]?.error as Error).message).toBe("boom:7");
  });
});
