import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  E2E_LENS_SESSION_ID,
  E2E_WORKSPACE_ID,
  launchStave,
  seedProject,
  type StaveApp,
} from "./harness/stave-app";
import {
  callStaveMcpTool,
  waitForStaveMcpEndpoint,
  type McpToolResult,
  type StaveMcpEndpoint,
} from "./harness/stave-mcp";

/**
 * Native qualification for Lens console and network diagnostics.
 *
 * The fixture is local and deterministic. The test drives the browser through
 * the app's local MCP server, enables the real Lens CDP capture through the
 * renderer-to-main bridge, then causes one console event and one fetch inside
 * the actual Lens guest. No IPC or browser API is mocked.
 *
 * Requires the existing `out/` desktop build (`bun run build:desktop` is owned
 * by the parent qualification when source/build drift needs resolving).
 */

const CONSOLE_MARKER = "lens-native-cdp-console-marker-4de4c81c";
const NETWORK_MARKER = "lens-native-cdp-network-marker-4de4c81c";

const FIXTURE_HTML = `<!doctype html>
<html>
  <head><title>lens diagnostics fixture</title></head>
  <body>
    <h1 id="heading">lens diagnostics fixture</h1>
    <script>
      window.__diagnosticsFixtureReady = true;
    </script>
  </body>
</html>`;

let stave: StaveApp;
let endpoint: StaveMcpEndpoint;
let projectDir: string;
let server: Server;
let origin: string;

async function startFixtureServer(): Promise<void> {
  server = createServer((request, response) => {
    if (request.url?.startsWith("/api/diagnostic")) {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ ok: true, marker: NETWORK_MARKER }));
      return;
    }

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(FIXTURE_HTML);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("diagnostics fixture server did not bind a port");
  }
  origin = `http://127.0.0.1:${address.port}`;
}

function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpToolResult> {
  return callStaveMcpTool(endpoint, name, {
    workspaceId: E2E_WORKSPACE_ID,
    lensSessionId: E2E_LENS_SESSION_ID,
    ...args,
  });
}

type ConsolePayload = {
  entries: Array<{
    text: string;
    level: string;
    captureSource?: string;
  }>;
};

type NetworkPayload = {
  entries: Array<{
    url: string;
    method: string;
    state: string;
    status?: number;
    resourceType?: string;
    captureSource?: string;
    requestHeaders?: Record<string, string[]>;
  }>;
};

test.beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));
  await startFixtureServer();

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });
  await seedProject(stave.page, {
    projectPath: projectDir,
    settings: {
      lensCdpApprovedHosts: ["127.0.0.1"],
      lensDeveloperModeCdp: true,
    },
  });

  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          url: `${origin}/fixture`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 30_000 },
    )
    .toBe("ok");

  const capture = await stave.page.evaluate(
    async (args) => {
      const setCapture = window.api?.lens?.setDiagnosticsCapture;
      if (!setCapture) {
        throw new Error("Lens diagnostics capture API is unavailable");
      }
      return setCapture({ ...args, enabled: true });
    },
    {
      workspaceId: E2E_WORKSPACE_ID,
      lensSessionId: E2E_LENS_SESSION_ID,
    },
  );
  expect(capture.ok, capture.message).toBe(true);
  expect(capture.state?.enabled).toBe(true);
});

test.afterAll(async () => {
  if (stave) {
    await stave.page
      .evaluate(
        async (args) =>
          window.api?.lens?.setDiagnosticsCapture?.({
            ...args,
            enabled: false,
          }),
        {
          workspaceId: E2E_WORKSPACE_ID,
          lensSessionId: E2E_LENS_SESSION_ID,
        },
      )
      .catch(() => undefined);
  }
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("real CDP diagnostics capture a console marker and request metadata", async () => {
  const expression = `(() => {
    console.warn(${JSON.stringify(CONSOLE_MARKER)});
    return fetch(${JSON.stringify(`${origin}/api/diagnostic`)}).then((response) => response.json());
  })()`;
  const evaluated = await callTool("stave_lens_evaluate", { expression });
  expect(evaluated.isError, evaluated.text).toBe(false);

  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_get_console", { limit: 50 });
        if (result.isError) return null;
        const payload = result.structuredContent as ConsolePayload;
        return (
          payload.entries.find((entry) =>
            entry.text.includes(CONSOLE_MARKER),
          ) ?? null
        );
      },
      { timeout: 20_000 },
    )
    .toMatchObject({
      level: "warn",
      captureSource: "cdp",
      text: expect.stringContaining(CONSOLE_MARKER),
    });

  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_get_network", { limit: 50 });
        if (result.isError) return null;
        const payload = result.structuredContent as NetworkPayload;
        return (
          payload.entries.find((entry) =>
            entry.url.endsWith("/api/diagnostic"),
          ) ?? null
        );
      },
      { timeout: 20_000 },
    )
    .toMatchObject({
      url: `${origin}/api/diagnostic`,
      method: "GET",
      state: "complete",
      status: 200,
      resourceType: "xhr",
      captureSource: "cdp",
    });
});
