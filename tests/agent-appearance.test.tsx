import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { darkThemeValues, highContrastThemeValues, lightThemeValues } from "@/components/ads/tokens/theme-values";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { BUILTIN_CUSTOM_THEMES, PRESET_THEME_TOKENS } from "@/lib/themes";
import { contrastRatio, mixOklab, parseCssColor } from "@/lib/themes/contrast";
import {
  AGENT_AVATAR_FILL_SHARE,
  AGENT_AVATAR_INK_FLOOR,
  AGENT_AVATAR_INK_SHARE,
  agentAvatarPalette,
  agentAvatarTone,
  clampAvatarInk,
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
  const adsThemes = { light: lightThemeValues, dark: darkThemeValues, "high contrast": highContrastThemeValues };
  type AdsValues = typeof lightThemeValues;
  const chart = (values: AdsValues) => (index: number) => values[`--ads-chart-${index}` as keyof AdsValues];
  // Every theme a user can pick: the ADS bases, Stave's two presets and each
  // built-in port. Stave themes reach the avatar through `ads-theme.ts`
  // (surface = `--card`, text = `--foreground`); chart hues stay ADS's own.
  const catalog = [
    ...Object.entries(adsThemes).map(([id, values]) => ({
      id: `ads ${id}`,
      surface: values["--ads-color-surface"],
      text: values["--ads-color-text"],
      hues: chart(values),
    })),
    ...[
      { id: "preset-light", baseMode: "light" as const, tokens: PRESET_THEME_TOKENS.light as Record<string, string> },
      { id: "preset-dark", baseMode: "dark" as const, tokens: PRESET_THEME_TOKENS.dark as Record<string, string> },
      ...BUILTIN_CUSTOM_THEMES,
    ].map((theme) => ({
      id: theme.id,
      surface: theme.tokens.card ?? "",
      text: theme.tokens.foreground ?? "",
      hues: chart(theme.baseMode === "dark" ? darkThemeValues : lightThemeValues),
    })),
  ];

  test("initials hold 4.5:1 on the soft fill for every hue in every built-in theme", () => {
    expect(catalog.length).toBeGreaterThan(BUILTIN_CUSTOM_THEMES.length);
    const failures: string[] = [];
    for (const theme of catalog) {
      const palette = agentAvatarPalette(theme);
      if (!palette) {
        failures.push(`${theme.id}: unreadable`);
        continue;
      }
      for (const color of AGENT_COLORS) {
        // Measure the strings the avatar paints, so rounding cannot hide a miss.
        const ratio = contrastRatio(parseCssColor(palette[color].ink)!, parseCssColor(palette[color].fill)!);
        if (ratio < AGENT_AVATAR_INK_FLOOR) failures.push(`${theme.id} ${color} ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("the clamp leaves a readable ink alone and only moves a short one towards the far pole", () => {
    const surface = parseCssColor(lightThemeValues["--ads-color-surface"])!;
    const hue = parseCssColor(lightThemeValues["--ads-chart-1"])!;
    const fill = mixOklab(surface, hue, AGENT_AVATAR_FILL_SHARE / 100);
    const text = parseCssColor("oklch(0.2 0 0)")!;
    const readable = mixOklab(text, hue, AGENT_AVATAR_INK_SHARE / 100);
    expect(clampAvatarInk(readable, fill, text)).toEqual(readable);

    // Everforest Light's body ink is too close to a light fill once tinted.
    const everforest = parseCssColor("#5c6a72")!;
    const short = mixOklab(everforest, hue, AGENT_AVATAR_INK_SHARE / 100);
    expect(contrastRatio(short, fill)).toBeLessThan(AGENT_AVATAR_INK_FLOOR);
    const clamped = clampAvatarInk(short, fill, everforest);
    expect(contrastRatio(clamped, fill)).toBeGreaterThanOrEqual(AGENT_AVATAR_INK_FLOOR);
    expect(clamped.l).toBeLessThan(short.l);

    // On a dark surface the ink is the light pole, so it lifts instead.
    const darkSurface = parseCssColor("oklch(0.25 0.01 250)")!;
    const darkFill = mixOklab(darkSurface, hue, AGENT_AVATAR_FILL_SHARE / 100);
    const dim = parseCssColor("oklch(0.62 0.01 250)")!;
    const lifted = clampAvatarInk(mixOklab(dim, hue, AGENT_AVATAR_INK_SHARE / 100), darkFill, dim);
    expect(lifted.l).toBeGreaterThan(dim.l);
    expect(contrastRatio(lifted, darkFill)).toBeGreaterThanOrEqual(AGENT_AVATAR_INK_FLOOR);
  });

  test("a theme value the parser cannot read falls back to the CSS mix", () => {
    expect(agentAvatarPalette({ surface: "rgb(255 255 255)", text: "#111", hues: () => "#36c" })).toBeNull();
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

  test("another agent's workflow stage blocks deletion; a task does not", () => {
    const references = findAgentReferences({
      agentConfigId: "ui-maintainer",
      agents: [shipper],
      assignments: [
        { agentConfigId: "ui-maintainer", state: "started", assignment: "Do the thing\nmore", taskId: "t1" } as never,
        { agentConfigId: "ui-maintainer", state: "failed", assignment: "Old", taskId: "t2" } as never,
      ],
    });
    expect(references.blocking.map((reference) => reference.kind)).toEqual(["workflow-stage"]);
    expect(references.soft.map((reference) => reference.label)).toEqual(["Do the thing"]);
    expect(agentIsDeletable(references)).toBe(false);
  });

  test("an unreferenced agent is deletable", () => {
    const references = findAgentReferences({ agentConfigId: "nobody", agents: [shipper] });
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
    // No stages: no "Stages · 0 of 12" header over an empty list, only Add stage.
    expect(single).not.toContain("of 12");
    expect(single).toContain("Add stage");
    const staged = renderToStaticMarkup(
      createElement(AgentEditor, { agent: { ...draft, workflow: getBuiltinAgent("shipper")!.workflow }, onSave: () => null }),
    );
    for (const title of ["Validate", "Open draft PR", "Watch checks", "Ready for review", "Check in with me", "Only when stuck"]) {
      expect(staged).toContain(title);
    }
  });
});
