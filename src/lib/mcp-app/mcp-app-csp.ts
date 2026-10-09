/**
 * The CSP an MCP App view runs under, built only from the origins its
 * resource declared in `_meta.ui.csp`. Everything starts at
 * `default-src 'none'`: a view with no declaration may run its own inline
 * scripts and styles and nothing else. `'self'` is never granted, because the
 * view's origin is Stave's render scheme and other views and pages live
 * there too.
 */
import { INLINE_RENDER_FRAME_SANDBOX } from "@/lib/inline-render/inline-render";
import type { McpAppCspDeclaration, McpAppPermissions } from "./mcp-app-view";

/** The most origins Stave accepts in any one declared list. */
export const MCP_APP_MAX_CSP_DOMAINS = 32;

/**
 * An origin: scheme, an optional leading `*.` wildcard, a host, an optional
 * port, and nothing else. No paths, keywords, quotes, or bare wildcards.
 */
const DOMAIN_PATTERN =
  /^(https?|wss?):\/\/(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/;

export interface McpAppCsp {
  connectDomains: string[];
  resourceDomains: string[];
  frameDomains: string[];
  baseUriDomains: string[];
}

export const EMPTY_MCP_APP_CSP: McpAppCsp = {
  connectDomains: [],
  resourceDomains: [],
  frameDomains: [],
  baseUriDomains: [],
};

export function isMcpAppCspDomain(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  const domain = value.toLowerCase();
  if (!DOMAIN_PATTERN.test(domain)) return false;
  const host = domain.replace(/^[a-z]+:\/\//, "").replace(/:\d+$/, "");
  // A wildcard needs a registrable name under it: `*.example.com`, not `*.com`.
  if (host.startsWith("*.") && host.slice(2).split(".").length < 2) return false;
  const port = /:(\d+)$/.exec(domain)?.[1];
  return port === undefined || (Number(port) > 0 && Number(port) <= 65_535);
}

function normalizeDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const domains: string[] = [];
  for (const entry of value) {
    if (!isMcpAppCspDomain(entry)) continue;
    const domain = entry.toLowerCase();
    if (!domains.includes(domain)) domains.push(domain);
    if (domains.length >= MCP_APP_MAX_CSP_DOMAINS) break;
  }
  return domains;
}

/** Keeps only valid origins from a declaration; anything else is dropped, never widened. */
export function normalizeMcpAppCsp(declaration: McpAppCspDeclaration | null | undefined): McpAppCsp {
  return {
    connectDomains: normalizeDomains(declaration?.connectDomains),
    resourceDomains: normalizeDomains(declaration?.resourceDomains),
    frameDomains: normalizeDomains(declaration?.frameDomains),
    baseUriDomains: normalizeDomains(declaration?.baseUriDomains),
  };
}

function sources(domains: readonly string[], base: string[] = []): string {
  const all = [...base, ...domains];
  return all.length > 0 ? all.join(" ") : "'none'";
}

/**
 * The view's CSP. `delivery: "header"` adds the `sandbox` directive, which
 * only a response header can carry; a `<meta>` CSP (the browser-only
 * preview) relies on the frame's sandbox attribute instead.
 */
export function buildMcpAppCsp(
  csp: McpAppCsp,
  options?: { delivery?: "header" | "meta" },
): string {
  const resources = csp.resourceDomains;
  const directives = [
    "default-src 'none'",
    `script-src ${sources(resources, ["'unsafe-inline'"])}`,
    `style-src ${sources(resources, ["'unsafe-inline'"])}`,
    `img-src ${sources(resources, ["data:"])}`,
    `font-src ${sources(resources, ["data:"])}`,
    `media-src ${sources(resources, ["data:"])}`,
    `connect-src ${sources(csp.connectDomains)}`,
    `frame-src ${sources(csp.frameDomains)}`,
    `base-uri ${sources(csp.baseUriDomains)}`,
    "form-action 'none'",
    "object-src 'none'",
  ];
  if ((options?.delivery ?? "header") === "header") {
    directives.unshift(`sandbox ${INLINE_RENDER_FRAME_SANDBOX}`);
  }
  return directives.join("; ");
}

const LEADING_DOCTYPE_PATTERN = /^﻿?\s*<!doctype[^>]*>/i;

/**
 * The browser-only preview path, where the render scheme does not exist: the
 * view's own HTML with the same CSP delivered by a leading `<meta>`, so it
 * governs every script after it.
 */
export function buildMcpAppSrcdoc(html: string, csp: McpAppCsp): string {
  const rest = html.replace(LEADING_DOCTYPE_PATTERN, "");
  const policy = buildMcpAppCsp(csp, { delivery: "meta" })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta charset="utf-8">${rest}`;
}

const PERMISSION_FEATURES: Record<keyof McpAppPermissions, string> = {
  camera: "camera",
  microphone: "microphone",
  geolocation: "geolocation",
  clipboardWrite: "clipboard-write",
};

/** The frame's `allow` attribute: only the features the resource declared. */
export function buildMcpAppFrameAllow(permissions: McpAppPermissions): string {
  return (Object.keys(PERMISSION_FEATURES) as Array<keyof McpAppPermissions>)
    .filter((key) => permissions[key] === true)
    .map((key) => PERMISSION_FEATURES[key])
    .join("; ");
}

/** The declared permissions as the extension's `sandbox.permissions` capability. */
export function describeMcpAppPermissions(permissions: McpAppPermissions): Record<string, Record<string, never>> {
  const granted: Record<string, Record<string, never>> = {};
  for (const key of Object.keys(PERMISSION_FEATURES) as Array<keyof McpAppPermissions>) {
    if (permissions[key] === true) granted[key] = {};
  }
  return granted;
}
