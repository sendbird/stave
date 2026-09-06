import { expect, test } from "bun:test";
import {
  createRendererRecovery,
  type RendererFailure,
} from "../electron/main/renderer-recovery";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness() {
  let reloads = 0;
  let destroyed = false;
  const prompts: {
    failure: RendererFailure;
    signal: AbortSignal;
    reply: (choice: "reload" | "stay") => void;
  }[] = [];
  const recovery = createRendererRecovery({
    isDestroyed: () => destroyed,
    reload: () => {
      reloads += 1;
    },
    choose: (failure, signal) =>
      new Promise((reply) => prompts.push({ failure, signal, reply })),
  });
  return {
    recovery,
    prompts,
    reloads: () => reloads,
    destroy: () => {
      destroyed = true;
    },
  };
}

test("failure waits for an explicit reload and coalesces duplicate notices", async () => {
  const h = harness();
  h.recovery.failed("crashed");
  h.recovery.failed("crashed");
  await settle();
  expect(h.prompts).toHaveLength(1);
  expect(h.reloads()).toBe(0);
  h.prompts[0]!.reply("reload");
  await settle();
  expect(h.reloads()).toBe(1);
});

test("a responsive renderer dismisses the hang notice and ignores its late response", async () => {
  const h = harness();
  h.recovery.failed("unresponsive");
  await settle();
  h.recovery.responsive();
  expect(h.prompts[0]!.signal.aborted).toBe(true);
  h.prompts[0]!.reply("reload");
  await settle();
  expect(h.reloads()).toBe(0);
});

test("a crash supersedes a hang without two reloads or a stale responsive dismissal", async () => {
  const h = harness();
  h.recovery.failed("unresponsive");
  await settle();
  h.recovery.failed("crashed");
  await settle();
  h.recovery.responsive();
  expect(h.prompts.map((p) => p.failure)).toEqual(["unresponsive", "crashed"]);
  expect(h.prompts[0]!.signal.aborted).toBe(true);
  expect(h.prompts[1]!.signal.aborted).toBe(false);
  h.prompts[0]!.reply("reload");
  h.prompts[1]!.reply("reload");
  await settle();
  expect(h.reloads()).toBe(1);
});

test("manual restoration, closure, and keeping open never authorize a reload", async () => {
  for (const action of ["restored", "dispose", "destroy", "stay"] as const) {
    const h = harness();
    h.recovery.failed("crashed");
    await settle();
    if (action === "destroy") h.destroy();
    else if (action !== "stay") h.recovery[action]();
    h.prompts[0]!.reply(action === "stay" ? "stay" : "reload");
    await settle();
    expect(h.reloads()).toBe(0);
  }
});

test("dialog failure is contained and does not reload", async () => {
  let reloads = 0;
  const recovery = createRendererRecovery({
    isDestroyed: () => false,
    choose: async () => {
      throw new Error("window closed");
    },
    reload: () => {
      reloads += 1;
    },
  });
  recovery.failed("crashed");
  await settle();
  expect(reloads).toBe(0);
});
