import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Hermetic proxy env: a test run started from a Stave terminal inherits that
 * Stave's owner pid, which would pin the proxy to the real instance manifest.
 */
function proxyEnv(home: string, extra: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.STAVE_LOCAL_MCP_OWNER_PID;
  return { ...env, HOME: home, ...extra };
}

/** Binds an ephemeral port and releases it so connections to it are refused. */
async function findClosedPort() {
  const { createServer } = await import("node:net");
  return await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Failed to resolve a probe port."));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForStderr(args: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  collected: { text: string };
  marker: string;
  timeoutMs: number;
}) {
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  while (!args.collected.text.includes(args.marker)) {
    if (Date.now() - startedAt > args.timeoutMs) {
      throw new Error(
        `Timed out waiting for stderr marker ${JSON.stringify(args.marker)}. Saw: ${args.collected.text}`,
      );
    }
    const { value, done } = await args.reader.read();
    if (value) {
      args.collected.text += decoder.decode(value, { stream: true });
    }
    if (done) {
      break;
    }
  }
  if (!args.collected.text.includes(args.marker)) {
    throw new Error(
      `Proxy stderr closed without ${JSON.stringify(args.marker)}. Saw: ${args.collected.text}`,
    );
  }
}

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
            workerKey: req.headers["x-stave-worker-key"] ?? "",
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
        pid: process.pid,
      })}\n`,
    );

    const child = Bun.spawn([
      process.execPath,
      "electron/main/stave-mcp-stdio-proxy.ts",
    ], {
      cwd: REPO_ROOT,
      env: proxyEnv(tempHome, {
        STAVE_WORKER_GRANT_KEY: "transport-worker-grant",
      }),
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
      workerKey: string;
      body: string;
    };

    expect(exitCode).toBe(0);
    expect(requestCapture.authorization).toBe("Bearer test-token");
    expect(requestCapture.workerKey).toBe("transport-worker-grant");
    expect(requestCapture.body).not.toContain("transport-worker-grant");
    expect(stdout + stderr).not.toContain("transport-worker-grant");
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

  test("re-resolves the manifest and retries when the server rebinds to a new port", async () => {
    const tempHome = await mkdtemp(path.join(tmpdir(), "stave-mcp-proxy-"));
    cleanupPaths.push(tempHome);
    await mkdir(path.join(tempHome, ".stave"), { recursive: true });
    const manifestPath = path.join(tempHome, ".stave", "local-mcp.json");
    const portPath = path.join(tempHome, "server-port.txt");

    const server = Bun.spawn([
      "node",
      "-e",
      `
        const fs = require("node:fs");
        const http = require("node:http");
        const portPath = process.argv[1];
        const server = http.createServer(async (req, res) => {
          for await (const chunk of req) {
            void chunk;
          }
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ jsonrpc: "2.0", id: 7, result: { ok: true } }));
        });
        server.listen(0, "127.0.0.1", () => {
          fs.writeFileSync(portPath, String(server.address().port));
        });
      `,
      portPath,
    ], {
      cwd: REPO_ROOT,
      stdout: "ignore",
      stderr: "pipe",
    });
    cleanupChildren.push(server);

    const livePort = await waitForFile({ filePath: portPath, timeoutMs: 5_000 });

    // Reserve a port and immediately release it so the first attempt is
    // guaranteed to be refused, mirroring a Stave restart onto a new port.
    const deadPort = await findClosedPort();

    await writeFile(
      manifestPath,
      `${JSON.stringify({
        url: `http://127.0.0.1:${deadPort}/mcp`,
        token: "stale-token",
        pid: process.pid,
      })}\n`,
    );

    const child = Bun.spawn([
      process.execPath,
      "electron/main/stave-mcp-stdio-proxy.ts",
    ], {
      cwd: REPO_ROOT,
      env: proxyEnv(tempHome),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    cleanupChildren.push(child);

    if (!child.stderr || !child.stdin) {
      throw new Error("Failed to open proxy pipes.");
    }
    const stderrReader = child.stderr.getReader();
    const collectedStderr = { text: "" };

    // Only rewrite the manifest once the proxy has cached the stale endpoint,
    // otherwise the retry path would not be exercised at all.
    await waitForStderr({
      reader: stderrReader,
      collected: collectedStderr,
      marker: `connected → http://127.0.0.1:${deadPort}/mcp`,
      timeoutMs: 5_000,
    });

    await writeFile(
      manifestPath,
      `${JSON.stringify({
        url: `http://127.0.0.1:${livePort}/mcp`,
        token: "fresh-token",
        pid: process.pid,
      })}\n`,
    );

    await child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "stave_list_repositories", arguments: {} },
    })}\n`);
    await child.stdin.end();

    const stdout = child.stdout ? await new Response(child.stdout).text() : "";
    await waitForStderr({
      reader: stderrReader,
      collected: collectedStderr,
      marker: "endpoint changed, reconnected",
      timeoutMs: 5_000,
    });

    expect(await child.exited).toBe(0);
    expect(JSON.parse(stdout.trim())).toEqual({
      jsonrpc: "2.0",
      id: 7,
      result: { ok: true },
    });
    expect(collectedStderr.text).toContain(
      `reconnected → http://127.0.0.1:${livePort}/mcp`,
    );
  }, 20_000);
  test("follows its owning instance, not the shared manifest", async () => {
    const tempHome = await mkdtemp(path.join(tmpdir(), "stave-mcp-proxy-"));
    cleanupPaths.push(tempHome);
    const portPath = path.join(tempHome, "server-port.txt");
    const server = Bun.spawn([
      "node",
      "-e",
      `
        const fs = require("node:fs");
        const http = require("node:http");
        const server = http.createServer(async (req, res) => {
          for await (const chunk of req) { void chunk; }
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ jsonrpc: "2.0", id: 3, result: { owner: req.headers.authorization } }));
        });
        server.listen(0, "127.0.0.1", () => fs.writeFileSync(process.argv[1], String(server.address().port)));
      `,
      portPath,
    ], { stdout: "ignore", stderr: "pipe" });
    cleanupChildren.push(server);
    const livePort = await waitForFile({ filePath: portPath, timeoutMs: 5_000 });
    const deadPort = await findClosedPort();
    const ownerPid = process.pid;

    // Another instance took over the shared file with an endpoint that is gone.
    await mkdir(path.join(tempHome, ".stave"), { recursive: true });
    await writeFile(
      path.join(tempHome, ".stave", "local-mcp.json"),
      `${JSON.stringify({ url: `http://127.0.0.1:${deadPort}/mcp`, token: "other", pid: ownerPid })}\n`,
    );
    const instanceDir = path.join(tempHome, ".stave", "local-mcp-instances", String(ownerPid));
    await mkdir(instanceDir, { recursive: true });
    await writeFile(
      path.join(instanceDir, "local-mcp.json"),
      `${JSON.stringify({ url: `http://127.0.0.1:${livePort}/mcp`, token: "owner", pid: ownerPid })}\n`,
    );

    const child = Bun.spawn([process.execPath, "electron/main/stave-mcp-stdio-proxy.ts"], {
      cwd: REPO_ROOT,
      env: proxyEnv(tempHome, { STAVE_LOCAL_MCP_OWNER_PID: String(ownerPid) }),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    cleanupChildren.push(child);
    if (!child.stdin) {
      throw new Error("Failed to open stdin for proxy process.");
    }
    await child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" })}\n`);
    await child.stdin.end();

    const stdout = child.stdout ? await new Response(child.stdout).text() : "";
    expect(await child.exited).toBe(0);
    expect(JSON.parse(stdout.trim())).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: { owner: "Bearer owner" },
    });
  }, 15_000);

  test("refuses a shared manifest left behind by an exited instance", async () => {
    const tempHome = await mkdtemp(path.join(tmpdir(), "stave-mcp-proxy-"));
    cleanupPaths.push(tempHome);
    const exited = Bun.spawn(["true"]);
    await exited.exited;
    await mkdir(path.join(tempHome, ".stave"), { recursive: true });
    await writeFile(
      path.join(tempHome, ".stave", "local-mcp.json"),
      `${JSON.stringify({ url: "http://127.0.0.1:9/mcp", token: "dead", pid: exited.pid })}\n`,
    );

    const child = Bun.spawn([process.execPath, "electron/main/stave-mcp-stdio-proxy.ts"], {
      cwd: REPO_ROOT,
      env: proxyEnv(tempHome),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    cleanupChildren.push(child);
    const stderr = child.stderr ? await new Response(child.stderr).text() : "";
    await child.exited;
    expect(stderr).toContain("its Stave instance is no longer running");
    expect(stderr).not.toContain("connected →");
  }, 15_000);
});
