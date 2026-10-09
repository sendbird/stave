import { describe, expect, test } from "bun:test";
import {
  buildInlineRenderCsp,
  buildInlineRenderFileName,
  buildInlineRenderToolResult,
  buildInlineRenderUrl,
  INLINE_RENDER_CDN_ORIGINS,
  INLINE_RENDER_FRAME_SANDBOX,
  isInlineRenderId,
  isInlineRenderToolName,
  normalizeInlineRenderNetworkPolicy,
  parseInlineRenderFrameMessage,
  parseInlineRenderToolOutput,
  parseInlineRenderUrl,
  prepareInlineRenderDocument,
  sanitizeInlineRenderTheme,
  shouldBlockInlineRenderFrameNavigation,
} from "@/lib/inline-render/inline-render";

const RENDER_ID = "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100";
const RENDER_URL = buildInlineRenderUrl({ renderId: RENDER_ID, networkPolicy: "cdn" });

function directives(csp: string) {
  return new Map(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name ?? "", values] as const;
    }),
  );
}

describe("inline render CSP", () => {
  test("the header sandbox never grants same-origin, popups, or modals", () => {
    const sandbox = directives(buildInlineRenderCsp("open")).get("sandbox") ?? [];
    expect(sandbox).toEqual(INLINE_RENDER_FRAME_SANDBOX.split(" "));
    for (const forbidden of ["allow-same-origin", "allow-popups", "allow-modals", "allow-top-navigation"]) {
      expect(sandbox).not.toContain(forbidden);
    }
  });

  test("open allows any host, cdn only the allowlist, blocked nothing", () => {
    const open = directives(buildInlineRenderCsp("open"));
    expect(open.get("connect-src")).toContain("*");
    expect(open.get("script-src")).toContain("*");

    const cdn = directives(buildInlineRenderCsp("cdn"));
    expect(cdn.get("default-src")).toEqual(["'none'"]);
    expect(cdn.get("connect-src")).toEqual(["'none'"]);
    expect(cdn.get("img-src")).toEqual(["data:", "blob:"]);
    for (const origin of INLINE_RENDER_CDN_ORIGINS) expect(cdn.get("script-src")).toContain(origin);
    expect(cdn.get("script-src")).not.toContain("*");

    const blocked = buildInlineRenderCsp("blocked");
    expect(blocked).not.toMatch(/https:|\*/);
    expect(directives(blocked).get("connect-src")).toEqual(["'none'"]);
  });

  test("every policy refuses form navigation, base rewriting, and plugins", () => {
    for (const policy of ["open", "cdn", "blocked"] as const) {
      const parsed = directives(buildInlineRenderCsp(policy));
      expect(parsed.get("form-action")).toEqual(["'none'"]);
      expect(parsed.get("base-uri")).toEqual(["'none'"]);
      expect(parsed.get("object-src")).toEqual(["'none'"]);
    }
  });

  test("a meta-delivered policy leaves the sandbox to the frame attribute", () => {
    expect(buildInlineRenderCsp("blocked", { delivery: "meta" })).not.toContain("sandbox");
  });

  test("an unknown stored policy falls back to the default", () => {
    expect(normalizeInlineRenderNetworkPolicy("cdn")).toBe("cdn");
    expect(normalizeInlineRenderNetworkPolicy("everything")).toBe("open");
    expect(normalizeInlineRenderNetworkPolicy(undefined)).toBe("open");
  });
});

describe("inline render URLs", () => {
  test("round-trip the id and policy", () => {
    expect(parseInlineRenderUrl(RENDER_URL)).toEqual({ renderId: RENDER_ID, networkPolicy: "cdn" });
  });

  test("a missing or unknown policy resolves to blocked, never wider", () => {
    expect(parseInlineRenderUrl(`stave-render://frame/${RENDER_ID}`)?.networkPolicy).toBe("blocked");
    expect(parseInlineRenderUrl(`stave-render://frame/${RENDER_ID}?net=all`)?.networkPolicy).toBe("blocked");
  });

  test("refuse other schemes, hosts, and anything that is not one id", () => {
    for (const url of [
      `stave-app://frame/${RENDER_ID}?net=open`,
      `stave-render://renderer/${RENDER_ID}?net=open`,
      `stave-render://frame/${RENDER_ID}/extra`,
      `stave-render://frame/..%2F${RENDER_ID}`,
      "stave-render://frame/../../etc/passwd",
      "not a url",
    ]) {
      expect(parseInlineRenderUrl(url)).toBeNull();
    }
  });

  test("ids are a workspace key and a UUID, nothing else", () => {
    expect(isInlineRenderId(RENDER_ID)).toBe(true);
    expect(isInlineRenderId(RENDER_ID.toUpperCase())).toBe(false);
    expect(isInlineRenderId(`${RENDER_ID}x`)).toBe(false);
    expect(isInlineRenderId("0123456789abcdef/0f0e0d0c-0b0a-4908-8706-050403020100")).toBe(false);
  });
});

describe("frame navigation guard", () => {
  const base = { isMainFrame: false, isSameDocument: false };

  test("the app may load a render into a frame", () => {
    expect(
      shouldBlockInlineRenderFrameNavigation({
        ...base,
        frameUrl: "about:blank",
        targetUrl: RENDER_URL,
        initiatedBySubframe: false,
      }),
    ).toBe(false);
  });

  test("a render may not navigate itself anywhere, even to a wider policy", () => {
    for (const targetUrl of ["https://example.com/", buildInlineRenderUrl({ renderId: RENDER_ID, networkPolicy: "open" })]) {
      expect(
        shouldBlockInlineRenderFrameNavigation({
          ...base,
          frameUrl: RENDER_URL,
          targetUrl,
          initiatedBySubframe: true,
        }),
      ).toBe(true);
    }
  });

  test("a nested frame may not load a render", () => {
    expect(
      shouldBlockInlineRenderFrameNavigation({
        ...base,
        frameUrl: "about:blank",
        targetUrl: RENDER_URL,
        initiatedBySubframe: true,
      }),
    ).toBe(true);
  });

  test("in-page jumps and unrelated subframe navigations are left alone", () => {
    expect(
      shouldBlockInlineRenderFrameNavigation({
        ...base,
        isSameDocument: true,
        frameUrl: RENDER_URL,
        targetUrl: `${RENDER_URL}#section`,
        initiatedBySubframe: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockInlineRenderFrameNavigation({
        ...base,
        frameUrl: "https://example.com/",
        targetUrl: "https://example.com/next",
        initiatedBySubframe: true,
      }),
    ).toBe(false);
  });
});

describe("prepareInlineRenderDocument", () => {
  test("keeps the page's doctype first and runs the bootstrap before its markup", () => {
    const page = "<!DOCTYPE html><html lang=\"ko\"><head><script>window.mine = 1</script></head><body>hi</body></html>";
    const prepared = prepareInlineRenderDocument(page);
    expect(prepared.startsWith("<!DOCTYPE html>")).toBe(true);
    const bootstrapAt = prepared.indexOf("stave-inline-render-theme");
    expect(bootstrapAt).toBeGreaterThan(0);
    expect(bootstrapAt).toBeLessThan(prepared.indexOf("window.mine"));
    expect(prepared.endsWith(page.slice("<!DOCTYPE html>".length))).toBe(true);
  });

  test("adds a doctype to a fragment so it renders in standards mode", () => {
    const prepared = prepareInlineRenderDocument("﻿<div>chart</div>");
    expect(prepared.startsWith("<!doctype html><meta charset=\"utf-8\">")).toBe(true);
    expect(prepared.endsWith("<div>chart</div>")).toBe(true);
  });

  test("a meta CSP precedes every script", () => {
    const prepared = prepareInlineRenderDocument("<script>1</script>", {
      metaCsp: buildInlineRenderCsp("blocked", { delivery: "meta" }),
    });
    expect(prepared.indexOf("Content-Security-Policy")).toBeLessThan(prepared.indexOf("<script"));
  });

  test("only a preview paints the theme backdrop, and the page's own styles still win", () => {
    const page = "<style>html{background:white}</style><p>x</p>";
    expect(prepareInlineRenderDocument(page)).not.toContain("stave-inline-render-backdrop");
    const prepared = prepareInlineRenderDocument(page, { backdrop: true });
    const backdropAt = prepared.indexOf('<style id="stave-inline-render-backdrop">html{background:var(--background)}</style>');
    expect(backdropAt).toBeGreaterThan(prepared.indexOf("stave-inline-render-base"));
    expect(backdropAt).toBeLessThan(prepared.indexOf("html{background:white}"));
  });

  test("the bootstrap is valid JavaScript", () => {
    const prepared = prepareInlineRenderDocument("<p>x</p>");
    const script = /<script>([\s\S]*?)<\/script>/.exec(prepared)?.[1] ?? "";
    expect(script.length).toBeGreaterThan(100);
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("tool result recognition", () => {
  const result = buildInlineRenderToolResult({ renderId: RENDER_ID, title: "Spend by week", height: 420 });

  test("reads the text block a Claude turn records", () => {
    expect(parseInlineRenderToolOutput(JSON.stringify(result, null, 2))).toEqual({
      renderId: RENDER_ID,
      title: "Spend by week",
      height: 420,
    });
  });

  test("reads the serialised MCP result a Codex turn records", () => {
    const codexOutput = JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    });
    expect(parseInlineRenderToolOutput(codexOutput)?.renderId).toBe(RENDER_ID);
    const textOnly = JSON.stringify({ content: [{ type: "text", text: JSON.stringify(result) }] });
    expect(parseInlineRenderToolOutput(textOnly)?.renderId).toBe(RENDER_ID);
  });

  test("ignores outputs without a valid reference", () => {
    expect(parseInlineRenderToolOutput(undefined)).toBeNull();
    expect(parseInlineRenderToolOutput("plain text")).toBeNull();
    expect(
      parseInlineRenderToolOutput(JSON.stringify({ staveInlineRender: { renderId: "../../secret" } })),
    ).toBeNull();
  });

  test("clamps a reported height into the frame's range", () => {
    const tall = JSON.stringify({ staveInlineRender: { renderId: RENDER_ID, title: "x", height: 99_999 } });
    expect(parseInlineRenderToolOutput(tall)?.height).toBe(2_000);
  });

  test("recognises the tool under every provider's naming", () => {
    for (const name of [
      "mcp__stave-local-mcp__stave_render_html",
      "stave-local.stave_render_html",
      "stave_render_html",
      "Tool: stave-local-mcp/stave_render_html",
    ]) {
      expect(isInlineRenderToolName(name)).toBe(true);
    }
    expect(isInlineRenderToolName("stave_render_html_v2")).toBe(false);
    expect(isInlineRenderToolName("Bash")).toBe(false);
  });
});

describe("frame messages and theme", () => {
  test("accept a size report and an http(s) link, nothing else", () => {
    expect(
      parseInlineRenderFrameMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 240 } }),
    ).toEqual({ kind: "size", height: 240 });
    expect(
      parseInlineRenderFrameMessage({ jsonrpc: "2.0", method: "ui/open-link", params: { url: "https://example.com/a" } }),
    ).toEqual({ kind: "open-link", url: "https://example.com/a" });
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "stave-app://renderer/index.html"]) {
      expect(parseInlineRenderFrameMessage({ jsonrpc: "2.0", method: "ui/open-link", params: { url } })).toBeNull();
    }
    expect(parseInlineRenderFrameMessage({ method: "ui/open-link", params: { url: "https://example.com" } })).toBeNull();
    expect(parseInlineRenderFrameMessage({ jsonrpc: "2.0", method: "tools/call", params: {} })).toBeNull();
  });

  test("the theme keeps only allowlisted names and values that cannot end a rule", () => {
    expect(
      sanitizeInlineRenderTheme({
        appearance: "dark",
        variables: {
          "--background": "oklch(0.2 0 0)",
          "--primary": "red;}body{display:none",
          "--secret": "x",
        },
      }),
    ).toEqual({
      appearance: "dark",
      variables: { "--background": "oklch(0.2 0 0)", "--primary": "redbodydisplay:none" },
    });
  });

  test("save names are portable", () => {
    expect(buildInlineRenderFileName("Q3: spend / week?")).toBe("Q3-spend-week.html");
    expect(buildInlineRenderFileName("...")).toBe("render.html");
  });
});
