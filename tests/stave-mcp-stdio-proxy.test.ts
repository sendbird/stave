import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

async function waitForFile(args: { filePath: string; timeoutMs: number }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < args.timeoutMs) {
    try {
      const value = await readFile(args.filePath, "utf8");
      if (value.trim()) {
        return value.trim();
      }
    } catch {
      // Keep polling until the helper process writes the file.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${args.filePath}`);
}

describe("stave-mcp-stdio-proxy", () => {
  const cleanupPaths: string[] = [];
  const cleanupChildren: Subprocess[] = [];

  afterEach(async () => {
    await Promise.all(cleanupChildren.splice(0).map(async (child) => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill();
      await child.exited;
    }));
    await Promise.all(cleanupPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
  });

  test("forwards MCP requests with the required accept header and flushes before exit", async () => {
    const tempHome = await mkdtemp(path.join(tmpdir(), "stave-mcp-proxy-"));
    cleanupPaths.push(tempHome);
    await mkdir(path.join(tempHome, ".stave"), { recursive: true });
    const requestCapturePath = path.join(tempHome, "request-capture.json");
    const portPath = path.join(tempHome, "server-port.txt");

    const server = Bun.spawn([
      "node",
      "-e",
      `
        const fs = require("node:fs");
        const http = require("node:http");
        const capturePath = process.argv[1];
        const portPath = process.argv[2];
        const server = http.createServer(async (req, res) => {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          fs.writeFileSync(capturePath, JSON.stringify({
            accept: req.headers.accept ?? "",
            authorization: req.headers.authorization ?? "",
            body: Buffer.concat(chunks).toString("utf8"),
          }));
          setTimeout(() => {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: { ok: true },
            }));
          }, 25);
        });
        server.listen(0, "127.0.0.1", () => {
          fs.writeFileSync(portPath, String(server.address().port));
        });
      `,
      requestCapturePath,
      portPath,
    ], {
      cwd: REPO_ROOT,
      stdout: "ignore",
      stderr: "pipe",
    });
    cleanupChildren.push(server);

    const port = await waitForFile({ filePath: portPath, timeoutMs: 5_000 });

    await writeFile(
      path.join(tempHome, ".stave", "local-mcp.json"),
      `${JSON.stringify({
        url: `http://127.0.0.1:${port}/mcp`,
        token: "test-token",
      })}\n`,
    );

    const child = Bun.spawn([
      process.execPath,
      "electron/main/stave-mcp-stdio-proxy.ts",
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        HOME: tempHome,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    cleanupChildren.push(child);

    const requestPayload = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "0",
        },
      },
    })}\n`;

    if (!child.stdin) {
      throw new Error("Failed to open stdin for proxy process.");
    }

    await child.stdin.write(requestPayload);
    await child.stdin.end();

    const exitCode = await child.exited;
    const stdout = child.stdout ? await new Response(child.stdout).text() : "";
    const stderr = child.stderr ? await new Response(child.stderr).text() : "";

    const requestCapture = JSON.parse(await readFile(requestCapturePath, "utf8")) as {
      accept: string;
      authorization: string;
      body: string;
    };

    expect(exitCode).toBe(0);
    expect(requestCapture.authorization).toBe("Bearer test-token");
    expect(requestCapture.accept).toContain("application/json");
    expect(requestCapture.accept).toContain("text/event-stream");
    expect(JSON.parse(requestCapture.body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "0",
        },
      },
    });
    expect(stdout.trim()).toBe(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        ok: true,
      },
    }));
    expect(stderr).toContain("connected");
    expect(stderr).toContain("stdin closed, exiting.");
  }, 15_000);
});
