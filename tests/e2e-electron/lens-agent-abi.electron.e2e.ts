import { createServer, type Server } from "node:http";
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

/**
 * The agent ABI, driven the way an agent drives it.
 *
 * Every assertion here is about one property: **an action addressed by `ref`
 * either happens to the element the snapshot described, or fails loudly.** That
 * is the whole difference from a CSS selector, which is re-resolved against the
 * live document on every use and so reports success whether it matched the
 * intended element, a different one, or — after a re-render — an element that
 * did not exist when the agent decided to act.
 *
 * Selectors are still accepted and still tested here, because they remain the
 * escape hatch for what a snapshot cannot name. What is tested is that the two
 * are told apart correctly, including for a selector whose text happens to
 * contain a ref-shaped run.
 *
 * Requires `bun run build:desktop`.
 */

let stave: StaveApp;
let projectDir: string;
let server: Server;
let origin: string;
let endpoint: StaveMcpEndpoint;

/*
 * Two pages, because the interesting failure is a ref used after the document
 * that minted it is gone.
 */
const FORM_HTML = `<!doctype html>
<html>
  <head><title>agent abi fixture</title></head>
  <body style="margin:0;background:#123456;color:white">
    <h1 id="heading">agent abi fixture</h1>
    <button id="act" type="button">Submit order</button>
    <label for="email">Email</label>
    <input id="email" type="text" />
    <button id="disabled-action" type="button" disabled>Cannot press</button>
    <a href="/other" id="away">Go elsewhere</a>
    <p id="log">idle</p>
    <!--
      Filler, so the node budget has something to cut. A fixture small enough to
      fit any budget cannot show that truncation is announced rather than silent.
    -->
    <ul id="filler">
      ${Array.from({ length: 40 }, (_, index) => `<li><button type="button">Filler ${index}</button></li>`).join("")}
    </ul>
    <script>
      document.getElementById("act").addEventListener("click", () => {
        document.getElementById("log").textContent = "clicked";
      });
    </script>
  </body>
</html>`;

const OTHER_HTML = `<!doctype html>
<html>
  <head><title>other page</title></head>
  <body style="margin:0;background:#654321">
    <h1 id="heading">other page</h1>
    <button id="act" type="button">A different button</button>
  </body>
</html>`;

async function startFixtureServer(): Promise<void> {
  server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(request.url?.startsWith("/other") ? OTHER_HTML : FORM_HTML);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
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

type SnapshotPayload = {
  ok: boolean;
  url: string;
  title: string;
  refCount: number;
  truncated: boolean;
  snapshot: string;
  degraded?: boolean;
  actionTimeline?: Array<{ tool: string; status: string; target?: string }>;
};

async function snapshot(
  args: Record<string, unknown> = {},
): Promise<SnapshotPayload> {
  const result = await callTool("stave_lens_snapshot", args);
  expect(result.isError, result.text).toBe(false);
  const payload = result.structuredContent as SnapshotPayload;
  // A degraded snapshot means the accessibility domain refused, and every ref
  // assertion below would be vacuous rather than failing.
  expect(payload.degraded ?? false).toBe(false);
  return payload;
}

/** The ref on the snapshot line whose text contains `needle`. */
function refFor(snapshotText: string, needle: string): string {
  const line = snapshotText
    .split("\n")
    .find((candidate) => candidate.includes(needle));
  expect(line, `no snapshot line mentioning ${needle}`).toBeTruthy();
  const match = /\[ref=(d\d+(?:f\d+)?e\d+)\]/.exec(line ?? "");
  expect(match, `no ref on line: ${line}`).toBeTruthy();
  return match![1];
}

function pageText(selector: string): Promise<string> {
  return callTool("stave_lens_get_text", { target: selector }).then(
    (result) => (result.structuredContent as { text: string }).text,
  );
}

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
      lensAgentPresentationMode: "agent-decides",
    },
  });

  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);

  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          url: `${origin}/form`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 60_000 },
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

test("a snapshot names the page and puts refs on what can be acted on", async () => {
  const payload = await snapshot();

  expect(payload.url).toContain("/form");
  expect(payload.title).toBe("agent abi fixture");
  expect(payload.refCount).toBeGreaterThan(0);

  // The shape is the contract: role, quoted accessible name, then the handle.
  expect(payload.snapshot).toMatch(/button "Submit order".*\[ref=d\d+e\d+\]/);
  expect(payload.snapshot).toMatch(/textbox "Email".*\[ref=d\d+e\d+\]/);
  // A link carries where it goes, so the agent does not have to read the HTML
  // to decide whether following it is what it wants.
  expect(payload.snapshot).toMatch(/link "Go elsewhere".*\/url:/);
});

test("a disabled control is described but not addressable", async () => {
  // A ref on it would only invite an action that can never succeed, and an
  // action that cannot succeed is worse than one the agent never attempts.
  const payload = await snapshot();
  const line = payload.snapshot
    .split("\n")
    .find((candidate) => candidate.includes("Cannot press"));
  expect(line).toBeTruthy();
  expect(line).toContain("disabled");
  expect(line).not.toContain("[ref=");
});

test("clicking by ref acts on the element the snapshot described", async () => {
  expect(await pageText("#log")).toBe("idle");

  const payload = await snapshot();
  const result = await callTool("stave_lens_click", {
    target: refFor(payload.snapshot, "Submit order"),
  });

  expect(result.isError, result.text).toBe(false);
  await expect.poll(() => pageText("#log")).toBe("clicked");
});

test("typing by ref lands in that field, not wherever focus was", async () => {
  const payload = await snapshot();
  // The label renders as its own `StaticText "Email"` line, which carries no
  // ref; the field is the `textbox`.
  const result = await callTool("stave_lens_type", {
    target: refFor(payload.snapshot, 'textbox "Email"'),
    text: "someone@example.test",
  });

  expect(result.isError, result.text).toBe(false);
  const value = await callTool("stave_lens_evaluate", {
    expression: "document.getElementById('email').value",
  });
  expect(JSON.stringify(value.structuredContent)).toContain(
    "someone@example.test",
  );
});

test("inspecting by ref returns that element's box model", async () => {
  const payload = await snapshot();
  const result = await callTool("stave_lens_inspect", {
    target: refFor(payload.snapshot, "Submit order"),
  });

  expect(result.isError, result.text).toBe(false);
  const box = (result.structuredContent as { box: { border: unknown } }).box;
  expect(box).toBeTruthy();
});

test("a selector containing a ref-shaped run is still a selector", async () => {
  /*
   * The regression an unanchored ref pattern produces. `#z2l9d1e43l3` is an ordinary id; matched loosely it would be routed to the ref table, miss, and fail
   * with "take a new snapshot" for a selector that was never a ref.
   */
  const result = await callTool("stave_lens_get_text", {
    target: "#log",
  });
  expect(result.isError, result.text).toBe(false);

  const missing = await callTool("stave_lens_click", {
    target: "#z2l9d1e43l3",
  });
  expect(missing.isError).toBe(true);
  expect(missing.text).toContain("no element matched");
  expect(missing.text).not.toContain("snapshot");
});

test("re-snapshotting an unchanged page marks nothing new", async () => {
  /*
   * The delta marker is only useful if it means something. It broke once
   * because the key was minted in one shape and compared in another, and the
   * result was every node marked `*` on every snapshot — which reads as "the
   * page changed completely" for a page that did not change at all.
   */
  await snapshot();
  const again = await snapshot();
  expect(again.snapshot).not.toContain("* ");
});

test("the action timeline reports what was tried, including failures", async () => {
  const payload = await snapshot({ includeActions: true });
  const timeline = payload.actionTimeline ?? [];

  expect(timeline.length).toBeGreaterThan(0);
  expect(timeline.some((entry) => entry.tool === "stave_lens_click")).toBe(
    true,
  );
  // The failure from the previous test. Keeping failures is the more useful
  // half: without them a model retries an impossible action every turn.
  expect(timeline.some((entry) => entry.status === "failed")).toBe(true);
});

test("token controls narrow the snapshot without losing what is addressable", async () => {
  const full = await snapshot();
  const narrow = await snapshot({ interactableOnly: true });

  expect(narrow.snapshot.length).toBeLessThan(full.snapshot.length);
  // Descriptive nodes go; the document root goes with them, because it is not
  // something an action can address even though Chromium reports it focusable.
  expect(narrow.snapshot).not.toContain("RootWebArea");
  expect(narrow.snapshot).not.toContain("StaticText");
  expect(narrow.refCount).toBe(full.refCount);

  const budgeted = await snapshot({ maxNodes: 20 });
  expect(budgeted.truncated).toBe(true);
  // Truncation is announced, never silent: an agent that cannot see the cut
  // concludes the page simply ends there.
  expect(budgeted.snapshot).toContain("more below");
});

test("a ref from a page that has navigated fails loudly instead of acting", async () => {
  const before = await snapshot();
  const staleRef = refFor(before.snapshot, "Submit order");

  await callTool("stave_lens_navigate", { url: `${origin}/other` });
  await expect
    .poll(async () => (await snapshot()).url, { timeout: 20_000 })
    .toContain("/other");

  /*
   * The destination has a `#act` button too, so a selector-based agent would
   * have clicked *something* here and reported success. The ref is keyed to the
   * document that minted it, so it cannot.
   */
  const result = await callTool("stave_lens_click", { target: staleRef });

  expect(result.isError).toBe(true);
  expect(result.text).toContain("snapshot");
  expect(result.text.toLowerCase()).toMatch(/navigat|not in the current/);
});

test("a fresh snapshot after navigating restores addressability", async () => {
  const payload = await snapshot();
  expect(payload.url).toContain("/other");

  const result = await callTool("stave_lens_get_text", {
    target: refFor(payload.snapshot, "A different button"),
  });
  expect(result.isError, result.text).toBe(false);
  expect((result.structuredContent as { text: string }).text).toContain(
    "A different button",
  );
});

test("appearance emulation changes what the page reports, and the snapshot says so", async () => {
  const before = await callTool("stave_lens_evaluate", {
    expression:
      "String(window.matchMedia('(prefers-color-scheme: dark)').matches)",
  });
  expect(JSON.stringify(before.structuredContent)).toContain('"false"');

  const applied = await callTool("stave_lens_set_appearance", {
    colorScheme: "dark",
  });
  expect(applied.isError, applied.text).toBe(false);

  const after = await callTool("stave_lens_evaluate", {
    expression:
      "String(window.matchMedia('(prefers-color-scheme: dark)').matches)",
  });
  expect(JSON.stringify(after.structuredContent)).toContain('"true"');

  /*
   * Reported without being asked for, because a forced appearance changes what
   * every visual read means. An agent that set one many calls ago and forgot
   * would otherwise read a forced dark theme as the page's real one.
   */
  const payload = (await snapshot()) as SnapshotPayload & {
    appearance?: { colorScheme?: string | null };
  };
  expect(payload.appearance?.colorScheme).toBe("dark");
});

test("appearance emulation is incremental across features", async () => {
  // Asking for reduced motion must not silently drop the scheme set above.
  const applied = await callTool("stave_lens_set_appearance", {
    reducedMotion: "reduce",
  });
  expect(applied.isError, applied.text).toBe(false);

  const motion = await callTool("stave_lens_evaluate", {
    expression:
      "String(window.matchMedia('(prefers-reduced-motion: reduce)').matches)",
  });
  expect(JSON.stringify(motion.structuredContent)).toContain('"true"');

  const stillDark = await callTool("stave_lens_evaluate", {
    expression:
      "String(window.matchMedia('(prefers-color-scheme: dark)').matches)",
  });
  expect(JSON.stringify(stillDark.structuredContent)).toContain('"true"');
});

test("reset returns the page to the machine's own settings", async () => {
  const applied = await callTool("stave_lens_set_appearance", { reset: true });
  expect(applied.isError, applied.text).toBe(false);

  const scheme = await callTool("stave_lens_evaluate", {
    expression:
      "String(window.matchMedia('(prefers-color-scheme: dark)').matches)",
  });
  expect(JSON.stringify(scheme.structuredContent)).toContain('"false"');

  // And the snapshot stops claiming an override the page no longer has.
  const payload = (await snapshot()) as SnapshotPayload & {
    appearance?: unknown;
  };
  expect(payload.appearance).toBeUndefined();
});
