import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { darkThemeValues, highContrastThemeValues, lightThemeValues } from "@/components/ads/tokens/theme-values";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { contrastRatio, mixOklab, parseCssColor } from "@/lib/themes/contrast";
import {
  AGENT_AVATAR_FILL_SHARE,
  AGENT_AVATAR_INK_SHARE,
  agentAvatarTone,
  AGENT_COLOR_CHART_INDEX,
  agentColor,
  agentColorToken,
  agentInitials,
  derivedAgentColor,
} from "@/lib/agents/agent-appearance";
import { findAgentReferences, agentIsDeletable } from "@/lib/agents/agent-references";
import {
  blankCustomAgent,
  duplicateAgent,
  removeCustomAgent,
  upsertCustomAgent,
} from "@/lib/agents/library";
import { AgentConfigSchema, AGENT_COLORS, type AgentConfig } from "@/lib/agents/schema";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { AgentEditor } from "@/components/agents/AgentEditor";

function custom(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    ...duplicateAgent(getBuiltinAgent("implementer")!, []),
    id: "ui-maintainer",
    name: "UI Maintainer",
    ...overrides,
  });
}

describe("agent appearance", () => {
  test("appearance is optional, so an agent saved without it stays valid", () => {
    expect(AgentConfigSchema.safeParse(custom()).success).toBe(true);
    const withColor = AgentConfigSchema.parse(custom({ appearance: { color: "green" } }));
    expect(withColor.appearance?.color).toBe("green");
  });

  test("a chosen colour wins; without one the id derives a stable colour", () => {
    expect(agentColor(custom({ appearance: { color: "red" } }))).toBe("red");
    const first = derivedAgentColor("ui-maintainer");
    expect(derivedAgentColor("ui-maintainer")).toBe(first);
    expect(AGENT_COLORS).toContain(first);
  });

  test("every colour maps to an existing chart token; no new token added", () => {
    for (const color of AGENT_COLORS) {
      const index = AGENT_COLOR_CHART_INDEX[color];
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(14);
    }
    expect(agentColorToken(custom({ appearance: { color: "blue" } }))).toBe("var(--ads-chart-1)");
  });

  test("initials take the first letters of up to two words", () => {
    expect(agentInitials("UI Maintainer")).toBe("UM");
    expect(agentInitials("Reviewer")).toBe("RE");
    expect(agentInitials("   ")).toBe("?");
  });
});

describe("agent avatar", () => {
  const themes = { light: lightThemeValues, dark: darkThemeValues, "high contrast": highContrastThemeValues };

  test("initials hold 4.5:1 on the soft fill for every hue in every theme", () => {
    const failures: string[] = [];
    for (const [theme, values] of Object.entries(themes)) {
      const surface = parseCssColor(values["--ads-color-surface"])!;
      const text = parseCssColor(values["--ads-color-text"])!;
      for (const color of AGENT_COLORS) {
        const hue = parseCssColor(values[`--ads-chart-${AGENT_COLOR_CHART_INDEX[color]}` as keyof typeof values])!;
        const fill = mixOklab(surface, hue, AGENT_AVATAR_FILL_SHARE / 100);
        const ink = mixOklab(text, hue, AGENT_AVATAR_INK_SHARE / 100);
        const ratio = contrastRatio(ink, fill);
        if (ratio < 4.5) failures.push(`${theme} ${color} ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("the tone mixes the agent's own hue into the fill and the ink", () => {
    const tone = agentAvatarTone(custom({ appearance: { color: "green" } }));
    expect(tone.fill).toContain("var(--ads-chart-3)");
    expect(tone.ink).toContain("var(--ads-chart-3)");
  });

  test("an agent is a rounded square; a provider mark appears only when asked", () => {
    const agent = custom();
    const plain = renderToStaticMarkup(createElement(AgentAvatar, { agent, size: "sm" }));
    const withProvider = renderToStaticMarkup(createElement(AgentAvatar, { agent, size: "sm", providerId: "codex" }));
    expect(plain).not.toContain("<img");
    expect(withProvider).toContain("<img");
    expect(withProvider).toContain("--agent-avatar-fill");
  });
});

describe("removeCustomAgent and blankCustomAgent", () => {
  test("remove drops only the named agent and leaves the rest", () => {
    const list = [custom(), custom({ id: "other", name: "Other" })];
    expect(removeCustomAgent(list, "ui-maintainer").map((agent) => agent.id)).toEqual(["other"]);
    expect(removeCustomAgent(list, "missing")).toHaveLength(2);
  });

  test("a blank agent is a valid, ready custom agent with a unique id from the name", () => {
    const blank = blankCustomAgent({ name: "Docs Writer", takenIds: ["docs-writer"] });
    expect(blank.source).toBe("custom");
    expect(blank.id).toBe("docs-writer-2");
    expect(blank.model.mode).toBe("auto");
    expect(AgentConfigSchema.safeParse(blank).success).toBe(true);
    // A blank agent can be saved without further edits.
    expect(upsertCustomAgent([], blank)).toHaveLength(1);
  });
});

describe("agent references", () => {
  const shipper = {
    id: "ship",
    name: "Ship it",
    workflow: [{ id: "impl", title: "Implement", kind: "ai" as const, instruction: "x", doneWhen: "y", agentConfigId: "ui-maintainer" }],
  } as never;
  const project = { id: "proj", name: "Refresh", settings: { agents: ["ui-maintainer"] } } as never;

  test("another agent's workflow stage and a project block deletion; a task does not", () => {
    const references = findAgentReferences({
      agentConfigId: "ui-maintainer",
      agents: [shipper],
      projects: [project],
      assignments: [
        { agentConfigId: "ui-maintainer", state: "started", assignment: "Do the thing\nmore", taskId: "t1" } as never,
        { agentConfigId: "ui-maintainer", state: "failed", assignment: "Old", taskId: "t2" } as never,
      ],
    });
    expect(references.blocking.map((reference) => reference.kind)).toEqual(["workflow-stage", "project"]);
    expect(references.soft.map((reference) => reference.label)).toEqual(["Do the thing"]);
    expect(agentIsDeletable(references)).toBe(false);
  });

  test("an unreferenced agent is deletable", () => {
    const references = findAgentReferences({ agentConfigId: "nobody", agents: [shipper], projects: [project] });
    expect(agentIsDeletable(references)).toBe(true);
  });
});

describe("agent editor", () => {
  test("the editor shows the essentials and keeps the rest under Advanced", () => {
    const draft = blankCustomAgent({ name: "Docs Writer", takenIds: [] });
    const html = renderToStaticMarkup(
      createElement(AgentEditor, { agent: draft, onSave: () => null, onCancel: () => {}, saveLabel: "Save agent" }),
    );
    for (const section of ["Profile", "Instructions", "How it runs", "Permission", "Works in", "Advanced"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("Save agent");
    expect(html).toContain("Cancel");
  });

  test("the Workflow section lists the stages and offers check-ins only with more than one", () => {
    const draft = blankCustomAgent({ name: "Docs Writer", takenIds: [] });
    const single = renderToStaticMarkup(createElement(AgentEditor, { agent: draft, onSave: () => null }));
    expect(single).toContain("Workflow");
    expect(single).toContain("Runs as one stage");
    expect(single).not.toContain("Check in with me");
    const staged = renderToStaticMarkup(
      createElement(AgentEditor, { agent: { ...draft, workflow: getBuiltinAgent("shipper")!.workflow }, onSave: () => null }),
    );
    for (const title of ["Validate", "Open draft PR", "Watch checks", "Ready for review", "Check in with me", "Only when stuck"]) {
      expect(staged).toContain(title);
    }
  });
});
