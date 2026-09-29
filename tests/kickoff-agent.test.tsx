import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  resolveKickoffAgentRoute,
  selectableKickoffAgents,
} from "@/components/layout/KickoffDialog.utils";
import { KickoffSourceWho } from "@/components/layout/KickoffSourceWho";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";

describe("kickoff chooses who does the work", () => {
  test("selectable agents are usable as a main agent and not archived", () => {
    const usable = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const archived = { ...duplicateAgent(getBuiltinAgent("implementer")!, []), id: "archived", archived: true };
    const ids = selectableKickoffAgents([usable, archived]).map((agent) => agent.id);
    expect(ids).toContain(usable.id);
    expect(ids).not.toContain("archived");
    // A built-in worker-only agent (scout) is never offered as a main agent.
    expect(ids).not.toContain("scout");
  });

  test("an auto agent follows the route; the preferred provider is the fallback", () => {
    const agent = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const route = resolveKickoffAgentRoute({
      agent,
      profile: null,
      preferredProviderId: "codex",
      choice: "auto",
    });
    expect(route.providerId).toBe("codex");
    // A picked provider is never re-routed and runs with its default model.
    const picked = resolveKickoffAgentRoute({
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
        sourceText: "Do the work.",
      }),
    );
    expect(html).toContain("Who");
    expect(html).toContain("Start now");
  });
});
