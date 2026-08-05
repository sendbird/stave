import { describe, expect, test } from "bun:test";
import { getLensConsoleGuardScript } from "@/lib/lens/lens-console-guard";

describe("Lens page console guard", () => {
  test("suppresses page logs beyond the rate and document limits", () => {
    let now = 1_000;
    const calls: Array<{ level: string; args: unknown[] }> = [];
    const pageGlobal = {
      Date: { now: () => now },
      console: Object.fromEntries(
        ["debug", "error", "info", "log", "warn"].map((level) => [
          level,
          (...args: unknown[]) => calls.push({ level, args }),
        ]),
      ) as Console,
    };
    const run = new Function(
      "globalThis",
      getLensConsoleGuardScript({
        rateLimit: 2,
        windowMs: 1_000,
        totalLimit: 3,
      }),
    );

    run(pageGlobal);
    pageGlobal.console.log("one");
    pageGlobal.console.log("two");
    pageGlobal.console.log("dropped");
    now = 2_000;
    pageGlobal.console.log("three");
    pageGlobal.console.log("total-dropped");

    expect(calls.map((call) => call.args[0])).toEqual([
      "one",
      "two",
      "Lens suppressed 1 excessive page console messages.",
      "three",
      "Lens stopped page console forwarding after 3 messages in this document.",
    ]);
  });

  test("is idempotent for the same document", () => {
    const calls: unknown[][] = [];
    const pageGlobal = {
      Date: { now: () => 1_000 },
      console: {
        log: (...args: unknown[]) => calls.push(args),
        warn: (...args: unknown[]) => calls.push(args),
      },
    };
    const run = new Function(
      "globalThis",
      getLensConsoleGuardScript({ rateLimit: 1, totalLimit: 2 }),
    );

    run(pageGlobal);
    run(pageGlobal);
    pageGlobal.console.log("once");
    pageGlobal.console.log("dropped");

    expect(calls).toEqual([["once"]]);
  });
});
