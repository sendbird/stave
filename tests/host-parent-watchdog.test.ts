import { describe, expect, test } from "bun:test";
import {
  isExpectedHostParentMissing,
  parseExpectedHostParentPid,
  startHostParentWatchdog,
} from "../electron/host-service/parent-watchdog";

describe("host parent watchdog", () => {
  test("accepts only positive integer parent process ids", () => {
    expect(parseExpectedHostParentPid("42")).toBe(42);
    expect(parseExpectedHostParentPid(undefined)).toBeNull();
    expect(parseExpectedHostParentPid("0")).toBeNull();
    expect(parseExpectedHostParentPid("not-a-pid")).toBeNull();
  });

  test("detects reparenting and a missing expected process", () => {
    expect(
      isExpectedHostParentMissing({
        expectedParentPid: 42,
        actualParentPid: 1,
        isProcessAlive: () => true,
      }),
    ).toBe(true);
    expect(
      isExpectedHostParentMissing({
        expectedParentPid: 42,
        actualParentPid: 42,
        isProcessAlive: () => false,
      }),
    ).toBe(true);
  });

  test("fires once when the host becomes orphaned", async () => {
    let calls = 0;
    const timer = startHostParentWatchdog({
      expectedParentPid: 42,
      intervalMs: 1,
      getParentPid: () => 1,
      isProcessAlive: () => true,
      onParentMissing: () => {
        calls += 1;
      },
    });
    await Bun.sleep(10);
    if (timer) {
      clearInterval(timer);
    }
    expect(calls).toBe(1);
  });
});
