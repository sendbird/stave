import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchStave,
  seedProject,
  E2E_WORKSPACE_ID,
} from "./harness/stave-app";
import { callStaveMcpTool, waitForStaveMcpEndpoint } from "./harness/stave-mcp";

// A deterministic resource lifecycle, not a hardware-independent RSS promise.
// Keep timings and per-process memory as evidence; enforce owned guest counts.
test("bounds hidden guest growth and releases sessions after churn", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const projectPath = await mkdtemp(
    path.join(tmpdir(), "stave-resource-project-"),
  );
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      "<!doctype html><title>Resource fixture</title><h1>Local preview</h1><button>Inspect</button>",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  const stave = await launchStave();
  try {
    await seedProject(stave.page, {
      projectPath,
      settings: { lensAgentPresentationMode: "agent-decides" },
    });
    const endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
    const samples: unknown[] = [];
    async function sample(stage: string) {
      const data = await stave.page.evaluate(async () => {
        const metrics = await window.api.metrics!.getAppMetrics!();
        const memory = await window.api.metrics!.getRendererMemory!();
        return {
          mainRss: metrics.mainProcess.rss,
          hostRss: metrics.hostService?.memory.rss,
          rendererHeapKB: memory.heap.usedHeapSize,
          processes: metrics.processes.map((p) => ({
            role: p.role,
            workingSetKB: p.memory.workingSetSizeKB,
            cpuPercent: p.cpu.percentCPUUsage,
          })),
          lens: {
            sessions: metrics.lens.sessions,
            hidden: metrics.lens.sessions - metrics.lens.visibleSessions,
          },
        };
      });
      samples.push({ stage, ...data });
      return data;
    }
    await sample("before");
    const openMs: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const start = performance.now();
      const result = await callStaveMcpTool(endpoint, "stave_lens_navigate", {
        workspaceId: E2E_WORKSPACE_ID,
        lensSessionId: `resource-${i}`,
        url: `http://127.0.0.1:${address.port}/`,
      });
      expect(result.isError).not.toBe(true);
      openMs.push(Math.round(performance.now() - start));
    }
    const loaded = await sample("after-eight-opens");
    expect(loaded.lens.sessions).toBeLessThanOrEqual(4);
    expect(loaded.lens.sessions).toBeGreaterThan(0);
    const sessions = await callStaveMcpTool(
      endpoint,
      "stave_lens_list_sessions",
      {},
    );
    expect(sessions.isError).not.toBe(true);
    for (let i = 0; i < 8; i += 1) {
      await callStaveMcpTool(endpoint, "stave_lens_close_session", {
        workspaceId: E2E_WORKSPACE_ID,
        lensSessionId: `resource-${i}`,
      });
    }
    await expect
      .poll(async () => {
        const metrics = await stave.page.evaluate(() =>
          window.api.metrics!.getAppMetrics!(),
        );
        return metrics.lens.sessions;
      })
      .toBe(0);
    await sample("after-close");
    const reportPath = testInfo.outputPath("resource-samples.json");
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          fixture: "eight sequential hidden local pages; no provider turns",
          openMs,
          samples,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("desktop-resource-samples", {
      path: reportPath,
      contentType: "application/json",
    });
  } finally {
    await stave.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(projectPath, { recursive: true, force: true });
  }
});
