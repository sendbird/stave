import { describe, expect, it } from "bun:test";
import {
  TerminalOutputScheduler,
  type TerminalWriteTarget,
} from "@/lib/terminal/terminal-output-scheduler";

class FakeTerminal implements TerminalWriteTarget {
  readonly writes: string[] = [];
  readonly callbacks: Array<() => void> = [];
  error: Error | null = null;

  write(data: string, callback?: () => void) {
    if (this.error) {
      throw this.error;
    }
    this.writes.push(data);
    if (callback) {
      this.callbacks.push(callback);
    }
  }
}

describe("TerminalOutputScheduler", () => {
  it("waits for the parser callback before writing the next chunk", () => {
    const target = new FakeTerminal();
    const scheduled: Array<() => void> = [];
    const parsed: string[] = [];
    const scheduler = new TerminalOutputScheduler(target, {
      maxChunkChars: 3,
      schedule: (callback) => scheduled.push(callback),
    });

    scheduler.enqueue("abcdef", () => parsed.push("done"));
    expect(target.writes).toEqual([]);
    scheduled.shift()?.();
    expect(target.writes).toEqual(["abc"]);
    expect(parsed).toEqual([]);

    target.callbacks.shift()?.();
    expect(target.writes).toEqual(["abc"]);
    scheduled.shift()?.();
    expect(target.writes).toEqual(["abc", "def"]);

    target.callbacks.shift()?.();
    expect(parsed).toEqual(["done"]);
  });

  it("bounds transcript data without rebuilding the full string on append", () => {
    const target = new FakeTerminal();
    const scheduler = new TerminalOutputScheduler(target, {
      schedule: (callback) => callback(),
    });
    const parsed: string[] = [];

    scheduler.enqueue("first", () => parsed.push("first"));
    scheduler.enqueue("second", () => parsed.push("second"));
    target.callbacks.shift()?.();
    target.callbacks.shift()?.();

    expect(target.writes).toEqual(["first", "second"]);
    expect(parsed).toEqual(["first", "second"]);
  });

  it("settles in-flight and queued acknowledgements when disposed", () => {
    const target = new FakeTerminal();
    const scheduled: Array<() => void> = [];
    const parsed: string[] = [];
    const scheduler = new TerminalOutputScheduler(target, {
      schedule: (callback) => scheduled.push(callback),
    });

    scheduler.enqueue("first", () => parsed.push("first"));
    scheduler.enqueue("second", () => parsed.push("second"));
    scheduled.shift()?.();
    scheduler.dispose();

    expect(parsed).toEqual(["first", "second"]);
    target.callbacks.shift()?.();
    expect(parsed).toEqual(["first", "second"]);
  });

  it("reports write failures while still settling the acknowledgement", () => {
    const target = new FakeTerminal();
    const error = new Error("renderer failed");
    target.error = error;
    const errors: unknown[] = [];
    let acknowledgements = 0;
    const scheduler = new TerminalOutputScheduler(target, {
      schedule: (callback) => callback(),
      onWriteError: (caughtError) => errors.push(caughtError),
    });

    scheduler.enqueue("output", () => {
      acknowledgements += 1;
    });

    expect(errors).toEqual([error]);
    expect(acknowledgements).toBe(1);
  });

  it("orders replacement state after the active parse and before new output", () => {
    const target = new FakeTerminal();
    const scheduled: Array<() => void> = [];
    const calls: string[] = [];
    const scheduler = new TerminalOutputScheduler(target, {
      schedule: (callback) => scheduled.push(callback),
    });

    scheduler.enqueue("active");
    scheduled.shift()?.();
    scheduler.enqueue("stale", () => calls.push("stale-settled"));
    scheduler.replace("snapshot", () => calls.push("reset"));
    scheduler.enqueue("fresh");

    expect(calls).toEqual(["stale-settled"]);
    target.callbacks.shift()?.();
    scheduled.shift()?.();
    expect(calls).toEqual(["stale-settled", "reset"]);
    expect(target.writes).toEqual(["active", "snapshot"]);
    target.callbacks.shift()?.();
    scheduled.shift()?.();
    expect(target.writes).toEqual(["active", "snapshot", "fresh"]);
  });
});
