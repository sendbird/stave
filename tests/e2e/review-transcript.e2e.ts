import { expect, test } from "@playwright/test";

test("completed reviews refresh findings after their final transcript arrives", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=idle", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await page.evaluate(async () => {
    const reactPath = "/node_modules/.vite/deps/react.js";
    const clientPath = "/node_modules/.vite/deps/react-dom_client.js";
    const storePath = "/src/store/app.store.ts";
    const hookPath = "/src/components/session/composer-shelf/use-review-transcript.ts";
    const { default: React } = await import(reactPath);
    const { default: { createRoot } } = await import(clientPath);
    const { useAppStore } = await import(storePath);
    const { useReviewTranscript } = await import(hookPath);
    const taskId = "late-review";
    const prompt = { id: "prompt", role: "user", providerId: "user", model: "user",
      content: "End with stave-review-findings", parts: [] };
    const answer = { id: "answer", role: "assistant", providerId: "codex", model: "model",
      content: "Still streaming", isStreaming: true, parts: [] };
    useAppStore.setState({ messagesByTask: {
      ...useAppStore.getState().messagesByTask, [taskId]: [prompt, answer],
    } });
    const item = { status: "ready", child: { delegatedTaskId: taskId,
      delegatedWorkspaceId: useAppStore.getState().activeWorkspaceId,
      result: "bounded receipt", completedAt: "2026-10-05T00:00:00Z",
      updatedAt: "2026-10-05T00:00:00Z" } };
    function Probe() {
      const { transcript, findings } = useReviewTranscript(item);
      return React.createElement("pre", { id: "review-probe" }, JSON.stringify({ transcript, findings }));
    }
    const host = document.createElement("div");
    document.body.append(host);
    createRoot(host).render(React.createElement(Probe));
  });
  const probe = page.locator("#review-probe");
  await expect(probe).toContainText('"reply":"bounded receipt"');
  await expect(probe).toContainText('"reason":"missing"');
  await page.evaluate(async () => {
    const storePath = "/src/store/app.store.ts";
    const { useAppStore } = await import(storePath);
    const messages = useAppStore.getState().messagesByTask["late-review"];
    const content = "Final answer\n```stave-review-findings\n" + JSON.stringify({
      verdict: "request-changes", findings: [{ id: "F1", severity: "critical", title: "Late finding" }],
    }) + "\n```";
    useAppStore.setState({ messagesByTask: { ...useAppStore.getState().messagesByTask,
      "late-review": [messages[0], { ...messages[1], content, isStreaming: false }],
    } });
  });
  await expect(probe).toContainText('"replyId":"answer"');
  await expect(probe).toContainText('"title":"Late finding"');
  await expect(probe).toContainText('"findings":{"ok":true');
});
