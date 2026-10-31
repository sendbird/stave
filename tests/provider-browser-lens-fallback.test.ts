import { describe, expect, test } from "bun:test";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";
import { shouldActivateProviderBrowser } from "../src/lib/provider-browser";
import { defaultSettings } from "../src/store/app-settings";
import { buildProviderRuntimeOptions } from "../src/store/provider-runtime-options";
import { StreamTurnArgsSchema } from "../electron/main/ipc/schemas";
import {
  createProviderBrowserFallbackTracker,
  maybeStartProviderBrowserFallbackTurn,
} from "../src/store/provider-browser-auto-fallback";

const tracker = (providerId: "codex" | "claude-code" = "codex") => createProviderBrowserFallbackTracker({
  prompt: "Inspect the workspace page",
  providerId,
  turnOrigin: "conversation",
  runtimeOptions: { providerBrowserAutoFallback: true },
});
const page = "https://workspace.example/private";
const login = { ok: true, url: "https://workspace.example/login", title: "Sign in", snapshot: 'textbox "Email"\ntextbox "Password"\nbutton "Sign in"' };
const call = (name: string, id = "read", input: Record<string, unknown> = {}): NormalizedProviderEvent => ({
  type: "tool", toolUseId: id, toolName: name,
  input: JSON.stringify({ workspaceId: "workspace-1", ...input }), state: "input-available",
});
const result = (value: unknown, id = "read", isError = false): NormalizedProviderEvent => ({
  type: "tool_result", tool_use_id: id,
  output: typeof value === "string" ? value : JSON.stringify(value), isError,
});

describe("Lens browser fallback", () => {
  test("default settings try Lens on a known host and enable Chrome only for the blocked-read retry", () => {
    for (const providerId of ["codex", "claude-code"] as const) {
      const runtimeOptions = buildProviderRuntimeOptions({ provider: providerId, model: "default", settings: defaultSettings });
      const request = StreamTurnArgsSchema.parse({ providerId, prompt: "Inspect https://claude.ai/code/artifact/example", runtimeOptions });
      const activation = {
        secondaryReadOnly: false, unattendedAutomation: false,
        autoFallbackEnabled: request.runtimeOptions?.providerBrowserAutoFallback,
        autoArmEnabled: request.runtimeOptions?.providerBrowserAutoArm,
      };
      expect(shouldActivateProviderBrowser({ ...activation, prompt: request.prompt })).toBe(false);
      const subject = createProviderBrowserFallbackTracker({
        prompt: request.prompt, providerId, runtimeOptions, turnOrigin: "conversation",
      });
      subject.observe([call("stave_lens_snapshot"), result({ ok: true, url: "https://claude.ai/code/artifact/example", snapshot: 'heading "Artifact"' })]);
      const sent: Array<{ content: string }> = [];
      const finish = () => maybeStartProviderBrowserFallbackTurn(() => ({
        settings: defaultSettings, sendUserMessage: async (args) => { sent.push(args); },
      }), { taskId: "task-1", events: [{ type: "done", stop_reason: "end_turn" }], tracker: subject, session: null });
      finish();
      expect(sent).toHaveLength(0);
      subject.observe([call("stave_lens_reload", "blocked", { url: "https://claude.ai/code/artifact/example" }), result("Navigation timed out after 30s", "blocked", true)]);
      finish();
      finish();
      expect(sent).toHaveLength(1);
      expect(shouldActivateProviderBrowser({ ...activation, prompt: sent[0]!.content })).toBe(true);
    }
  });
  test("retries a login screen without @web for either provider's MCP event shape", () => {
    for (const [name, providerId] of [["mcp__stave-local-mcp__stave_lens_snapshot", "claude-code"], ["stave-local:stave_lens_snapshot", "codex"]] as const) {
      const subject = tracker(providerId);
      subject.observe([call("stave_lens_navigate", "nav", { url: page })]);
      subject.observe([result({ ok: true, url: page, title: "Workspace" }, "nav")]);
      subject.observe([call(name)]);
      // Codex wraps the MCP content; Claude also sends its text blocks alone.
      subject.observe([result(providerId === "codex"
        ? { structuredContent: login, content: [{ type: "text", text: JSON.stringify(login) }] }
        : login)]);
      const sent: Array<{ content: string; preservePromptDraft?: boolean }> = [];
      maybeStartProviderBrowserFallbackTurn(() => ({
        settings: { providerBrowserAutoFallback: true },
        sendUserMessage: async (args) => { sent.push(args); },
      }), { taskId: "task-1", events: [{ type: "done", stop_reason: "end_turn" }], tracker: subject, session: null });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.content).toContain(page);
      expect(sent[0]?.content).toContain("Lens page access");
      expect(sent[0]?.content).not.toContain("textbox");
      expect(sent[0]?.preservePromptDraft).toBe(true);
      expect(shouldActivateProviderBrowser({ prompt: sent[0]!.content, secondaryReadOnly: false, unattendedAutomation: false })).toBe(true);
    }
  });

  test("detects a Korean login form even with a long page snapshot", () => {
    const subject = tracker();
    subject.observe([call("stave_lens_snapshot"), result({ ok: true, title: "회사 포털", url: page,
      snapshot: `textbox "비밀번호"\nbutton "로그인"\n${"내용".repeat(1500)}` })]);
    expect(subject.detected).toBe(true);
  });

  test("detects a missing saved account and keeps the current page target", () => {
    const subject = tracker();
    subject.observe([call("stave_lens_navigate", "nav", { url: page }), result({ ok: true, url: page }, "nav")]);
    subject.observe([call("stave_lens_fill_saved_account"), result({ ok: false, message: "No unambiguous saved Lens account matches the current hostname. Choose a username or mark one account for automatic fill in Settings > Browser > Lens." })]);
    expect(subject.detected).toBe(true);
    expect(subject.blockedUrls()).toEqual([page]);
  });

  test("detects browser connection failures and navigation timeouts", () => {
    for (const failure of ["Navigation timed out after 30s", "ERR_CONNECTION_RESET at https://workspace.example/private", "WebContents 123 not found or destroyed", "No Lens browser session found for CDP access."]) {
      const subject = tracker();
      subject.observe([call("stave_lens_navigate", "read", { url: page }), result(failure, "read", true)]);
      expect(subject.detected).toBe(true);
      expect(subject.blockedUrls()).toEqual([page]);
    }
  });

  test("reads an MCP error flag when the provider reports the call as completed", () => {
    const subject = tracker();
    subject.observe([call("stave_lens_navigate", "read", { url: page }), result({ isError: true, content: [{ type: "text", text: "Navigation timed out after 30s" }] })]);
    expect(subject.detected).toBe(true);
  });

  test("handles a completed tool event with its output attached", () => {
    const subject = tracker();
    subject.observe([{ ...call("stave_lens_navigate", "read", { url: page }), type: "tool", toolName: "stave_lens_navigate", input: JSON.stringify({ url: page }), state: "output-error", output: "Navigation timed out after 30s" }]);
    expect(subject.detected).toBe(true);
  });

  test("ignores ordinary page text, selector mistakes, app errors and writes", () => {
    for (const [name, value, isError] of [
      ["stave_lens_snapshot", { ok: true, title: "Login guide", snapshot: 'heading "How to log in"\nlink "Sign in"' }, false],
      ["stave_lens_snapshot", { ok: true, snapshot: 'heading "Navigation timed out"' }, false],
      ["stave_lens_get_text", "Ref d1e3 is not in the current page snapshot.", true],
      ["stave_lens_get_text", "Element not found: #missing", true],
      ["stave_lens_click", "Navigation timed out after 30s", true],
      ["stave_lens_type", "HTTP 401 Unauthorized", true],
      ["stave_lens_delete_saved_account", "HTTP 403 Forbidden", true],
    ] as const) {
      const subject = tracker();
      subject.observe([call(name), result(value, "read", isError)]);
      expect(subject.detected).toBe(false);
    }
  });

  test("does not bypass approval, site-policy or user-control blocks after detecting login", () => {
    for (const failure of [
      "Lens CDP access for workspace.example was denied.",
      "Lens CDP approval for workspace.example timed out after 60 seconds.",
      "Lens navigation blocked by Settings > Browser > Lens > Site Access: workspace.example",
      "Lens navigation is limited by Settings > Browser > Lens > Site Access. Add workspace.example to allowed hosts to continue.",
      "Lens Developer Mode CDP is disabled. Enable Settings > Browser > Lens > Developer Mode to allow CDP-backed Lens actions.",
      "Lens automation is paused for direct interaction. Wait for the user to resume it in Lens.",
    ]) {
      const subject = tracker();
      subject.observe([call("stave_lens_snapshot"), result(login)]);
      subject.observe([call("stave_lens_click", "blocked"), result(failure, "blocked", true)]);
      expect(subject.detected).toBe(false);
    }
  });

  test("cancels the retry after a successful page read in the same session", () => {
    const subject = tracker();
    subject.observe([call("stave_lens_snapshot"), result(login)]);
    subject.observe([call("stave_lens_snapshot", "recovered"), result({ ok: true, url: page, title: "Workspace", snapshot: 'heading "Dashboard"' }, "recovered")]);
    expect(subject.detected).toBe(false);
  });

  test("keeps independent Lens sessions separate", () => {
    const subject = tracker();
    subject.observe([call("stave_lens_snapshot", "a", { lensSessionId: "a" }), result(login, "a")]);
    subject.observe([call("stave_lens_snapshot", "b", { lensSessionId: "b" }), result({ ok: true, url: page, snapshot: 'heading "Dashboard"' }, "b")]);
    expect(subject.detected).toBe(true);
    expect(subject.blockedUrls()).toEqual([login.url]);
  });

  test("ignores child-agent calls and incomplete results", () => {
    const subject = tracker();
    subject.observe([{ ...call("stave_lens_snapshot"), type: "tool", toolName: "stave_lens_snapshot", input: "{}", state: "input-available", ownerAgentId: "child" }, result(login)]);
    expect(subject.detected).toBe(false);
    subject.observe([call("stave_lens_snapshot", "partial"), { ...result(login, "partial"), type: "tool_result", tool_use_id: "partial", output: JSON.stringify(login), isPartial: true }]);
    expect(subject.detected).toBe(false);
  });
});
