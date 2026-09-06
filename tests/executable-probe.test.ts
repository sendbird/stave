import { describe, expect, test } from "bun:test";
import { runExecutableProbe } from "../electron/providers/runtime-shared";

const run = (
  script: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
) =>
  runExecutableProbe({
    executablePath: process.execPath,
    commandArgs: ["-e", script],
    env: process.env,
    ...options,
  });

describe("executable probes", () => {
  test("a slow executable leaves the service event loop responsive", async () => {
    let completed = false;
    const probe = run('setTimeout(() => { console.log("1.2.3"); }, 150)').then(
      (value) => {
        completed = true;
        return value;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(completed).toBe(false);
    expect(await probe).toMatchObject({
      status: 0,
      stdout: "1.2.3",
      timedOut: false,
    });
  });

  test("caps noisy output without splitting a UTF-8 code point", async () => {
    const result = await run('process.stdout.write("가".repeat(1000))', {
      maxBytes: 100,
    });
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(100);
    expect(result.stdout).not.toContain("�");
    expect(result.status).toBe(0);
  });

  test("a process ignoring graceful termination still reaches its deadline", async () => {
    const result = await run(
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
      { timeoutMs: 150 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.status).toBeNull();
    expect(result.signal).toBe("SIGKILL");
  });
});
