import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveAssignRoute } from "@/lib/agents/assign-route";
import { selectableMainAgents } from "@/lib/agents/task-mode";
import { KickoffSourceWho } from "@/components/layout/KickoffSourceWho";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildKickoffAgentRuntimeOverrides } from "@/components/layout/KickoffDialog.utils";
import { describeAgentPermissionForTask } from "@/lib/agents/agents-view";
import { buildStarterProfile, DEFAULT_AUTO_ROUTING_PROFILE_ID } from "@/lib/providers/auto-routing-profile";

describe("kickoff chooses who does the work", () => {
  test("selectable agents are usable as a main agent and not archived", () => {
    const usable = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const archived = { ...duplicateAgent(getBuiltinAgent("implementer")!, []), id: "archived", archived: true };
    const ids = selectableMainAgents([usable, archived]).map((agent) => agent.id);
    expect(ids).toContain(usable.id);
    expect(ids).not.toContain("archived");
    // A built-in worker-only agent (scout) is never offered as a main agent.
    expect(ids).not.toContain("scout");
  });

  test("an auto agent follows the route; the preferred provider is the fallback", () => {
    const agent = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const route = resolveAssignRoute({
      agent,
      profile: null,
      preferredProviderId: "codex",
      choice: "auto",
    });
    expect(route.providerId).toBe("codex");
    // A picked provider is never re-routed and runs with its default model.
    const picked = resolveAssignRoute({
      agent,
      profile: null,
      preferredProviderId: "codex",
      choice: "claude-code",
    });
    expect(picked.providerId).toBe("claude-code");
    expect(picked.model).toBeNull();
  });

  test("the source-phase Who selector renders Me and each selectable agent", () => {
    const agent = { ...duplicateAgent(getBuiltinAgent("implementer")!, []), id: "ui-maintainer", name: "UI maintainer" };
    const html = renderToStaticMarkup(
      createElement(KickoffSourceWho, {
        agents: [agent],
        who: "agent",
        agentId: "ui-maintainer",
        onWhoChange: () => {},
        onAgentChange: () => {},
        startNow: {
          canStart: true,
          busy: false,
          hint: "Claude · Stave Auto, each turn · Your permission settings — creates the worktree and starts now, without the review step.",
          onStart: () => {},
        },
      }),
    );
    expect(html).toContain("Who");
    expect(html).toContain("Start now");
    expect(html).toContain("Your permission settings");
  });

  test("with Stave Auto, the first task stays on Auto and pins no model", () => {
    const route = resolveAssignRoute({
      agent: getBuiltinAgent("implementer")!,
      profile: buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID),
      preferredProviderId: "claude-code",
      choice: "auto",
      autoRoutingEnabled: true,
    });
    expect(buildKickoffAgentRuntimeOverrides({ route, configuredModel: "claude-opus-5-5" })).toEqual({ autoRouting: true });
  });

  test("without Stave Auto, the route's model and effort are pinned to the first task", () => {
    const route = resolveAssignRoute({
      agent: getBuiltinAgent("implementer")!,
      profile: buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID),
      preferredProviderId: "claude-code",
      choice: "auto",
      autoRoutingEnabled: false,
    });
    expect(buildKickoffAgentRuntimeOverrides({ route, configuredModel: "claude-opus-5-5" })).toEqual({
      autoRouting: false,
      model: route.model!,
      modelProviderId: "claude-code",
      claudeEffort: route.effort as "high",
    });
    // A picked provider runs the user's model for it at the user's effort.
    const picked = resolveAssignRoute({
      agent: getBuiltinAgent("implementer")!,
      profile: null,
      preferredProviderId: "claude-code",
      choice: "codex",
    });
    expect(buildKickoffAgentRuntimeOverrides({ route: picked, configuredModel: "gpt-6-sol" })).toEqual({ autoRouting: false });
  });

  test("an Auto-permission agent runs on the user's permission settings; the others are ceilings", () => {
    expect(describeAgentPermissionForTask("auto")).toBe("Your permission settings");
    expect(describeAgentPermissionForTask("guided")).toBe("Up to Guided");
    expect(describeAgentPermissionForTask("manual")).toBe("Up to Manual");
    expect(describeAgentPermissionForTask("read-only")).toBe("Read only");
  });
});
