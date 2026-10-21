import { describe, expect, test } from "bun:test";
import { WORK_STATE } from "../src/components/ads/components/state-vocabulary";
import {
  BUILTIN_CUSTOM_THEMES,
  STATE_COLOR_TOKEN_NAMES,
  buildCustomThemeCss,
  checkStateColors,
  deriveStateColors,
  withStateColors,
} from "@/lib/themes";

const describeProblem = (themeId: string) => (problem: ReturnType<typeof checkStateColors>[number]) =>
  `${themeId}: ${problem.kind} ${problem.tokens.join("/")} ${problem.value.toFixed(3)}`;

describe("agent state colors in built-in themes", () => {
  test("every built-in theme sets all six state colors", () => {
    for (const theme of BUILTIN_CUSTOM_THEMES) {
      for (const name of STATE_COLOR_TOKEN_NAMES) expect(theme.tokens[name]?.trim()).toBeTruthy();
    }
  });

  test("in every built-in theme the states read apart and stay legible on cards", () => {
    // Running and needing an answer, running and completed, running and failed,
    // and needing an answer and completed differ by color; glyphs reach 3:1 and
    // state text 4.5:1 on the card.
    const problems = BUILTIN_CUSTOM_THEMES.flatMap((theme) => checkStateColors(theme.tokens).map(describeProblem(theme.id)));
    expect(problems).toEqual([]);
  });

  test("running and needing an answer also differ by shape", () => {
    expect(WORK_STATE.working.icon).not.toBe(WORK_STATE["needs-you"].icon);
    expect(WORK_STATE.working.pulses).toBe(true);
    expect(WORK_STATE["needs-you"].pulses).toBe(false);
    expect(WORK_STATE.working.color).toBe("running");
    expect(WORK_STATE["needs-you"].color).toBe("needsAnswer");
    expect(WORK_STATE.approval.color).toBe("needsAnswer");
    expect(WORK_STATE.failed.color).toBe("failed");
  });

  test("a port whose primary is its warning keeps its palette but runs in another of its hues", () => {
    const vesper = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === "vesper")!;
    expect(vesper.tokens.primary).toBe(vesper.tokens.warning);
    expect(vesper.tokens["state-running"]).not.toBe(vesper.tokens["state-needs-answer"]);
    const mirage = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === "ayu-mirage")!;
    expect(mirage.tokens.primary).toBe(mirage.tokens.warning);
    expect(mirage.tokens["state-running"]).toBe(mirage.tokens.info);
  });
});

describe("deriveStateColors", () => {
  const base = {
    card: "#ffffff",
    foreground: "#1a1a1a",
    "muted-foreground": "#5f5f5f",
    primary: "#1f6feb",
    info: "#0969da",
    warning: "#9a6700",
    success: "#1a7f37",
    destructive: "#cf222e",
  };

  test("maps the theme's own colors onto the states", () => {
    expect(deriveStateColors(base)).toEqual({
      "state-running": "#1f6feb",
      "state-needs-answer": "#9a6700",
      "state-paused": "#5f5f5f",
      "state-halted": "#9a6700",
      "state-completed": "#1a7f37",
      "state-stopped": "#5f5f5f",
    });
  });

  test("moves running off a primary that reads as warning or success", () => {
    expect(deriveStateColors({ ...base, primary: base.warning })["state-running"]).toBe(base.info);
    expect(deriveStateColors({ ...base, primary: base.success })["state-running"]).toBe(base.info);
  });

  test("never runs in grey, and keeps primary when nothing else qualifies", () => {
    const tokens = { ...base, primary: base.warning, info: "#777777", "chart-1": "#808080" };
    expect(deriveStateColors(tokens)["state-running"]).toBe(base.warning);
    expect(checkStateColors(tokens).map((problem) => problem.tokens.join("/"))).toContain("state-running/state-needs-answer");
  });

  test("keeps a state color the theme sets, and halted follows needing an answer", () => {
    const derived = deriveStateColors({ ...base, "state-running": "#8250df", "state-needs-answer": "#bc4c00" });
    expect(derived["state-running"]).toBe("#8250df");
    expect(derived["state-halted"]).toBe("#bc4c00");
  });
});

describe("user themes", () => {
  test("a user theme's state colors come from its own colors, not Stave's", () => {
    const tokens = withStateColors({ baseMode: "dark", tokens: { primary: "#ffcc66", warning: "#ffcc66", info: "#73d0ff" } });
    expect(tokens["state-needs-answer"]).toBe("#ffcc66");
    expect(tokens["state-running"]).toBe("#73d0ff");
  });

  test("applying a user theme writes the derived state colors, and an empty theme writes nothing", () => {
    const css = buildCustomThemeCss({
      theme: { id: "u", name: "u", description: "", baseMode: "light", tokens: { primary: "#1f6feb" } },
    });
    expect(css).toContain("--state-running: #1f6feb;");
    expect(css).toContain("--state-needs-answer:");
    expect(buildCustomThemeCss({ theme: { id: "u", name: "u", description: "", baseMode: "light", tokens: {} } })).toBe("");
  });
});
