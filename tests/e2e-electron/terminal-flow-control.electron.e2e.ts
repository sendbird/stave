import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository, E2E_WORKSPACE_ID } from "./harness/stave-app";

test("a real PTY exits after its renderer stops acknowledging output", async () => {
  test.skip(process.platform === "win32", "Uses a POSIX shell and /dev/zero.");
  const stave = await launchStave();
  const directory = await mkdtemp(join(tmpdir(), "stave-terminal-flow-"));
  try {
    await seedRepository(stave.page, { repositoryPath: directory });
    const result = await stave.page.evaluate(async ({ directory, workspaceId }) => {
      const terminal = window.api.terminal!;
      const created = await terminal.createSession!({
        workspaceId,
        workspacePath: directory,
        cwd: directory,
        taskId: null,
        taskTitle: null,
        terminalTabId: "no-output-ack",
        shell: "/bin/sh",
        deliveryMode: "push",
      });
      if (!created.sessionId) throw new Error(`Could not create the PTY: ${JSON.stringify(created)}`);
      const sessionId = created.sessionId;
      const attached = await terminal.attachSession!({ sessionId, deliveryMode: "push" });
      if (!attached.attachmentId) throw new Error(`Could not attach to the PTY: ${attached.stderr}`);
      const attachmentId = attached.attachmentId;
      let outputBytes = 0;
      let gaps = 0;
      const unsubscribeOutput = terminal.subscribeSessionOutput!((event) => {
        if (event.sessionId !== sessionId || event.attachmentId !== attachmentId) return;
        outputBytes += event.bytes;
        if (event.outputGap) gaps++;
      });
      let unsubscribeExit: (() => void) | undefined;
      const exited = new Promise<number>((resolve) => {
        unsubscribeExit = terminal.subscribeSessionExit!((event) => {
          if (event.sessionId === sessionId) resolve(event.exitCode);
        });
      });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await terminal.resumeSessionStream!({ sessionId, attachmentId });
        await terminal.writeSession!({
          sessionId,
          input: "head -c 4194304 /dev/zero | tr '\\000' x; exit 23\r",
        });
        const exitCode = await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error("PTY did not exit after the ACK stall")), 15_000);
          }),
        ]);
        return { exitCode, outputBytes, gaps };
      } finally {
        clearTimeout(deadline);
        unsubscribeOutput();
        unsubscribeExit?.();
      }
    }, { directory, workspaceId: E2E_WORKSPACE_ID });
    expect(result.exitCode).toBe(23);
    expect(result.gaps).toBe(1);
    expect(result.outputBytes).toBeGreaterThanOrEqual(512 * 1024);
    expect(result.outputBytes).toBeLessThan(640 * 1024);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
