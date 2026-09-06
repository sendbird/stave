import { buildPromptDraftDisplayPartsForSend } from "../../src/store/prompt-draft-message-content";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_LENS_SESSION_ID,
  E2E_WORKSPACE_ID,
  launchStave,
  openLensSurface,
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
 * Native qualification for the Lens visual-comment to task-draft path.
 *
 * An empty task shell is persisted through the product bridge, a real Lens
 * session is opened, and the real annotation overlay is armed through the
 * toolbar. The guest page receives a trusted mouse click and keyboard input,
 * which creates an annotation through the overlay's normal beacon path. The
 * test then checks both the agent-facing annotation read and the persisted
 * task draft. No annotation state is injected and no provider turn is
 * submitted.
 *
 * Requires the existing `out/` desktop build. The parent qualification owns
 * the integration build when source/build drift needs resolving.
 */

const COMMENT = "Make the fixture action easier to find";
const TASK_ID = "task-e2e-lens-annotation";
const FIXTURE_HTML = `<!doctype html>
<html>
  <head><title>lens annotation fixture</title></head>
  <body style="margin: 24px; font: 18px system-ui">
    <h1>lens annotation fixture</h1>
    <button id="target" style="margin-top: 24px; padding: 16px 28px">
      Fixture action
    </button>
  </body>
</html>`;

let stave: StaveApp;
let endpoint: StaveMcpEndpoint;
let projectDir: string;
let server: Server;
let origin: string;
let updatedFixture = false;
let taskId: string;

async function startFixtureServer(): Promise<void> {
  server = createServer((request, response) => {
    response.writeHead(request.url === "/fixture" ? 200 : 404, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(request.url === "/fixture" ? (updatedFixture ? FIXTURE_HTML.replace("Fixture action", "Updated action") : FIXTURE_HTML) : "not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("annotation fixture server did not bind a port");
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

function findGuestPage(): Page | undefined {
  return stave.app.windows().find((window) => window.url().startsWith(origin));
}

type Annotation = {
  comment: string;
  review?: {
    page?: { url?: string };
    feedback?: { comment?: string };
  };
};

type AnnotationPayload = { annotations: Annotation[] };

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

  // The draft attachment pipeline is task-scoped. Seed only the empty task
  // shell through the product persistence bridge; annotation state itself is
  // created below through real trusted guest input.
  const seededTask = await stave.page.evaluate(
    async ({ workspaceId, taskId }) => {
      const loaded = await window.api.persistence?.loadWorkspace?.({
        workspaceId,
      });
      if (!loaded?.snapshot) {
        throw new Error("Fixture workspace snapshot was unavailable");
      }
      const snapshot = loaded.snapshot;
      const task = {
        id: taskId,
        title: "Lens annotation fixture task",
        provider: "codex" as const,
        updatedAt: "2026-09-06T01:00:00.000Z",
        unread: false,
      };
      return window.api.persistence?.upsertWorkspace?.({
        id: workspaceId,
        name: "e2e",
        snapshot: {
          ...snapshot,
          activeTaskId: taskId,
          tasks: [task],
          messagesByTask: { ...snapshot.messagesByTask, [taskId]: [] },
          promptDraftByTask: {
            ...(snapshot.promptDraftByTask ?? {}),
            [taskId]: { text: "", attachedFilePaths: [], attachments: [] },
          },
          providerSessionByTask: {
            ...(snapshot.providerSessionByTask ?? {}),
            [taskId]: {},
          },
          messageCountByTask: {
            ...(snapshot.messageCountByTask ?? {}),
            [taskId]: 0,
          },
        },
      });
    },
    { workspaceId: E2E_WORKSPACE_ID, taskId: TASK_ID },
  );
  expect(seededTask?.ok).toBe(true);
  taskId = TASK_ID;
  await stave.page.reload({ waitUntil: "domcontentloaded" });
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });

  await openLensSurface(stave.page);
  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
  await expect
    .poll(
      () =>
        stave.page.evaluate(
          async ({ workspaceId, lensSessionId, url }) =>
            (
              await window.api.lens?.navigate?.({
                workspaceId,
                lensSessionId,
                url,
              })
            )?.ok === true,
          {
            workspaceId: E2E_WORKSPACE_ID,
            lensSessionId: E2E_LENS_SESSION_ID,
            url: `${origin}/fixture`,
          },
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect
    .poll(() => Boolean(findGuestPage()), { timeout: 30_000 })
    .toBe(true);
});

test.afterAll(async () => {
  if (stave) {
    await stave.page
      .evaluate(
        async ({ workspaceId, lensSessionId }) =>
          window.api.lens?.stopAnnotationMode?.({
            workspaceId,
            lensSessionId,
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

test("a real visual comment becomes a task draft attachment", async ({}, testInfo) => {
  const toggle = stave.page.getByRole("button", {
    name: "Toggle visual comments",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const guest = findGuestPage();
  expect(guest).toBeDefined();
  const target = guest!.locator("#target");
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();

  // The overlay lives inside a closed shadow root, so trusted page input is the
  // meaningful public interaction: click the real target, type into the
  // focused comment field, and submit with the real Enter key.
  await guest!.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await guest!.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await guest!.keyboard.type(COMMENT);
  await guest!.keyboard.press("Enter");

  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_get_annotations");
        if (result.isError) return null;
        const payload = result.structuredContent as AnnotationPayload;
        return (
          payload.annotations.find(
            (annotation) => annotation.comment === COMMENT,
          ) ?? null
        );
      },
      { timeout: 20_000 },
    )
    .toMatchObject({
      comment: COMMENT,
      review: {
        page: { url: `${origin}/fixture` },
        feedback: { comment: COMMENT },
      },
    });

  // The attachment is persisted by the normal workspace snapshot path. Its
  // presence is also what makes the send button eligible, but this test
  // intentionally never clicks Send.
  await expect
    .poll(
      async () =>
        stave.page.evaluate(
          async ({ workspaceId, taskId }) => {
            const result = await window.api.persistence?.loadWorkspaceShell?.({
              workspaceId,
            });
            const attachments =
              result?.shell?.promptDraftByTask?.[taskId]?.attachments ?? [];
            return (
              attachments.find(
                (attachment) => attachment.kind === "lens-annotations",
              ) ?? null
            );
          },
          { workspaceId: E2E_WORKSPACE_ID, taskId },
        ),
      { timeout: 20_000 },
    )
    .toMatchObject({
      kind: "lens-annotations",
      workspaceId: E2E_WORKSPACE_ID,
      count: 1,
      summary: expect.stringContaining(COMMENT),
    });

  const tray = stave.page.getByRole("region", { name: "Visual feedback draft" });
  await expect(tray.getByLabel("Requested change")).toHaveValue(COMMENT);
  await tray.getByLabel("Requested change").fill("Discard this edit");
  await tray.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(tray.getByLabel("Requested change")).toHaveValue(COMMENT);
  const revised = "Increase the target contrast and keep its label";
  await tray.getByLabel("Requested change").fill(revised);
  await tray.getByRole("button", { name: "Save to draft", exact: true }).click();
  await expect.poll(async () => stave.page.evaluate(async ({ workspaceId, taskId }) => {
    const result = await window.api.persistence?.loadWorkspaceShell?.({ workspaceId });
    return result?.shell?.promptDraftByTask?.[taskId]?.attachments.find((item) => item.kind === "lens-annotations")?.summary;
  }, { workspaceId: E2E_WORKSPACE_ID, taskId })).toContain(revised);
  await tray.getByRole("button", { name: "Enlarge captured target 1" }).click();
  const lightbox = stave.page.getByTestId("image-lightbox");
  await expect(lightbox).toBeVisible();
  await lightbox.getByRole("button", { name: "Zoom in", exact: true }).click();
  await lightbox.getByRole("button", { name: "Reset zoom" }).click();
  await stave.page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  await tray.screenshot({ path: testInfo.outputPath("lens-feedback-draft.png") });

  const messages = await stave.page.evaluate(
    async ({ workspaceId, taskId }) =>
      window.api.persistence?.loadTaskMessages?.({ workspaceId, taskId }),
    { workspaceId: E2E_WORKSPACE_ID, taskId },
  );
  expect(messages?.page.totalCount ?? 0).toBe(0);
});


test("sent feedback replays from persistence beside the changed preview", async ({}, testInfo) => {
  const loaded = await stave.page.evaluate(async (workspaceId) => window.api.persistence?.loadWorkspace?.({ workspaceId }), E2E_WORKSPACE_ID);
  const draft = loaded?.snapshot?.promptDraftByTask?.[taskId];
  expect(draft).toBeDefined();
  const displayParts = buildPromptDraftDisplayPartsForSend(draft!);
  const originalImage = displayParts?.find((part) => part.type === "image_context");
  expect(originalImage?.type).toBe("image_context");
  await stave.page.evaluate(async ({ workspaceId, lensSessionId }) => {
    await window.api.lens?.stopAnnotationMode?.({ workspaceId, lensSessionId });
    await window.api.lens?.clearAnnotations?.({ workspaceId, lensSessionId });
  }, { workspaceId: E2E_WORKSPACE_ID, lensSessionId: E2E_LENS_SESSION_ID });
  // Replay a sent conversation through real storage. This isolates review from
  // external provider execution; it does not claim that an agent made the edit.
  const saved = await stave.page.evaluate(async ({ workspaceId, taskId, displayParts }) => {
    const current = await window.api.persistence?.loadWorkspace?.({ workspaceId });
    if (!current?.snapshot) throw new Error("Missing workspace");
    return window.api.persistence?.upsertWorkspace?.({ id: workspaceId, name: "e2e", snapshot: {
      ...current.snapshot,
      messagesByTask: { ...current.snapshot.messagesByTask, [taskId]: [{ id: "sent-feedback", role: "user", model: "user", providerId: "user", content: "Increase contrast", parts: [{ type: "text", text: "Increase contrast" }], displayParts }] },
      messageCountByTask: { ...current.snapshot.messageCountByTask, [taskId]: 1 },
      promptDraftByTask: { ...current.snapshot.promptDraftByTask, [taskId]: { text: "", attachedFilePaths: [], attachments: [] } },
    } });
  }, { workspaceId: E2E_WORKSPACE_ID, taskId, displayParts });
  expect(saved?.ok).toBe(true);
  await stave.page.reload({ waitUntil: "domcontentloaded" });
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible();
  await openLensSurface(stave.page);
  const review = stave.page.getByRole("region", { name: "Sent visual feedback" });
  await expect(review).toBeVisible();
  await expect(review.getByText("Increase the target contrast and keep its label", { exact: true })).toBeVisible();
  await expect(review.getByRole("img", { name: "Captured target 1" })).toHaveAttribute("src", originalImage!.type === "image_context" ? originalImage!.dataUrl : "");
  updatedFixture = true;
  await review.getByRole("button", { name: "Open captured page" }).click();
  await expect.poll(async () => await findGuestPage()?.locator("#target").textContent()).toContain("Updated action");
  await review.getByRole("button", { name: "Reload to check changes" }).click();
  await expect(review.getByRole("img")).toBeVisible();
  await review.screenshot({ path: testInfo.outputPath("lens-sent-feedback.png") });
});
