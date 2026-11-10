import { buildInlineRenderUrl } from "@/lib/inline-render/inline-render";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentRunReportLink } from "@/lib/agent-runs/report";

/** Sample HTML, deliberately labeled as examples. Tars itself renders the actual product components. */
export function installTarsArtifactFixtures(run: AgentRunDetail, legacy: boolean) {
  const pages = new Map<string, string>();
  const links: AgentRunReportLink[] = ["Original", "Revised"].map((label, index) => {
    const renderId = `0123456789abcdef-00000000-0000-4000-8000-00000000000${index}`;
    pages.set(renderId, `<!doctype html><style>body{font:18px system-ui;padding:24px}h1{color:#3355aa}</style><h1>${label} example</h1><p>Sample data, not a live application.</p><button onclick="this.textContent='Clicked'">Try example</button>`);
    return { label, url: legacy ? `http://localhost:4567/${label.toLowerCase()}.html` : buildInlineRenderUrl({ renderId, networkPolicy: "blocked" }),
      source: "agent", presentation: "example", workspaceId: "missing-execution-workspace", ...(!legacy ? { livePreview: { scriptId: "dev", url: "http://localhost:4567" } } : {}) };
  });
  run.report!.links.push(...links);
  window.api = { ...window.api, inlineRender: {
    describe: async ({ renderId }) => pages.has(renderId) ? { ok: true, exists: true, title: "Example", height: 360 } : { ok: true, exists: false },
    readSource: async ({ renderId }) => pages.has(renderId) ? { ok: true, html: pages.get(renderId)!, title: "Example" } : { ok: false, error: "missing" },
    saveAs: async () => ({ ok: false, canceled: true }),
  } };
}
