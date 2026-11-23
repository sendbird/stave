import { expect, test, type Page } from "@playwright/test";

const labels = {
  en: { ports: "Listening ports", owned: "Owned by Stave", inferred: "Inferred" },
  ko: { ports: "수신 대기 포트", owned: "Stave 관리", inferred: "소속 추정" },
} as const;

async function mountPanel(page: Page, locale: "en" | "ko", theme: "light" | "dark", density: "regular" | "compact") {
  await page.goto(`/?stavePreview=aui-regressions&theme=${theme}`);
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async ({ locale, density }) => {
    const { React, createRoot } = await import("/tests/e2e/segmented-runtime.ts");
    const { WorkspaceScriptsPanel } = await import("/src/components/layout/WorkspaceScriptsPanel.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { applyAppLocale } = await import("/src/i18n/index.ts");

    applyAppLocale(locale);
    document.documentElement.dataset.uiDensity = density;
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "workspace-ports-host";
    host.style.cssText = "width:420px;height:600px";
    document.body.append(host);

    const observed = { polls: [] as string[], navigations: [] as string[], sessions: [] as string[] };
    Object.assign(window, { observedPorts: observed });
    window.api = {
      scripts: {
        getConfig: async () => ({ ok: true, config: null }),
        getStatus: async () => ({ ok: true, statuses: [] }),
        listListeningPorts: async ({ workspaceId }) => {
          observed.polls.push(workspaceId);
          return {
            status: "available",
            ports: [
              { pid: 40, host: "0.0.0.0", port: 5173, processName: "node", attribution: "owned" },
              { pid: 41, host: "::", port: 6006, processName: "very-long-development-server-process-name", attribution: "inferred" },
            ],
          };
        },
      },
      lens: {
        openSession: async ({ lensSessionId }) => {
          observed.sessions.push(lensSessionId);
          return { ok: true };
        },
        navigate: async ({ url }) => {
          observed.navigations.push(url);
          return { ok: true };
        },
      },
    };
    useAppStore.setState({
      activeWorkspaceId: "ports-workspace",
      repositoryPath: "/tmp/ports-project",
      workspacePathById: { "ports-workspace": "/tmp/ports-project" },
      createLensTab: () => "test-lens-tab",
    });

    function Harness() {
      const [visible, setVisible] = React.useState(true);
      return React.createElement("div", { style: { height: "100%" } },
        React.createElement("button", { id: "toggle-ports-panel", onClick: () => setVisible(!visible) }, "Toggle panel"),
        React.createElement(WorkspaceScriptsPanel, { visible }),
      );
    }

    createRoot(host).render(React.createElement(StaveDesignProvider, null, React.createElement(Harness)));
    await document.fonts.ready;
  }, { locale, density });
  const region = page.getByRole("region", { name: labels[locale].ports, exact: true });
  await expect(region.getByText("[::]:6006", { exact: true })).toBeVisible();
  return region;
}

function observed(page: Page) {
  return page.evaluate(() => (window as unknown as {
    observedPorts: { polls: string[]; navigations: string[]; sessions: string[] };
  }).observedPorts);
}

test("polls only while the Processes view is visible and opens the wildcard endpoint through Lens", async ({ page }) => {
  await page.clock.install();
  const region = await mountPanel(page, "en", "dark", "regular");
  await region.getByRole("button", { name: "Open [::]:6006 in Lens", exact: true }).click();
  expect(await observed(page)).toMatchObject({ sessions: ["test-lens-tab"], navigations: ["http://[::1]:6006"] });

  async function countPolls() {
    return (await observed(page)).polls.length;
  }
  async function expectPollingPaused() {
    await expect(region).toBeHidden();
    const count = await countPolls();
    await page.clock.runFor(6_200);
    expect(await countPolls()).toBe(count);
  }

  const first = await countPolls();
  await page.clock.runFor(3_100);
  expect(await countPolls()).toBe(first + 1);

  await page.getByRole("tab", { name: /^Commands/ }).click();
  await expectPollingPaused();
  await page.getByRole("tab", { name: /^Processes/ }).click();
  await expect(region).toBeVisible();

  const search = page.getByRole("textbox", { name: "Find a workspace tool" });
  await search.fill("dev server");
  await expectPollingPaused();
  await search.clear();
  await expect(region).toBeVisible();

  await page.locator("#toggle-ports-panel").click();
  await expectPollingPaused();
  await page.locator("#toggle-ports-panel").click();
  await expect(region).toBeVisible();

  const beforeDocumentHidden = await countPolls();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(6_200);
  expect(await countPolls()).toBe(beforeDocumentHidden);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(countPolls).toBe(beforeDocumentHidden + 1);
  expect(new Set((await observed(page)).polls)).toEqual(new Set(["ports-workspace"]));
});

for (const locale of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`keeps the listening endpoint and Lens action inside the rail (${locale}/${theme}/${density})`, async ({ page }) => {
        const region = await mountPanel(page, locale, theme, density);
        const copy = labels[locale];
        await expect(region.getByText(copy.owned, { exact: true })).toBeVisible();
        await expect(region.getByText(copy.inferred, { exact: true })).toBeVisible();
        await expect(region.getByRole("button")).toHaveCount(2);
        for (const width of [240, 420]) {
          await page.locator("#workspace-ports-host").evaluate((host, width) => { host.style.width = `${width}px`; }, width);
          const row = region.getByText("[::]:6006", { exact: true }).locator("../..");
          const layout = await row.evaluate(async (element) => {
            const { vars } = await import("/src/components/aui/tokens/tokens.stylex.ts");
            const probe = document.createElement("div");
            probe.style.width = vars["--aui-space-8"];
            element.append(probe);
            const expectedGap = Number.parseFloat(getComputedStyle(probe).width);
            probe.remove();
            const box = element.getBoundingClientRect();
            const details = element.firstElementChild!.getBoundingClientRect();
            const action = element.querySelector("button")!.getBoundingClientRect();
            return {
              gapError: Math.abs(action.left - details.right - expectedGap),
              centerError: Math.abs(action.top + action.height / 2 - (details.top + details.height / 2)),
              overflow: Math.max(element.scrollWidth - element.clientWidth, action.right - box.right),
              color: getComputedStyle(element.querySelector("code")!).color,
              theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            };
          });
          // A pair of DOM boxes can round differently by half a CSS pixel.
          expect(layout.gapError).toBeLessThanOrEqual(0.5);
          expect(layout.centerError).toBeLessThanOrEqual(0.5);
          expect(layout.overflow).toBeLessThanOrEqual(1);
          expect(layout.theme).toBe(theme);
          expect(layout.color).not.toBe("rgba(0, 0, 0, 0)");
        }
      });
    }
  }
}
