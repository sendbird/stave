import { describe, expect, test } from "bun:test";
import { createTurnTimeoutController } from "../electron/providers/runtime";

// Task B regression: the turn-level timeout must pause while the UI is
// waiting on a user decision so an idle approval prompt doesn't silently
// abort the turn when the user finally clicks Approve.

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe("createTurnTimeoutController", () => {
  test("fires onTimeout after the budget elapses with no decision wait", async () => {
    let fired = false;
    const controller = createTurnTimeoutController({
      timeoutMs: 30,
      onTimeout: () => {
        fired = true;
      },
    });

    const result = await controller.promise;
    expect(fired).toBe(true);
    expect(controller.timedOut).toBe(true);
    expect(result).toBeNull();
    controller.dispose();
  });

  test("pauseForDecision suspends the timer and resumeAfterDecision restores the full budget", async () => {
    let fired = false;
    const controller = createTurnTimeoutController({
      timeoutMs: 60,
      onTimeout: () => {
        fired = true;
      },
    });

    // Pause almost immediately — the original timer had ~60ms to live.
    controller.pauseForDecision();
    // Sleep well past the original budget. Without pause, this would fire.
    await sleep(120);
    expect(fired).toBe(false);

    // Resume — the controller should reset the full 60ms budget so user
    // deliberation latency doesn't eat provider time.
    controller.resumeAfterDecision();
    // Sleep less than the budget first: still no fire.
    await sleep(30);
    expect(fired).toBe(false);
    // Sleep past the budget.
    await sleep(60);
    expect(fired).toBe(true);
    controller.dispose();
  });

  test("multiple pauses refcount correctly", async () => {
    let fired = false;
    const controller = createTurnTimeoutController({
      timeoutMs: 40,
      onTimeout: () => {
        fired = true;
      },
    });

    controller.pauseForDecision();
    controller.pauseForDecision();
    // Only one resume → still paused.
    controller.resumeAfterDecision();
    await sleep(80);
    expect(fired).toBe(false);

    // Second resume restarts the timer.
    controller.resumeAfterDecision();
    await sleep(80);
    expect(fired).toBe(true);
    controller.dispose();
  });

  test("dispose prevents further firing even if timer was armed", async () => {
    let fired = false;
    const controller = createTurnTimeoutController({
      timeoutMs: 20,
      onTimeout: () => {
        fired = true;
      },
    });
    controller.dispose();
    await sleep(50);
    expect(fired).toBe(false);
    expect(controller.timedOut).toBe(false);
  });

  test("resumeAfterDecision is a no-op when no decision is pending", async () => {
    let fired = false;
    const controller = createTurnTimeoutController({
      timeoutMs: 30,
      onTimeout: () => {
        fired = true;
      },
    });

    // Calling resume before any pause should not affect the timer.
    controller.resumeAfterDecision();
    controller.resumeAfterDecision();
    await controller.promise;
    expect(fired).toBe(true);
    controller.dispose();
  });
});
