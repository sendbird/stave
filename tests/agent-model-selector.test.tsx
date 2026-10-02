import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelPickerAgents } from "@/components/ai-elements/model-effort-selector";
import type { TaskAgentChoice } from "@/components/ai-elements/prompt-input-agent-control";
import { describeAgentRoute } from "@/components/ai-elements/agent-route-row";
import { getBuiltinAgent } from "@/lib/agents/starters";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

function setWindowContext() {
  Object.defineProperty(globalThis, "window", {
    value: {
      api: {},
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
      location: { href: "https://stave.test/workspace" },
      matchMedia: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  else delete (globalThis as { window?: unknown }).window;
});

const implementer = getBuiltinAgent("implementer")!;
const researcher = getBuiltinAgent("researcher")!;

function agentsProp(overrides: Partial<ModelPickerAgents> = {}): ModelPickerAgents {
  return {
    active: { id: implementer.id, name: implementer.name, appearance: implementer.appearance },
    route: "auto",
    fixedModel: false,
    autoAvailable: true,
    count: 6,
    renderPanel: () => null,
    onPin: () => {},
    onUnpin: () => {},
    ...overrides,
  };
}

async function renderSelector(args: {
  agents?: ModelPickerAgents;
  auto?: boolean;
  model?: string;
}) {
  setWindowContext();
  const [{ ModelEffortSelector }, { buildAutoModelSelectorOption, buildModelSelectorValue }] = await Promise.all([
    import("@/components/ai-elements/model-effort-selector"),
    import("@/components/ai-elements/model-selector"),
  ]);
  const model = buildModelSelectorValue({ providerId: "claude-code", model: args.model ?? "claude-opus-5" });
  const auto = buildAutoModelSelectorOption({ providerId: "claude-code", available: true, stanceLabel: "Balanced" });
  return renderToStaticMarkup(
    createElement(ModelEffortSelector, {
      value: args.auto ? auto : model,
      options: [auto, model],
      onSelect: () => {},
      ...(args.agents ? { agents: args.agents } : {}),
    }),
  );
}

describe("the selector trigger", () => {
  test("Chat keeps the single model button, with or without agents on offer", async () => {
    for (const agents of [undefined, agentsProp({ active: null, route: null })]) {
      const html = await renderSelector({ agents });
      expect(html).not.toContain("data-agent-segments");
      expect(html).toContain('aria-label="Model: Claude Opus 5. Effort: High"');
    }
  });

  test("an agent task splits the trigger into the agent and its model: Implementer | Auto", async () => {
    const html = await renderSelector({ agents: agentsProp(), auto: true });
    expect(html).toContain('data-agent-segments="true"');
    expect(html).toContain('aria-label="Agent: Implementer. Open the model and agent selector."');
    expect(html).toContain('aria-label="Model: Stave Auto. Implementer chooses the model for each turn."');
    expect(html).toContain('data-agent-route="auto"');
    // No effort while Stave Auto chooses; no Pinned.
    expect(html).not.toContain("Pinned");
    expect(html).not.toContain("Effort:");
    expect(html.indexOf("Agent: Implementer")).toBeLessThan(html.indexOf("Model: Stave Auto"));
  });

  test("a pin reads Pinned · model, with the effort visible", async () => {
    const html = await renderSelector({ agents: agentsProp({ route: "pinned" }) });
    expect(html).toContain("Pinned</span>");
    expect(html).toContain("Claude Opus 5</span>");
    expect(html).toContain('aria-label="Model: Claude Opus 5. Pinned for Implementer. Effort: High"');
    expect(html).toContain('data-agent-route="pinned"');
  });

  test("the agent's own fixed model is shown as its choice, not a user pin", async () => {
    const html = await renderSelector({ agents: agentsProp({ route: "agent-fixed", fixedModel: true }) });
    expect(html).not.toContain("Pinned");
    expect(html).toContain('aria-label="Model: Claude Opus 5. Set for Implementer. Effort: High"');
  });

  test("with Stave Auto off the model is just the task's model, not a pin", async () => {
    const html = await renderSelector({ agents: agentsProp({ route: "pinned", autoAvailable: false }) });
    expect(html).not.toContain("Pinned</span>");
    expect(html).toContain("Claude Opus 5</span>");
  });
});

describe("the pin picker's first row", () => {
  test("unpinned it names the route and is checked; pinned it reads Back to Auto", () => {
    expect(describeAgentRoute({ agentName: "Implementer", route: "auto", fixedModel: false })).toMatchObject({
      label: "Auto — Implementer chooses",
      active: true,
    });
    expect(describeAgentRoute({ agentName: "Implementer", route: "pinned", fixedModel: false })).toMatchObject({
      label: "Back to Auto",
      active: false,
    });
  });

  test("a fixed-model agent returns to its own model", () => {
    expect(describeAgentRoute({ agentName: "Implementer", route: "agent-fixed", fixedModel: true })).toMatchObject({
      label: "Implementer's model",
      active: true,
    });
    expect(describeAgentRoute({ agentName: "Implementer", route: "pinned", fixedModel: true })).toMatchObject({
      label: "Back to Implementer's model",
      active: false,
    });
  });

  test("with Stave Auto off there is no Auto to go back to, and the row says why", async () => {
    setWindowContext();
    const { AgentRouteRow } = await import("@/components/ai-elements/agent-route-row");
    const props = { agentName: "Implementer", route: "pinned" as const, fixedModel: false, onSelect: () => {} };
    const off = renderToStaticMarkup(createElement(AgentRouteRow, { ...props, autoAvailable: false }));
    expect(off).toContain('data-testid="agent-route-auto-off"');
    expect(off).not.toContain('data-testid="agent-route-row"');
    const on = renderToStaticMarkup(createElement(AgentRouteRow, { ...props, autoAvailable: true }));
    expect(on).toContain('data-testid="agent-route-row"');
    expect(on).toContain("Back to Auto");
  });
});

describe("the Agents section", () => {
  async function panelHtml(args: {
    variant: "tab" | "matches";
    query?: string;
    disabled?: boolean;
    current?: boolean;
  }) {
    setWindowContext();
    const { ModelPickerAgentPanel } = await import("@/components/ai-elements/prompt-input-agent-control");
    const choice = {
      current: args.current ? { agentConfigId: researcher.id, agentName: researcher.name } : null,
      choices: [implementer, researcher],
      pending: null,
      busy: false,
      choose: async () => true,
      confirm: async () => true,
      cancel: () => undefined,
    } as unknown as TaskAgentChoice;
    return renderToStaticMarkup(
      createElement(ModelPickerAgentPanel, {
        choice,
        variant: args.variant,
        query: args.query ?? "",
        disabled: args.disabled,
        onDone: () => undefined,
      }),
    );
  }

  test("lists every main agent, with no No agent row: a model is how a task goes back to Chat", async () => {
    const html = await panelHtml({ variant: "tab" });
    expect(html).toContain('data-testid="composer-agent-implementer"');
    expect(html).toContain('data-testid="composer-agent-researcher"');
    expect(html).not.toContain("composer-agent-none");
    expect(html).not.toContain("composer-agent-locked");
    expect(html).not.toContain("experimental");
  });

  test("the selector's one search filters the list", async () => {
    const html = await panelHtml({ variant: "tab", query: "research" });
    expect(html).toContain('data-testid="composer-agent-researcher"');
    expect(html).not.toContain('data-testid="composer-agent-implementer"');
    expect(await panelHtml({ variant: "tab", query: "zzz" })).toContain("No agents match this search.");
  });

  test("under a model search the matching agents are a headed group, and nothing when none match", async () => {
    const html = await panelHtml({ variant: "matches", query: "research" });
    expect(html).toContain('data-testid="composer-agent-matches"');
    expect(html).toContain(">Agents</p>");
    expect(html).toContain('data-testid="composer-agent-researcher"');
    expect(await panelHtml({ variant: "matches", query: "zzz" })).toBe("");
  });

  test("a running or blocked turn locks switching agents", async () => {
    expect(await panelHtml({ variant: "tab", disabled: true })).toContain('data-testid="composer-agent-locked"');
  });
});

describe("the send button", () => {
  async function sendLabel(assignOnSend: boolean | undefined) {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const model = {
      key: "claude-code:claude-opus-5",
      providerId: "claude-code" as const,
      model: "claude-opus-5",
      label: "Opus 5",
      available: true,
    };
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "Fix the overflow",
          selectedModel: model,
          modelOptions: [model],
          attachedFilePaths: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          ...(assignOnSend === undefined ? {} : { assignOnSend }),
        }),
      ),
    );
    return html;
  }

  test("reads Assign for the first send in Agent mode, Send otherwise", async () => {
    expect(await sendLabel(true)).toContain('aria-label="Assign"');
    expect(await sendLabel(true)).not.toContain('aria-label="Send"');
    expect(await sendLabel(false)).toContain('aria-label="Send"');
    expect(await sendLabel(undefined)).toContain('aria-label="Send"');
  });
});

describe("the selector rail", () => {
  test("heads the Models group, sets the lone Agents tab off with a divider, and counts agents as agents", async () => {
    setWindowContext();
    const [{ SelectionRail }, { Tabs }] = await Promise.all([
      import("@/components/system/SelectionRail"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        Tabs,
        { value: "claude-code" },
        createElement(SelectionRail, {
          label: "Model providers and agents",
          value: "claude-code",
          items: [
            { value: "claude-code", label: "Claude", icon: null, count: 4, heading: "Models" },
            { value: "agents", label: "Agents", icon: null, count: 6, noun: "agents", divider: true },
          ],
        }),
      ),
    );
    expect(html.indexOf("Models</span>")).toBeLessThan(html.indexOf("Claude, 4 models"));
    expect(html.indexOf("Claude, 4 models")).toBeLessThan(html.indexOf("Agents</span>"));
    // "Agents" appears once, as the tab's label; no heading repeats it.
    expect(html.split(">Agents</span>")).toHaveLength(2);
    expect(html).toContain('aria-label="Agents, 6 agents"');
  });
});
