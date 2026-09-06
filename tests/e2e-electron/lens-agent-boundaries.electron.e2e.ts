import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
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

/*
 * Native proof for three Lens boundaries that unit contracts cannot establish:
 *
 * - refs minted in a child frame address that child rather than its host;
 * - a saved account stays out of the Local MCP response while its fill reaches
 *   a same-host login form; and
 * - closing a guest aborts an in-flight navigation and leaves the reused
 *   session id able to navigate again.
 *
 * The fixture is loopback-only. It does not request real device permissions,
 * contact an identity provider, or use a developer profile.
 */

let stave: StaveApp;
let projectDir: string;
let server: Server;
let origin: string;
let endpoint: StaveMcpEndpoint;
let slowRequestStarted: (() => void) | undefined;

const INNER_HTML = `<!doctype html>
<html><head><title>inner fixture</title></head>
<body>
  <h1>inner frame fixture</h1>
  <div style="height: 900px"></div>
  <button id="inner-action" type="button">Inner action</button>
  <label for="inner-field">Inner email</label>
  <input id="inner-field" type="text" />
  <p id="inner-result">idle</p>
  <script>
    document.getElementById("inner-action").addEventListener("click", () => {
      document.getElementById("inner-result").textContent = "inner clicked";
    });
  </script>
</body></html>`;

const FRAME_HTML = `<!doctype html>
<html><head><title>frame host fixture</title></head>
<body>
  <h1>frame host fixture</h1>
  <div style="height: 1200px"></div>
  <iframe title="inner fixture" src="/inner" style="height: 700px; width: 600px"></iframe>
</body>
</html>`;

const LOGIN_HTML = `<!doctype html>
<html><head><title>login fixture</title></head>
<body>
  <form id="login-form">
    <label>Username <input id="login-user" autocomplete="username" type="text" /></label>
    <label>Password <input id="login-password" autocomplete="current-password" type="password" /></label>
    <button type="submit">Sign in</button>
  </form>
  <p id="submitted">not submitted</p>
  <script>
    document.getElementById("login-form").addEventListener("submit", (event) => {
      event.preventDefault();
      document.getElementById("submitted").textContent = "submitted";
    });
  </script>
</body></html>`;

const FAST_HTML = `<!doctype html><title>fast fixture</title><p id="fast">fast page</p>`;

const SCROLL_HTML = `<!doctype html>
<html><head><title>scroll fixture</title></head>
<body>
  <div style="height: 1800px"></div>
  <button id="scrolled-action" type="button">Scrolled action</button>
  <button id="zero-area" type="button" style="display:block;width:0;height:0;padding:0;border:0;overflow:hidden">Zero-area action</button>
  <p id="scroll-result">idle</p>
  <script>
    document.getElementById("scrolled-action").addEventListener("click", () => {
      document.getElementById("scroll-result").textContent = "scrolled clicked";
    });
  </script>
</body></html>`;

function routeFixture(
  request: IncomingMessage,
  response: import("node:http").ServerResponse,
): void {
  if (request.url === "/slow") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.write("<!doctype html><title>slow fixture</title><p>loading");
    slowRequestStarted?.();
    return;
  }

  const body =
    request.url === "/inner"
      ? INNER_HTML
      : request.url === "/frame"
        ? FRAME_HTML
        : request.url === "/login"
          ? LOGIN_HTML
          : request.url === "/scroll"
            ? SCROLL_HTML
            : FAST_HTML;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

async function startFixtureServer(): Promise<void> {
  server = createServer(routeFixture);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("fixture server did not bind a port");
  }
  origin = `http://127.0.0.1:${address.port}`;
}

function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  return callStaveMcpTool(endpoint, name, {
    workspaceId: E2E_WORKSPACE_ID,
    ...args,
  });
}

type SnapshotPayload = { snapshot: string; refCount: number; url: string };

function refFor(snapshot: string, text: string): string {
  const line = snapshot
    .split("\n")
    .find((candidate) => candidate.includes(text));
  expect(line, `no snapshot line mentioning ${text}`).toBeTruthy();
  const match = /\[ref=(d\d+(?:f\d+)?e\d+)\]/.exec(line ?? "");
  expect(match, `no ref on line: ${line}`).toBeTruthy();
  return match![1];
}

async function snapshot(includeFrames = false): Promise<SnapshotPayload> {
  const result = await callTool("stave_lens_snapshot", { includeFrames });
  expect(result.isError, result.text).toBe(false);
  return result.structuredContent as SnapshotPayload;
}

async function navigate(pathname: string): Promise<void> {
  const result = await callTool("stave_lens_navigate", {
    url: `${origin}${pathname}`,
  });
  expect(result.isError, result.text).toBe(false);
}

test.beforeAll(async () => {
  projectDir = await mkdtemp(
    path.join(tmpdir(), "stave-lens-boundaries-project-"),
  );
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
      lensAgentPresentationMode: "agent-decides",
    },
  });
  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
  await navigate("/fast");
});

test.afterAll(async () => {
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a child-frame snapshot ref clicks and types inside that frame", async () => {
  await navigate("/frame");
  await expect
    .poll(async () => (await snapshot(true)).snapshot, { timeout: 20_000 })
    .toContain("inner frame fixture");

  const frameSnapshot = await snapshot(true);
  expect(frameSnapshot.refCount).toBeGreaterThan(0);
  expect(frameSnapshot.snapshot).toContain("# frame f1");

  const action = await callTool("stave_lens_click", {
    target: refFor(frameSnapshot.snapshot, "Inner action"),
  });
  expect(action.isError, action.text).toBe(false);

  const typed = "frame-user@example.test";
  const type = await callTool("stave_lens_type", {
    target: refFor(frameSnapshot.snapshot, 'textbox "Inner email"'),
    text: typed,
  });
  expect(type.isError, type.text).toBe(false);

  const child = stave.app
    .windows()
    .find((page) => page.url().startsWith(`${origin}/frame`));
  expect(child).toBeDefined();
  const inner = child!
    .frames()
    .find((frame) => frame.url().startsWith(`${origin}/inner`));
  expect(inner).toBeDefined();
  await expect(inner!.locator("#inner-result")).toHaveText("inner clicked");
  await expect(inner!.locator("#inner-field")).toHaveValue(typed);
});

test("a scrolled main-frame ref clicks while hidden targets still fail loudly", async () => {
  await navigate("/scroll");
  const mainSnapshot = await snapshot();

  const clicked = await callTool("stave_lens_click", {
    target: refFor(mainSnapshot.snapshot, "Scrolled action"),
  });
  expect(clicked.isError, clicked.text).toBe(false);

  const guest = stave.app
    .windows()
    .find((page) => page.url().startsWith(`${origin}/scroll`));
  expect(guest).toBeDefined();
  await expect(guest!.locator("#scroll-result")).toHaveText("scrolled clicked");

  const hidden = await callTool("stave_lens_click", { target: "#zero-area" });
  expect(hidden.isError).toBe(true);
  expect(hidden.text).toMatch(/layout box|box model|not found/i);
});

test("saved-account fill stays metadata-only and fills only the matching local host", async () => {
  const password = "local-fixture-password-not-for-logs";
  const username = "lens-fixture@example.test";
  const created = await callStaveMcpTool(
    endpoint,
    "stave_lens_create_saved_account",
    {
      input: {
        hosts: ["127.0.0.1"],
        username,
        password,
        autoFill: false,
      },
    },
  );
  expect(created.isError, created.text).toBe(false);
  expect(JSON.stringify(created.structuredContent)).not.toContain(password);
  expect(JSON.stringify(created.structuredContent)).toContain(username);

  await navigate("/login");
  const fill = await callTool("stave_lens_fill_saved_account", { username });
  expect(fill.isError, fill.text).toBe(false);
  expect(JSON.stringify(fill.structuredContent)).not.toContain(password);
  expect(fill.structuredContent).toMatchObject({
    ok: true,
    host: "127.0.0.1",
    filledUsername: true,
    filledPassword: true,
    submitted: false,
  });

  const guest = stave.app
    .windows()
    .find((page) => page.url().startsWith(`${origin}/login`));
  expect(guest).toBeDefined();
  await expect(guest!.locator("#login-user")).toHaveValue(username);
  await expect(guest!.locator("#login-password")).toHaveValue(password);
  await expect(guest!.locator("#submitted")).toHaveText("not submitted");

  const accounts = await callStaveMcpTool(
    endpoint,
    "stave_lens_list_saved_accounts",
    {},
  );
  expect(accounts.isError, accounts.text).toBe(false);
  expect(JSON.stringify(accounts.structuredContent)).not.toContain(password);
});

test("closing a session aborts an in-flight navigation and the id can be reused", async () => {
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  slowRequestStarted = markStarted;
  const inFlight = callTool("stave_lens_navigate", { url: `${origin}/slow` });

  await Promise.race([
    started,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("slow navigation never reached the fixture")),
        10_000,
      ),
    ),
  ]);

  const closed = await callTool("stave_lens_close_session", {});
  expect(closed.isError, closed.text).toBe(false);
  expect(closed.structuredContent).toMatchObject({ ok: true, closed: true });

  const cancelled = await Promise.race([
    inFlight,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error("in-flight navigation did not settle after close")),
        10_000,
      ),
    ),
  ]);
  expect(cancelled.isError).toBe(true);
  expect(cancelled.text.toLowerCase()).toMatch(
    /abort|destroy|closed|navigation|err_failed/,
  );

  slowRequestStarted = undefined;
  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          url: `${origin}/fast`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 30_000 },
    )
    .toBe("ok");
});
