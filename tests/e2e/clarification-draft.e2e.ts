import { expect, test, type Page } from "@playwright/test";

async function mount(page: Page, surface: "trace" | "composer") {
  await page.goto("/?stavePreview=composer-frame&case=idle");
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toBeVisible();
  await page.evaluate(async (surface) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { AssistantMessageBody } = await import("/src/components/session/message/assistant-trace.tsx");
    const { UserInputCard } = await import("/src/components/ai-elements/user-input-card.tsx");
    const { useAppStore } = await import("/src/store/app.store.ts");
    const host = document.createElement("div");
    host.id = "draft-regression";
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const question = { type: "user_input", requestId: "request-1", toolName: "request_user_input_async", state: "input-requested", delivery: "async", questions: [{ key: "notes", header: "Notes", question: "Any constraints?", options: [] }] };
    let before: unknown[] = [];
    const render = () => root.render(surface === "trace"
      ? React.createElement(AssistantMessageBody, { taskId: "draft-task", messageId: "draft-message", streamingEnabled: true, message: { role: "assistant", content: "", isStreaming: true, parts: [...before, structuredClone(question)] } })
      : React.createElement(UserInputCard, { key: question.requestId, toolName: question.toolName, questions: structuredClone(question.questions), state: question.state, answers: {}, presentation: "composer", onSubmit: (answers: unknown) => { (window as any).submittedDraft = answers; } }));
    useAppStore.setState({ resolveUserInput: (args: unknown) => { (window as any).submittedDraft = args; } });
    (window as any).updateDraftFixture = (replace = false) => {
      before = [{ type: "system_event", content: "Background event received" }];
      if (replace) question.requestId = "request-2";
      render();
    };
    render();
  }, surface);
}

for (const surface of ["trace", "composer"] as const) {
  for (const dark of [false, true]) {
    test(`${surface} preserves a draft and focus across turn events (${dark ? "dark" : "light"})`, async ({ page }) => {
      await mount(page, surface);
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
      const field = page.locator("#draft-regression").getByRole("textbox");
      await field.fill("한글 draft in progress");
      await field.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 7));
      await page.evaluate(() => (window as any).updateDraftFixture());
      await expect(field).toHaveValue("한글 draft in progress");
      await expect(field).toBeFocused();
      expect(await field.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([3, 7]);
      await page.getByRole("button", { name: surface === "trace" ? "Submit" : "Continue", exact: true }).click();
      const submitted = await page.evaluate(() => (window as any).submittedDraft);
      expect(surface === "trace" ? submitted.answers : submitted).toEqual({ notes: "한글 draft in progress" });
      await page.evaluate(() => (window as any).updateDraftFixture(true));
      await expect(field).toHaveValue("");
    });
  }
}
