import { describe, expect, test } from "bun:test";
import {
  buildMcpAppCsp,
  buildMcpAppFrameAllow,
  buildMcpAppSrcdoc,
  EMPTY_MCP_APP_CSP,
  isMcpAppCspDomain,
  MCP_APP_MAX_CSP_DOMAINS,
  normalizeMcpAppCsp,
} from "@/lib/mcp-app/mcp-app-csp";

function directive(csp: string, name: string) {
  return csp
    .split("; ")
    .find((entry) => entry.startsWith(`${name} `));
}

describe("MCP App view CSP", () => {
  test("denies everything but inline code when nothing is declared", () => {
    const csp = buildMcpAppCsp(EMPTY_MCP_APP_CSP);
    expect(directive(csp, "sandbox")).toBe("sandbox allow-scripts allow-forms");
    expect(directive(csp, "default-src")).toBe("default-src 'none'");
    expect(directive(csp, "script-src")).toBe("script-src 'unsafe-inline'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'none'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'none'");
    expect(csp).not.toContain("'self'");
    expect(csp).not.toContain("*");
    expect(csp).not.toContain("unsafe-eval");
  });

  test("grants each declared list to its own directives only", () => {
    const csp = buildMcpAppCsp(
      normalizeMcpAppCsp({
        connectDomains: ["https://api.example.com", "wss://live.example.com"],
        resourceDomains: ["https://*.cdn.example.com"],
        frameDomains: ["https://player.example.com"],
        baseUriDomains: ["https://base.example.com"],
      }),
    );
    expect(directive(csp, "connect-src")).toBe(
      "connect-src https://api.example.com wss://live.example.com",
    );
    expect(directive(csp, "script-src")).toBe("script-src 'unsafe-inline' https://*.cdn.example.com");
    expect(directive(csp, "img-src")).toBe("img-src data: https://*.cdn.example.com");
    expect(directive(csp, "frame-src")).toBe("frame-src https://player.example.com");
    expect(directive(csp, "base-uri")).toBe("base-uri https://base.example.com");
    expect(directive(csp, "default-src")).toBe("default-src 'none'");
  });

  test("drops anything that would widen the policy", () => {
    const widening = [
      "*",
      "'self'",
      "'unsafe-eval'",
      "https:",
      "data:",
      "https://*",
      "https://*.com",
      "https://example.com/path",
      "https://example.com 'unsafe-eval'",
      "https://example.com; script-src *",
      "javascript:alert(1)",
      "ftp://example.com",
      "https://exa mple.com",
      "https://example.com:99999",
      "https://user@example.com",
    ];
    for (const value of widening) expect(isMcpAppCspDomain(value)).toBe(false);
    expect(normalizeMcpAppCsp({ connectDomains: widening })).toEqual(EMPTY_MCP_APP_CSP);
    expect(normalizeMcpAppCsp({ connectDomains: "https://example.com" }).connectDomains).toEqual([]);
  });

  test("accepts hosts with ports and wildcards, lowercased and deduplicated", () => {
    expect(
      normalizeMcpAppCsp({
        connectDomains: ["https://API.example.com", "https://api.example.com", "http://localhost:8080"],
      }).connectDomains,
    ).toEqual(["https://api.example.com", "http://localhost:8080"]);
  });

  test(`keeps at most ${MCP_APP_MAX_CSP_DOMAINS} origins per list`, () => {
    const many = Array.from({ length: 40 }, (_, index) => `https://h${index}.example.com`);
    expect(normalizeMcpAppCsp({ resourceDomains: many }).resourceDomains).toHaveLength(
      MCP_APP_MAX_CSP_DOMAINS,
    );
  });

  test("a meta CSP for the browser preview has no sandbox directive and leads the document", () => {
    const meta = buildMcpAppCsp(EMPTY_MCP_APP_CSP, { delivery: "meta" });
    expect(meta).not.toContain("sandbox");
    const srcdoc = buildMcpAppSrcdoc("<!DOCTYPE html><p>view</p>", EMPTY_MCP_APP_CSP);
    expect(srcdoc.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(srcdoc.endsWith("<p>view</p>")).toBe(true);
  });

  test("the frame allows only declared permissions", () => {
    expect(buildMcpAppFrameAllow({})).toBe("");
    expect(buildMcpAppFrameAllow({ clipboardWrite: true, camera: true })).toBe("camera; clipboard-write");
  });
});
