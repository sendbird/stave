import type { ToolUsePart } from "@/types/chat";
import type { McpAppBridgeApi, McpAppViewDescription } from "@/lib/mcp-app/mcp-app-bridge";
import { EMPTY_MCP_APP_CSP } from "@/lib/mcp-app/mcp-app-csp";

export const MCP_APP_PREVIEW_VIEW_ID = "fedcba9876543210-0f0e0d0c-0b0a-4908-8706-050403020100";

/**
 * A hand-written MCP App view (no SDK): it runs the handshake, renders the
 * tool input and result, follows the host theme, reports its size, and has a
 * button for each request a view can make.
 */
const MCP_APP_PREVIEW_HTML = `<!doctype html>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 12px; font: 13px/1.5 var(--font-sans, system-ui); color: var(--color-text-primary, CanvasText); background: var(--color-background-secondary, Canvas); }
  h3 { margin: 0 0 8px; font-size: 14px; }
  .muted { color: var(--color-text-secondary, GrayText); }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  button { font: inherit; padding: 4px 8px; border-radius: var(--border-radius-md, 6px); border: 1px solid var(--color-border-primary, GrayText); background: transparent; color: inherit; }
</style>
<h3>Seoul forecast</h3>
<p id="status" class="muted">connecting…</p>
<p id="input"></p>
<p id="result"></p>
<div class="row">
  <button id="refresh" type="button">Refresh</button>
  <button id="save" type="button">Save forecast</button>
  <button id="message" type="button">Ask the agent</button>
  <button id="context" type="button">Share selection</button>
  <button id="fullscreen" type="button">Full screen</button>
  <button id="hidden" type="button">Call hidden tool</button>
  <a id="link" href="https://example.com/forecast">Open forecast site</a>
</div>
<p id="log" class="muted"></p>
<p id="network" class="muted">network: checking…</p>
<script>
  var nextId = 1;
  var pending = {};
  var el = function (id) { return document.getElementById(id); };
  function request(method, params) {
    var id = nextId++;
    parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { parent.postMessage({ jsonrpc: "2.0", method: method, params: params }, "*"); }
  function applyVariables(variables) {
    for (var name in variables || {}) document.documentElement.style.setProperty(name, variables[name]);
  }
  function log(text) { el("log").textContent = text; }
  window.addEventListener("message", function (event) {
    if (event.source !== parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id != null && !message.method) {
      var entry = pending[message.id];
      delete pending[message.id];
      if (entry) message.error ? entry.reject(message.error) : entry.resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-input") el("input").textContent = "input: " + JSON.stringify(message.params.arguments);
    if (message.method === "ui/notifications/tool-result") el("result").textContent = "result: " + message.params.content[0].text;
    if (message.method === "ui/notifications/host-context-changed") {
      if (message.params.styles) applyVariables(message.params.styles.variables);
      if (message.params.theme) el("status").textContent = "theme: " + message.params.theme;
      if (message.params.displayMode) log("display: " + message.params.displayMode);
    }
    if (message.method === "ui/resource-teardown") parent.postMessage({ jsonrpc: "2.0", id: message.id, result: {} }, "*");
  });
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appInfo: { name: "weather-preview", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
  }).then(function (result) {
    applyVariables(result.hostContext.styles.variables);
    el("status").textContent = "theme: " + result.hostContext.theme + " · server tools: " + (result.hostCapabilities.serverTools ? "yes" : "no");
    notify("ui/notifications/initialized", {});
    size();
  });
  function size() { notify("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }); }
  if (typeof ResizeObserver === "function") new ResizeObserver(size).observe(document.documentElement);
  function report(label) {
    return [function (result) { log(label + ": " + JSON.stringify(result)); }, function (error) { log(label + " error: " + error.message); }];
  }
  el("refresh").onclick = function () { var r = report("refresh"); request("tools/call", { name: "refresh_forecast", arguments: {} }).then(r[0], r[1]); };
  el("save").onclick = function () { var r = report("save"); request("tools/call", { name: "save_forecast", arguments: { city: "Seoul" } }).then(r[0], r[1]); };
  el("hidden").onclick = function () { var r = report("hidden"); request("tools/call", { name: "model_only", arguments: {} }).then(r[0], r[1]); };
  el("message").onclick = function () { var r = report("message"); request("ui/message", { role: "user", content: { type: "text", text: "Book a picnic on the sunny day." } }).then(r[0], r[1]); };
  el("context").onclick = function () { var r = report("context"); request("ui/update-model-context", { structuredContent: { selectedDay: "Tuesday" } }).then(r[0], r[1]); };
  el("fullscreen").onclick = function () { var r = report("mode"); request("ui/request-display-mode", { mode: "fullscreen" }).then(r[0], r[1]); };
  el("link").onclick = function (event) { event.preventDefault(); var r = report("link"); request("ui/open-link", { url: el("link").href }).then(r[0], r[1]); };
  fetch("https://example.com/", { mode: "no-cors" }).then(
    function () { el("network").textContent = "network: allowed"; },
    function () { el("network").textContent = "network: blocked"; }
  );
</script>`;

const PREVIEW_VIEW: McpAppViewDescription = {
  provider: "codex",
  server: "weather",
  tool: "forecast",
  resourceUri: "ui://weather/forecast",
  csp: EMPTY_MCP_APP_CSP,
  permissions: {},
  prefersBorder: null,
  appTools: [
    { name: "refresh_forecast", readOnlyHint: true, visibility: ["app"] },
    { name: "save_forecast", title: "Save forecast", readOnlyHint: false, visibility: ["app"] },
    { name: "model_only", readOnlyHint: true, visibility: ["model"] },
  ],
  toolInput: { city: "Seoul" },
  toolResult: { content: [{ type: "text", text: "Sunny, 21°C" }] },
  capabilities: { serverTools: true, serverResources: true },
  html: MCP_APP_PREVIEW_HTML,
};

export const mcpAppViewPart = (): ToolUsePart => ({
  type: "tool_use",
  toolUseId: "preview-mcp-app-view",
  toolName: "weather:forecast",
  input: JSON.stringify({ city: "Seoul" }),
  output: "Sunny, 21°C",
  state: "output-available",
  mcpAppView: {
    version: 1,
    viewId: MCP_APP_PREVIEW_VIEW_ID,
    provider: "codex",
    server: "weather",
    tool: "forecast",
    resourceUri: "ui://weather/forecast",
  },
});

/** Serves the fixture view to the preview when no desktop bridge exists. */
export function installMcpAppPreviewBridge(onRequest: (summary: string) => void): () => void {
  if (window.api?.mcpApp) return () => {};
  const bridge: McpAppBridgeApi = {
    describe: async ({ viewId }) =>
      viewId === MCP_APP_PREVIEW_VIEW_ID
        ? { ok: true, exists: true, view: PREVIEW_VIEW }
        : { ok: true, exists: false },
    request: async (args) => {
      onRequest(`${args.method} ${args.params.name ?? args.params.uri ?? ""}`.trim());
      return args.method === "tools/call"
        ? { ok: true, result: { content: [{ type: "text", text: `${args.params.name} ran` }] } }
        : { ok: true, result: { contents: [] } };
    },
  };
  window.api = { ...(window.api ?? {}), mcpApp: bridge } as typeof window.api;
  return () => {
    if (window.api?.mcpApp === bridge) delete (window.api as { mcpApp?: unknown }).mcpApp;
  };
}
