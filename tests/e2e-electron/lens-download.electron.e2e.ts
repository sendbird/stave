import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
 * Native qualification for a Lens page link download.
 *
 * The fixture and its bytes are local and deterministic. The test clicks a
 * real anchor inside the Lens guest through the app's local MCP server, waits
 * for the product's will-download handler to finish, then reads the saved file
 * from the throwaway launch profile and checks the returned Lens metadata.
 * No IPC or browser API is mocked, and no developer Downloads directory is
 * touched.
 *
 * Requires the existing `out/` desktop build (`bun run build:desktop` is owned
 * by the parent qualification when source/build drift needs resolving).
 */

const DOWNLOAD_URL_PATH = "/assets/report.txt";
const DOWNLOAD_FILENAME = "lens-fixture.txt";
const DOWNLOAD_TEXT = "stave lens native download fixture\n";

const FIXTURE_HTML = `<!doctype html>
<html>
  <head><title>lens download fixture</title></head>
  <body>
    <h1>lens download fixture</h1>
    <a id="download" href="${DOWNLOAD_URL_PATH}" download>Download report</a>
  </body>
</html>`;

let stave: StaveApp;
let endpoint: StaveMcpEndpoint;
let projectDir: string;
let server: Server;
let origin: string;

async function startFixtureServer(): Promise<void> {
  server = createServer((request, response) => {
    if (request.url === DOWNLOAD_URL_PATH) {
      const bytes = Buffer.from(DOWNLOAD_TEXT, "utf8");
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${DOWNLOAD_FILENAME}"`,
        "content-length": bytes.length,
        "cache-control": "no-store",
      });
      response.end(bytes);
      return;
    }

    response.writeHead(request.url === "/fixture" ? 200 : 404, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(request.url === "/fixture" ? FIXTURE_HTML : "not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("download fixture server did not bind a port");
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

type DownloadEntry = {
  url: string;
  filename: string;
  savePath: string;
  mimeType?: string;
  totalBytes?: number;
  receivedBytes?: number;
  state: string;
  startedAt: string;
  completedAt?: string;
};

type DownloadsPayload = { entries: DownloadEntry[] };

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
});

test.afterAll(async () => {
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a real Lens guest link saves bytes and reports download metadata", async () => {
  const clicked = await callTool("stave_lens_click", { target: "#download" });
  expect(clicked.isError, clicked.text).toBe(false);

  const expectedUrl = `${origin}${DOWNLOAD_URL_PATH}`;
  const readEntry = async (): Promise<DownloadEntry | null> => {
    const result = await callTool("stave_lens_list_downloads");
    if (result.isError) return null;
    const payload = result.structuredContent as DownloadsPayload;
    return (
      payload.entries.find((candidate) => candidate.url === expectedUrl) ?? null
    );
  };

  await expect.poll(readEntry, { timeout: 30_000 }).toMatchObject({
    url: expectedUrl,
    filename: DOWNLOAD_FILENAME,
    mimeType: "text/plain",
    state: "completed",
    totalBytes: Buffer.byteLength(DOWNLOAD_TEXT),
    receivedBytes: Buffer.byteLength(DOWNLOAD_TEXT),
    startedAt: expect.any(String),
    completedAt: expect.any(String),
  });

  const entry = await readEntry();
  expect(entry).not.toBeNull();

  expect(entry!.savePath).toContain(
    path.join(stave.userDataDir, "lens-downloads"),
  );
  expect(entry!.savePath).toContain(`${E2E_WORKSPACE_ID}`);
  expect(await readFile(entry!.savePath, "utf8")).toBe(DOWNLOAD_TEXT);
});
