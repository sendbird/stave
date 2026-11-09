import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { filterTarsAllowlistAgents, TarsAgentAllowlist, toggleTarsAllowedAgent } from "../src/components/tars/TarsAgentAllowlist";
import { TarsSettings } from "../src/components/tars/TarsSettings";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { AgentConfigSchema, type AgentConfig } from "../src/lib/agents/schema";
import type { TarsActionReceipt, TarsMessage } from "../src/lib/tars/conversation";

const NOW = "2026-11-05T00:00:00.000Z";
function saved(id: string, name: string, overrides: Record<string, unknown> = {}): AgentConfig {
  return AgentConfigSchema.parse({ version: 1, id, source: "custom", name, description: `Use when ${name.toLowerCase()} is needed.`,
    instructions: "Do the work.", model: { mode: "auto" }, permission: "auto", workspace: "same-workspace", report: ["summary"],
    usableAs: ["delegate"], ...overrides });
}
const RELEASE = saved("release-notes", "Release notes");
const TRIAGE = saved("triage", "Bug triage");
const SOLO = saved("solo", "Solo lead", { usableAs: ["primary"] });
const PUBLISHER = saved("publisher", "Publisher", { workflow: [
  { id: "write", title: "Write", kind: "ai", instruction: "Write the change.", doneWhen: "Written." },
  { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
] });

/** Render a component and keep its element tree, so a test can call a real handler without a DOM. */
function render(element: () => ReactNode) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = element(); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  const checkboxes = new Map<string, { checked?: boolean; disabled?: boolean; onCheckedChange: (value: boolean) => void }>();
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as Record<string, unknown> & { children?: ReactNode };
    if (typeof props["data-tars-agent"] === "string" && typeof props.onCheckedChange === "function")
      checkboxes.set(props["data-tars-agent"], props as never);
    visit(props.children);
  };
  visit(sink.tree);
  return { html, checkboxes };
}

afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

describe("Tars settings agent allowlist", () => {
  test("lists saved agents with a visible search, built-ins as always allowed, and blocks agents that cannot be delegated", () => {
    const changes: string[][] = [];
    const view = render(() => TarsAgentAllowlist({ agents: [RELEASE, TRIAGE, SOLO, PUBLISHER], value: ["release-notes", "removed-agent"], onChange: (ids) => { changes.push(ids); } }));
    expect(view.html).toContain("Agents Tars may use");
    expect(view.html).toContain("Built-in agents are always available");
    expect(view.html).toContain('placeholder="Search saved agents"');
    for (const name of ["Release notes", "Bug triage", "Solo lead", "removed-agent"]) expect(view.html).toContain(name);
    expect(view.html).toContain("This agent cannot take delegated work.");
    expect(view.html).toContain("This agent is no longer available.");
    expect(view.checkboxes.get("release-notes")).toMatchObject({ checked: true, disabled: false });
    expect(view.checkboxes.get("triage")).toMatchObject({ checked: false, disabled: false });
    expect(view.checkboxes.get("solo")).toMatchObject({ checked: false, disabled: true });
    // Publishing agents cannot be allowed: publication needs a separate request.
    expect(view.html).toContain("This agent publishes outside the workspace");
    expect(view.checkboxes.get("publisher")).toMatchObject({ checked: false, disabled: true });
    view.checkboxes.get("triage")!.onCheckedChange(true);
    view.checkboxes.get("release-notes")!.onCheckedChange(false);
    view.checkboxes.get("removed-agent")!.onCheckedChange(false);
    expect(changes).toEqual([["release-notes", "removed-agent", "triage"], ["removed-agent"], ["release-notes"]]);
  });

  test("search matches names, ids and descriptions, and empty libraries explain where agents come from", async () => {
    expect(filterTarsAllowlistAgents([RELEASE, TRIAGE, SOLO], "  TRIAGE ").map((agent) => agent.id)).toEqual(["triage"]);
    expect(filterTarsAllowlistAgents([RELEASE, TRIAGE, SOLO], "release-n").map((agent) => agent.id)).toEqual(["release-notes"]);
    expect(filterTarsAllowlistAgents([RELEASE, TRIAGE, SOLO], "needed").map((agent) => agent.id)).toEqual(["release-notes", "triage", "solo"]);
    expect(toggleTarsAllowedAgent(["a"], "a", true)).toEqual(["a"]);
    const empty = render(() => TarsAgentAllowlist({ agents: [], value: [], onChange() {} }));
    expect(empty.html).toContain("You have no saved agents.");
    expect(empty.html).not.toContain("Search saved agents");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const korean = render(() => TarsAgentAllowlist({ agents: [RELEASE], value: [], onChange() {} }));
    expect(korean.html).toContain("Tars가 쓸 수 있는 에이전트");
    expect(korean.html).toContain("저장한 에이전트 검색");
  });

  test("the settings sheet separates the conversation model from automatic execution and states available providers", async () => {
    const identity = { id: "personal" as const, name: "Tars", instructions: "", updatedAt: NOW };
    const automatic = renderToStaticMarkup(createElement(TarsSettings, { identity, busy: false, onSave: async () => true,
      initial: { providerId: "codex", model: "gpt-6.1-sol", maxTurns: 30 } }));
    expect(automatic).toContain("Concurrent responsibilities");
    expect(automatic).toContain("0 starts all eligible independent work");
    expect(automatic).toContain("Conversation model");
    expect(automatic).toContain("Execution model");
    expect(automatic).toContain("Automatic");
    expect(automatic).toContain("Stave picks a model for each step; reviews may use another provider.");
    // The model picker lists only Claude and Codex, so no line restates it; nor do the runtime limits the guide already states.
    expect(automatic).not.toContain("Delegated work uses Claude or Codex.");
    expect(automatic).not.toContain("Work continues while Stave is running");
    expect(automatic).toContain("Turn limit per work unit, including helpers");
    // "Changes apply to new messages and work" is the sheet's description now, not one more paragraph in the form.
    expect(automatic).not.toContain("Changes apply to new messages and work");
    expect(automatic).toContain("Instructions never grant permissions.");
    expect(automatic).toContain('data-tars-agent-allowlist=""');
    const pinned = renderToStaticMarkup(createElement(TarsSettings, { identity, busy: false, onSave: async () => true,
      initial: { providerId: "codex", model: "gpt-6.1-sol", maxTurns: 30, executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" }, allowedAgentIds: ["release-notes"] } }));
    expect(pinned).toContain("All work and helpers use this model.");
    expect(pinned).not.toContain("Choose Automatic to allow routing");
    expect(pinned).toContain("This model runs with the Claude System default account.");
    // A saved choice whose agent is not in this library stays listed so it can be removed.
    expect(pinned).toContain("This agent is no longer available.");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const korean = renderToStaticMarkup(createElement(TarsSettings, { identity, busy: false, onSave: async () => true,
      initial: { providerId: "codex", model: "gpt-6.1-sol", maxTurns: 30 } }));
    expect(korean).toContain("리뷰는 다른 프로바이더에서 실행할 수 있습니다.");
  });

  test("a refused agent shows its translated reason and the chosen agent's name, never the host diagnostic", async () => {
    const action = { kind: "delegate" as const, workspaceId: "source", title: "Release notes", instruction: "Write them.", acceptanceCriteria: ["Written"], priority: 50, agentId: "release-notes" };
    const message: TarsMessage = { id: "message", requestId: "request", text: "Write release notes", providerId: "codex", model: "gpt-6.1-sol", maxTurns: 30, revision: 2,
      state: "answered", reply: "Proposed.", decision: { reply: "Proposed.", actions: [action] }, error: null, createdAt: NOW, updatedAt: NOW };
    const receipt: TarsActionReceipt = { messageId: "message", actionIndex: 0, requestHash: "b".repeat(64), action, status: "rejected", responsibilityId: null,
      error: "Host diagnostic text.", reason: "agentNotAllowed", revision: 2, createdAt: NOW, updatedAt: NOW };
    const html = () => renderToStaticMarkup(createElement(TarsConversationMessage, { message, receipts: [receipt], name: "Tars", busy: false, onCancel() {},
      agentNameOf: (id) => id === "release-notes" ? "Release notes" : undefined }));
    expect(html()).toContain("Agent: Release notes");
    expect(html()).toContain("This saved agent is not allowed for Tars.");
    expect(html()).not.toContain("Host diagnostic text.");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    expect(html()).toContain("Tars에 허용하지 않은 저장 에이전트입니다.");
  });
});
