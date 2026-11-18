import { expect, test } from "@playwright/test";

for (const strict of [false, true]) {
  test(`assignment updates survive the first consumer unmount (strict=${strict})`, async ({ page }) => {
    // A cold Vite dependency optimization can outlast the default test budget.
    test.setTimeout(90_000);
    await page.goto("/tests/e2e/fixtures/agent-assignment-sync.html");
    await page.evaluate(async (strict) => {
      const reactPath = "/node_modules/.vite/deps/react.js";
      const domPath = "/node_modules/.vite/deps/react-dom_client.js";
      const storePath = "/src/store/agent-assignments-store.ts";
      const startersPath = "/src/lib/agents/starters.ts";
      const React = (await import(reactPath)).default;
      const { createRoot } = (await import(domPath)).default;
      const { useAgentAssignmentsSync, useAgentAssignmentsStore } = await import(storePath);
      const { getBuiltinAgent } = await import(startersPath);
      const listeners = new Set<() => void>();
      let assignments: unknown[] = [];
      Object.assign(window, { api: { agents: {
        listAssignments: async () => ({ ok: true, value: assignments }),
        subscribeChanged: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      } } });
      useAgentAssignmentsStore.setState({ byTaskId: {}, loaded: false });
      function Consumer() {
        useAgentAssignmentsSync();
        const agent = useAgentAssignmentsStore((state: { byTaskId: Record<string, { agentName: string }> }) => state.byTaskId["tars-task"]);
        return React.createElement("output", null, agent?.agentName ?? "Auto");
      }
      function mount(id: string) {
        const host = document.createElement("div");
        host.id = id;
        document.body.append(host);
        const root = createRoot(host);
        root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Consumer)) : React.createElement(Consumer));
        return root;
      }
      const first = mount("first-consumer");
      Object.assign(window, { syncTest: {
        mountSecond: () => { Object.assign(window, { secondRoot: mount("second-consumer") }); },
        unmountFirst: () => first.unmount(),
        listenerCount: () => listeners.size,
        change: (active: boolean) => {
          assignments = active ? [{
            id: "assignment", taskId: "tars-task", agentConfigId: "tars", agentName: "Tars",
            agent: getBuiltinAgent("implementer"), state: "started", received: [], support: [],
          }] : [];
          listeners.forEach((listener) => listener());
        },
        remount: () => mount("remounted-consumer"),
      } });
    }, strict);
    const action = async (code: string) => page.evaluate((code) => new Function(code)(), code);
    await expect(page.locator("#first-consumer output")).toHaveText("Auto");
    await action("window.syncTest.mountSecond()");
    await expect(page.locator("#second-consumer output")).toHaveText("Auto");
    expect(await action("return window.syncTest.listenerCount()")).toBe(1);
    await action("window.syncTest.unmountFirst()");
    await action("window.syncTest.change(true)");
    await expect(page.locator("#second-consumer output")).toHaveText("Tars");
    await action("window.syncTest.change(false)");
    await expect(page.locator("#second-consumer output")).toHaveText("Auto");
    await action("window.secondRoot.unmount()");
    expect(await action("return window.syncTest.listenerCount()")).toBe(0);
    await action("window.syncTest.change(true); window.syncTest.remount()");
    await expect(page.locator("#remounted-consumer output")).toHaveText("Tars");
    expect(await action("return window.syncTest.listenerCount()")).toBe(1);
  });
}
