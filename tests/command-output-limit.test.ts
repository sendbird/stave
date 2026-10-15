import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  appendCommandOutput,
  COMMAND_CANCELLED_MESSAGE,
  createCommandOutputCollector,
  runCommand,
  runCommandArgs,
} from "../electron/main/utils/command";

describe("appendCommandOutput", () => {
  test("preserves output below the limit", () => {
    expect(appendCommandOutput("hello", " world")).toBe("hello world");
  });

  test("keeps only the most recent output once the limit is exceeded", () => {
    const chunk = "a".repeat(80_000);
    const result = appendCommandOutput(chunk, `b${"c".repeat(80_000)}`);

    expect(result.length).toBe(128_000);
    expect(result.endsWith(`b${"c".repeat(80_000)}`)).toBe(true);
    expect(result.startsWith("a")).toBe(true);
  });

  test("supports a larger operation-specific output cap", () => {
    expect(appendCommandOutput("12345", "67890", 8)).toBe("34567890");
  });

  test("does not retain half of a surrogate pair at the truncation boundary", () => {
    expect(appendCommandOutput("", "😀B", 2)).toBe("B");
  });

  test("decodes UTF-8 characters split across output chunks", () => {
    const encoded = Buffer.from("A😀B", "utf8");
    const collector = createCommandOutputCollector();

    collector.append(encoded.subarray(0, 3));
    collector.append(encoded.subarray(3));

    expect(collector.finish()).toBe("A😀B");
    expect(collector.finish()).toBe("A😀B");
    expect(collector.wasTruncated()).toBe(false);
  });

  test("reports when collected output exceeded its cap", () => {
    const collector = createCommandOutputCollector(4);
    collector.append(Buffer.from("abcdef", "utf8"));

    expect(collector.finish()).toBe("cdef");
    expect(collector.wasTruncated()).toBe(true);
  });

  test("terminates commands that exceed their deadline", async () => {
    const result = await runCommandArgs({
      command: process.execPath,
      commandArgs: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain("timed out after 20ms");
  });

  test("an abort kills the running command, and an aborted signal starts none", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const running = runCommandArgs({
      command: process.execPath,
      commandArgs: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 20_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    const result = await running;
    expect(result).toMatchObject({ ok: false, code: -1 });
    expect(result.stderr).toContain(COMMAND_CANCELLED_MESSAGE);
    expect(Date.now() - startedAt).toBeLessThan(5_000);

    // Nothing runs: a command that would write a file never starts.
    const marker = `${process.env.TMPDIR ?? "/tmp"}/stave-aborted-command-${process.pid}-${Date.now()}`;
    const skipped = await runCommandArgs({
      command: process.execPath,
      commandArgs: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran")`],
      signal: controller.signal,
    });
    expect(skipped).toEqual({ ok: false, code: -1, stdout: "", stderr: COMMAND_CANCELLED_MESSAGE });
    expect(existsSync(marker)).toBe(false);
  });

  test("a shell command that ignores SIGTERM is killed after the grace on timeout", async () => {
    const pidFile = `${process.env.TMPDIR ?? "/tmp"}/stave-stubborn-shell-${process.pid}-${Date.now()}`;
    // `exec` makes the shell itself the stubborn process, so the kill reaches it.
    const script = `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);`;
    const running = runCommand({ command: `exec ${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`, timeoutMs: 300 });
    const deadline = Date.now() + 8_000;
    while (!existsSync(pidFile) && Date.now() < deadline) await Bun.sleep(20);
    const pid = Number(readFileSync(pidFile, "utf8"));
    rmSync(pidFile, { force: true });
    expect(await running).toMatchObject({ ok: false, code: -1 });
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    while (alive() && Date.now() < deadline) await Bun.sleep(50);
    expect(alive()).toBe(false);
  }, 12_000);

  for (const ending of ["abort", "timeout"] as const) {
    test(`a command that ignores SIGTERM is killed after the grace on ${ending}`, async () => {
      const pidFile = `${process.env.TMPDIR ?? "/tmp"}/stave-stubborn-command-${ending}-${process.pid}-${Date.now()}`;
      const controller = new AbortController();
      const running = runCommandArgs({
        command: process.execPath,
        commandArgs: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);`],
        ...(ending === "timeout" ? { timeoutMs: 300 } : { signal: controller.signal }),
        killGraceMs: 200,
      });
      const deadline = Date.now() + 5_000;
      while (!existsSync(pidFile) && Date.now() < deadline) await Bun.sleep(20);
      const pid = Number(readFileSync(pidFile, "utf8"));
      rmSync(pidFile, { force: true });
      if (ending === "abort") controller.abort();
      const result = await running;
      expect(result).toMatchObject({ ok: false, code: -1 });
      const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
      // It ignores SIGTERM, so only the SIGKILL after the grace ends it.
      while (alive() && Date.now() < deadline) await Bun.sleep(20);
      expect(alive()).toBe(false);
    }, 10_000);
  }
});
