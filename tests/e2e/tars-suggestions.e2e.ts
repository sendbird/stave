import { expect, test } from "@playwright/test";

for (const language of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const density of ["regular", "compact"]) {
  test(`generated prompt fills only draft; contained at narrow/wide widths ${language}/${theme}/${density}`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&tray=true&lang=${language}&theme=${theme}&density=${density}`);
    const chip = page.locator("[data-tars-suggestion]").first();
    await expect(chip).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [560, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await chip.evaluate((node) => {
        const row = node.closest("[data-tars-suggestions]")!;
        const style = getComputedStyle(row);
        return { overflow: row.scrollWidth - row.clientWidth, gap: parseFloat(style.gap), token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--aui-space-8")) * parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.gap).toBe(geometry.token);
    }
    const prompt = await chip.getAttribute("title");
    const messages = await page.locator("[data-tars-message]").count();
    await chip.click();
    await expect(page.locator("[data-tars-composer]").getByRole("textbox")).toHaveText(prompt!);
    await expect(page.locator("[data-tars-composer]").getByRole("textbox")).toBeFocused();
    await expect(page.locator("[data-tars-message]")).toHaveCount(messages);
    await expect(page.locator("[data-tars-suggestion]")).toHaveCount(0);
  });
}
for (const mode of ["empty", "failed", "noSettings"]) test(`honest ${mode} state`, async ({ page }) => {
  await page.goto(`/?stavePreview=tars&tray=true&suggestions=${mode}&suggestionDelay=900`);
  await expect(page.locator('[data-tars-suggestions-status="loading"]')).toBeVisible();
  await expect(page.locator(`[data-tars-suggestions-status="${mode === "empty" ? "ready" : mode === "failed" ? "provider" : "noSettings"}"]`)).toBeVisible();
  await expect(page.locator("[data-tars-suggestion]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(mode === "failed" ? 1 : 0);
});

test("hook suppresses stale results, reuses in-flight calls and caches empty/failure without loops", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true");
  await expect(page.locator("[data-tars-composer]")).toBeVisible();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const reactPath = moduleUrl("react"), clientPath = moduleUrl("react-dom_client"), hookPath = "/src/components/tars/use-tars-suggestions.ts";
    const { default: React } = await import(reactPath);
    const { default: { createRoot } } = await import(clientPath);
    const { useTarsSuggestions } = await import(hookPath);
    const requests: any[] = [], renders: any[] = [];
    let setFact: any, retry: any;
    const bridge = { suggest: (input: any) => new Promise((resolve) => requests.push({ input, resolve })) };
    function Probe() {
      const [title, setTitle] = React.useState("A"); setFact = setTitle;
      const value = useTarsSuggestions({ bridge, facts: [{ kind: "blocked", title, count: 1 }], language: "en", model: "codex:model" });
      retry = value.retry;
      renders.push({ title, ...value.state });
      return React.createElement("pre", { id: "suggestion-probe" }, JSON.stringify({ title, ...value.state }));
    }
    const host = document.createElement("div"); document.body.append(host); createRoot(host).render(React.createElement(Probe));
    (window as any).suggestionProbe = { requests, renders, set: (title: string) => setFact(title), retry: () => retry(), resolve: (index: number, items: any[]) => { const r = requests[index]; r.resolve({ status: "generated", requestId: r.input.requestId, providerId: "codex", model: "model", suggestions: items }); } };
  });
  const probe = page.locator("#suggestion-probe");
  await expect.poll(() => page.evaluate(() => (window as any).suggestionProbe.requests.length)).toBe(1);
  await page.evaluate(() => (window as any).suggestionProbe.set("B"));
  await expect(probe).toContainText('"title":"B"');
  await page.evaluate(() => (window as any).suggestionProbe.resolve(0, [{ label: "old", prompt: "old" }]));
  await expect.poll(() => page.evaluate(() => (window as any).suggestionProbe.requests.length)).toBe(2);
  await expect(probe).toContainText('"status":"loading"');
  await page.evaluate(() => (window as any).suggestionProbe.resolve(1, []));
  await expect(probe).toContainText('"items":[]');
  await page.evaluate(() => (window as any).suggestionProbe.set("A"));
  await expect(probe).toContainText('"label":"old"');
  await page.evaluate(() => (window as any).suggestionProbe.set("B"));
  await expect(probe).toContainText('"items":[]');
  const stale = await page.evaluate(() => (window as any).suggestionProbe.renders.some((r: any) => r.title === "B" && r.items?.some((i: any) => i.label === "old")));
  expect(stale).toBe(false);
  expect(await page.evaluate(() => (window as any).suggestionProbe.requests.length)).toBe(2);
  await page.evaluate(() => (window as any).suggestionProbe.retry());
  await expect.poll(() => page.evaluate(() => (window as any).suggestionProbe.requests.length)).toBe(3);
  await page.evaluate(() => (window as any).suggestionProbe.set("A"));
  await expect(probe).toContainText('"label":"old"');
  await page.evaluate(() => (window as any).suggestionProbe.set("B"));
  await expect(probe).toContainText('"status":"loading"');
  await page.evaluate(() => { const p = (window as any).suggestionProbe; const r = p.requests[2]; r.resolve({ status: "failed", requestId: r.input.requestId, reason: "provider" }); });
  await expect(probe).toContainText('"status":"failed"');
  await page.evaluate(() => (window as any).suggestionProbe.set("A"));
  await expect(probe).toContainText('"label":"old"');
  await page.evaluate(() => (window as any).suggestionProbe.set("B"));
  await expect(probe).toContainText('"status":"failed"');
  expect(await page.evaluate(() => (window as any).suggestionProbe.requests.length)).toBe(3);
});
