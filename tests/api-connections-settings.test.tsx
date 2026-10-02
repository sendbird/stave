import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiConnectionsSettings } from "@/components/layout/ApiConnectionsSettings";
import { ApiConnectionModelPicker } from "@/components/layout/ApiConnectionModelPicker";
import { buildModelEnrichmentFromCatalogs, buildModelSelectorOptions } from "@/components/ai-elements/model-selector.utils";
import { listDefaultModelOptions } from "@/components/ai-elements/model-effort-selector.utils";
import { TooltipProvider } from "@/components/ui";
import { buildApiConnectionCatalogEntries } from "@/lib/providers/api-connection-models";
import type { ApiConnectionModel, ApiConnectionsBridgeApi } from "@/lib/providers/api-connections";

const pinned: ApiConnectionModel[] = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 1_000_000, inputPrice: "0.000002", outputPrice: "0.00001" },
  { id: "zai/glm-5.3", name: "GLM 5.3", contextWindow: 1_000_000, inputPrice: "0.0000014", outputPrice: "0.0000044" },
];
const host = globalThis as unknown as { window?: { api?: unknown } };
const originalWindow = host.window;
afterEach(() => { host.window = originalWindow; });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("API connections settings", () => {
  test("the card says how billing works, that it serves both runtimes, and how to pick it", () => {
    host.window = { ...originalWindow, api: { apiConnections: {} as ApiConnectionsBridgeApi } };
    const html = text(renderToStaticMarkup(createElement(TooltipProvider, null, createElement(ApiConnectionsSettings))));
    expect(html).toContain("API connections");
    expect(html).toContain("bills per token, instead of your Claude or Codex subscription");
    expect(html).toContain("One connection can serve both Claude and Codex");
    expect(html).toContain("status bar account switch");
    expect(html).toContain("No API connections yet");
    expect(html).toContain("Add a connection");
    expect(html).toContain("Vercel AI Gateway");
  });

  test("pinned models show context, price, and the experimental label only in Claude Code", () => {
    const render = (servesClaude: boolean) => text(renderToStaticMarkup(createElement(ApiConnectionModelPicker, {
      kind: "custom", servesClaude, value: pinned, onChange: () => {},
    })));
    const claude = render(true);
    expect(claude.match(/Experimental in Claude Code/g)?.length).toBe(1); // the GLM row only
    expect(claude).toContain("Anthropic doesn't support non-Claude models through gateways");
    expect(claude).toContain("1M context · $1.40 / $4.40 per 1M tokens");
    expect(claude).toContain("Pinned models (2)");
    expect(render(false)).not.toContain("Experimental in Claude Code");
  });

  test("the composer picker keeps every pinned model visible under its connection group", () => {
    const entries = buildApiConnectionCatalogEntries({ runtime: "claude-code", profile: { label: "Company gateway", apiConnection: { label: "Company gateway", kind: "vercel-ai-gateway", models: pinned } } });
    const options = buildModelSelectorOptions({
      providerIds: ["claude-code"],
      modelsByProvider: { "claude-code": entries.map((entry) => entry.model) },
      enrichmentByModel: buildModelEnrichmentFromCatalogs({ "claude-code": { entries } }),
    });
    expect(options.map((option) => [option.model, option.group, option.badge ?? null])).toEqual([
      ["anthropic/claude-sonnet-5", "Company gateway · API billing", null],
      ["zai/glm-5.3", "Company gateway · API billing", "experimental"],
    ]);
    expect(listDefaultModelOptions({ providerId: "claude-code", options }).map((option) => option.model)).toEqual(["anthropic/claude-sonnet-5", "zai/glm-5.3"]);
  });
});
