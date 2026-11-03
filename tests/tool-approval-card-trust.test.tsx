import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolApprovalCard } from "@/components/session/ToolApprovalCard";
import { resolveApprovalRequesterName } from "@/lib/approvals/approval-requester";
import { useAppStore } from "@/store/app.store";
import type { ApprovalPart, MessagePart } from "@/types/chat";

const pending: ApprovalPart = {
  type: "approval",
  requestId: "req-card",
  toolName: "Bash",
  description: "Run the type check",
  input: "bun run typecheck",
  supportsAllowAlways: true,
  trustedToolEntry: "bash:bun run typecheck",
  state: "approval-requested",
};

const alwaysAllowed: ApprovalPart = {
  ...pending,
  state: "approval-responded",
  resolution: { decision: "allowed", source: "user", scope: "always", decidedAt: "2026-11-03T06:03:00.000Z" },
};

const render = (part: ApprovalPart, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<ToolApprovalCard onDecide={() => {}} part={part} {...props} />);

/**
 * Server rendering reads a store's initial snapshot, so the trusted list is
 * swapped on that snapshot for the render and put back afterwards.
 */
const initialSettings = useAppStore.getInitialState().settings;
function withTrustedTools(trustedTools: string[]) {
  (useAppStore.getInitialState() as { settings: typeof initialSettings }).settings = { ...initialSettings, trustedTools };
}

afterEach(() => {
  (useAppStore.getInitialState() as { settings: typeof initialSettings }).settings = initialSettings;
  useAppStore.setState(useAppStore.getInitialState(), true);
});

describe("ToolApprovalCard", () => {
  test("Allow once names its card-scoped shortcut while the request waits, and nothing binds Escape", () => {
    const html = render(pending);
    expect(html).toMatch(/aria-keyshortcuts="(Meta|Control)\+Enter"/);
    expect(html).toContain("data-approval-shortcut");
    expect(html).not.toMatch(/aria-keyshortcuts="[^"]*Esc/);
    // Answered, busy or blocked: no live shortcut is advertised.
    expect(render(alwaysAllowed)).not.toContain("aria-keyshortcuts");
    expect(render(pending, { busy: true })).not.toContain("aria-keyshortcuts");
    expect(render(pending, { disabled: true })).not.toContain("aria-keyshortcuts");
  });

  test("offers Always allow where the runtime honors it, unless the answer goes through the host", () => {
    expect(render(pending)).toContain(">Always allow<");
    expect(render(pending, { allowAlways: false })).not.toContain(">Always allow<");
    expect(render({ ...pending, supportsAllowAlways: undefined })).not.toContain(">Always allow<");
  });

  test("shows the request's risk as a word before the status and who asked after the tool", () => {
    const html = render({ ...pending, risk: "network-access", ownerAgentId: "agent-7" }, { requestedBy: "Explore" });
    expect(html).toMatch(/Network access<span aria-hidden="true"> ·<\/span>/);
    expect(html).toContain("Needs your approval");
    expect(html).toMatch(/requested by <span[^>]*>Explore<\/span>/);
    expect(render({ ...pending, ownerAgentId: "agent-7" })).toContain("· requested by a subagent");
    expect(render(pending)).not.toContain("requested by");
    expect(render(pending)).not.toContain("data-approval-risk");
  });

  test("an always-allowed card names the trusted entry and offers Remove while it is still trusted", () => {
    withTrustedTools(["bash:bun run typecheck"]);
    const html = render(alwaysAllowed);
    expect(html).toContain("data-trusted-rule");
    expect(html).toMatch(/Trusted: <code[^>]*>Bash: bun run typecheck<\/code>/);
    expect(html).toContain('aria-label="Remove Bash: bun run typecheck from trusted approvals"');

    // Removed in Settings (or elsewhere): the card no longer claims the rule.
    withTrustedTools([]);
    expect(render(alwaysAllowed)).not.toContain("data-trusted-rule");
    // A grant the provider keeps (no Stave entry) has nothing to remove here.
    withTrustedTools(["bash:bun run typecheck"]);
    expect(render({ ...alwaysAllowed, trustedToolEntry: undefined })).not.toContain("data-trusted-rule");
    // An allow once keeps no rule.
    expect(render({ ...alwaysAllowed, resolution: { ...alwaysAllowed.resolution!, scope: "once" } })).not.toContain("data-trusted-rule");
  });
});

describe("resolveApprovalRequesterName", () => {
  test("names the subagent from the call that started it, and nobody otherwise", () => {
    const parts: MessagePart[] = [
      { type: "tool_use", toolUseId: "t1", toolName: "Agent", agentId: "agent-7", input: JSON.stringify({ subagent_type: "Explore", description: "Map the settings" }), state: "input-available" },
      { type: "tool_use", toolUseId: "t2", toolName: "Agent", agentId: "agent-8", input: JSON.stringify({ description: "Check the docs" }), state: "input-available" },
    ];
    expect(resolveApprovalRequesterName({ parts, ownerAgentId: "agent-7" })).toBe("Explore");
    expect(resolveApprovalRequesterName({ parts, ownerAgentId: "agent-8" })).toBe("Check the docs");
    expect(resolveApprovalRequesterName({ parts, ownerAgentId: "agent-9" })).toBeNull();
    expect(resolveApprovalRequesterName({ parts })).toBeNull();
  });
});
