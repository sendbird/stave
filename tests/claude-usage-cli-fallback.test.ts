import { describe, expect, test } from "bun:test";
import type * as pty from "node-pty";
import {
  captureClaudeUsagePanelText,
  parseClaudeUsagePanelText,
  stripAnsiEscapes,
  type UsageCaptureTiming,
  type UsagePtySpawner,
} from "../electron/providers/rate-limits/claude-usage-cli-fallback";

// Zero-delay timing so the settle/timeout state machine advances on the next
// timer tick instead of racing the real multi-second waits — keeps these
// lifecycle tests deterministic and fast.
const INSTANT_TIMING: UsageCaptureTiming = {
  promptSettleDelayMs: 0,
  maxStartupWaitMs: 50,
  outputSettleDelayMs: 0,
  captureTimeoutMs: 50,
};

// Yield long enough for a setTimeout(0) callback to run.
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 5));

const USAGE_PANEL_TEXT = [
  "Current session",
  "18% remaining",
  "Resets in 2h 10m",
  "",
  "Current week (all models)",
  "84% left",
  "Resets in 5d 4h",
].join("\r\n");

interface FakePtyControls {
  pty: pty.IPty;
  destroyCalls: number;
  killCalls: number;
  liveDataSubscriptions: number;
  liveExitSubscriptions: number;
  emitData: (chunk: string) => void;
  emitExit: () => void;
  lastWrite: string | null;
}

// A minimal in-memory PTY that records teardown so a leak (missing destroy()
// or an undisposed onData/onExit subscription) fails the test instead of
// silently orphaning a master fd, as the shipped fallback did.
function createFakePty(): FakePtyControls {
  const dataHandlers = new Set<(chunk: string) => void>();
  const exitHandlers = new Set<() => void>();
  const controls: FakePtyControls = {
    destroyCalls: 0,
    killCalls: 0,
    get liveDataSubscriptions() {
      return dataHandlers.size;
    },
    get liveExitSubscriptions() {
      return exitHandlers.size;
    },
    emitData: (chunk) => {
      for (const handler of [...dataHandlers]) handler(chunk);
    },
    emitExit: () => {
      for (const handler of [...exitHandlers]) handler();
    },
    lastWrite: null,
    pty: undefined as unknown as pty.IPty,
  };

  const fake = {
    onData: (handler: (chunk: string) => void) => {
      dataHandlers.add(handler);
      return { dispose: () => dataHandlers.delete(handler) };
    },
    onExit: (handler: () => void) => {
      exitHandlers.add(handler);
      return { dispose: () => exitHandlers.delete(handler) };
    },
    write: (data: string) => {
      controls.lastWrite = data;
    },
    kill: () => {
      controls.killCalls += 1;
    },
    destroy: () => {
      controls.destroyCalls += 1;
    },
    resize: () => {},
    clear: () => {},
    pause: () => {},
    resume: () => {},
    pid: 4242,
    cols: 120,
    rows: 40,
    process: "claude",
    handleFlowControl: false,
  } as unknown as pty.IPty;

  controls.pty = fake;
  return controls;
}

describe("parseClaudeUsagePanelText", () => {
  test("parses remaining-style session and weekly windows", () => {
    const raw = [
      "Plan usage limits",
      "",
      "Current session",
      "18% remaining",
      "Resets in 2h 10m",
      "",
      "Current week (all models)",
      "84% left",
      "Resets in 5d 4h",
    ].join("\n");

    const { session, weekly } = parseClaudeUsagePanelText(raw);

    expect(session).not.toBeNull();
    expect(session?.usedPercent).toBe(82);
    expect(session?.resetsAt).not.toBeNull();

    expect(weekly).not.toBeNull();
    expect(weekly?.usedPercent).toBe(16);
    expect(weekly?.resetsAt).not.toBeNull();
  });

  test("parses used/consumed-style wording and newer weekly labels", () => {
    const raw = [
      "Current session",
      "42% used",
      "Resets in 3h",
      "",
      "Weekly limits",
      "60% consumed",
      "Resets in 2d",
    ].join("\n");

    const { session, weekly } = parseClaudeUsagePanelText(raw);

    expect(session?.usedPercent).toBe(42);
    expect(weekly?.usedPercent).toBe(60);
  });

  test("returns nulls when no recognizable sections are present", () => {
    const { session, weekly } = parseClaudeUsagePanelText(
      "Welcome to Claude Code\n\nType /help for more information.",
    );
    expect(session).toBeNull();
    expect(weekly).toBeNull();
  });

  test("parses PTY output interleaved with ANSI escape sequences", () => {
    const raw = [
      "\x1b[2J\x1b[H\x1b[38;5;114mPlan usage limits\x1b[0m",
      "\x1b[2K",
      "│ \x1b[1mCurrent session\x1b[22m",
      "│ \x1b[38;5;208m█████░░░░░\x1b[0m 18% \x1b[2mremaining\x1b[22m",
      "│ Resets in 2h 10m\x1b[0m",
      "│",
      "│ \x1b[1mCurrent week (all models)\x1b[22m",
      "│ 84% left \x1b]0;claude\x07",
      "│ Resets in 5d 4h",
    ].join("\r\n");

    const { session, weekly } = parseClaudeUsagePanelText(raw);

    expect(session?.usedPercent).toBe(82);
    expect(weekly?.usedPercent).toBe(16);
  });

  test("stripAnsiEscapes removes CSI/OSC sequences but keeps text", () => {
    expect(stripAnsiEscapes("\x1b[1mhello\x1b[0m \x1b]0;title\x07world")).toBe(
      "hello world",
    );
  });

  test("does not confuse a session-only panel with a weekly window", () => {
    const raw = ["Current session", "10% remaining", "Resets in 1h"].join(
      "\n",
    );
    const { session, weekly } = parseClaudeUsagePanelText(raw);
    expect(session?.usedPercent).toBe(90);
    expect(weekly).toBeNull();
  });

  test("parses the Fable weekly limit separately from the all-model window", () => {
    const raw = [
      "Current week (all models)",
      "20% used",
      "Resets in 5d",
      "",
      "Current week (Fable only)",
      "35% used",
      "Resets in 6d 2h",
    ].join("\n");

    const { weekly, fableWeekly } = parseClaudeUsagePanelText(raw);

    expect(weekly?.usedPercent).toBe(20);
    expect(fableWeekly?.usedPercent).toBe(35);
    expect(fableWeekly?.resetsAt).not.toBeNull();
  });

  test("supports the Fable weekly limit label", () => {
    const { weekly, fableWeekly } = parseClaudeUsagePanelText(
      ["Fable weekly limit", "15% remaining", "Resets in 4d"].join("\n"),
    );

    expect(weekly).toBeNull();
    expect(fableWeekly?.usedPercent).toBe(85);
  });
});

// Guards the PTY master fd leak: every termination path of the usage fallback
// must destroy() the PTY and dispose both its onData/onExit subscriptions.
// The shipped code only called kill() and left the subscriptions attached, so
// each poll where the OAuth endpoint was down orphaned one master fd.
describe("captureClaudeUsagePanelText PTY lifecycle", () => {
  test("destroys the PTY and disposes subscriptions after a normal capture", async () => {
    const fake = createFakePty();
    const spawnPty: UsagePtySpawner = () => fake.pty;

    const capture = captureClaudeUsagePanelText(
      "/bin/claude",
      spawnPty,
      INSTANT_TIMING,
    );

    // Startup output, then quiet → the command is sent once settle fires.
    fake.emitData("Welcome to Claude Code\r\n");
    await nextTick();
    expect(fake.lastWrite).toBe("/usage\r");

    // The /usage panel renders, then output settles → capture resolves.
    fake.emitData(USAGE_PANEL_TEXT);

    const raw = await capture;
    expect(raw).toContain("Current session");
    const parsed = parseClaudeUsagePanelText(raw);
    expect(parsed.session?.usedPercent).toBe(82);

    expect(fake.destroyCalls).toBe(1);
    expect(fake.killCalls).toBe(0);
    expect(fake.liveDataSubscriptions).toBe(0);
    expect(fake.liveExitSubscriptions).toBe(0);
  });

  test("destroys the PTY and disposes subscriptions when the child exits", async () => {
    const fake = createFakePty();
    const spawnPty: UsagePtySpawner = () => fake.pty;

    const capture = captureClaudeUsagePanelText(
      "/bin/claude",
      spawnPty,
      INSTANT_TIMING,
    );
    fake.emitData("partial output");
    // Child exits before a parseable panel appears → finish() must still
    // tear the PTY down rather than leaking it.
    fake.emitExit();

    await capture;

    expect(fake.destroyCalls).toBe(1);
    expect(fake.liveDataSubscriptions).toBe(0);
    expect(fake.liveExitSubscriptions).toBe(0);
  });

  test("destroys the PTY and disposes subscriptions when writing the command throws", async () => {
    const fake = createFakePty();
    (fake.pty as { write: (data: string) => void }).write = () => {
      throw new Error("write EPIPE");
    };
    const spawnPty: UsagePtySpawner = () => fake.pty;

    const capture = captureClaudeUsagePanelText(
      "/bin/claude",
      spawnPty,
      INSTANT_TIMING,
    );
    // Guard against an unhandled-rejection abort: attach a catch immediately,
    // then trigger the settle → sendCommand → write-throw → reject path.
    const settled = capture.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    fake.emitData("startup");
    const result = await settled;

    expect(result.ok).toBe(false);
    expect((result as { error: Error }).error.message).toBe("write EPIPE");
    expect(fake.destroyCalls).toBe(1);
    expect(fake.liveDataSubscriptions).toBe(0);
    expect(fake.liveExitSubscriptions).toBe(0);
  });
});
