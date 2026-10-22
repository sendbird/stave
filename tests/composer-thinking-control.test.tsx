import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ComposerControlDensityProvider } from "@/components/ai-elements/composer-control-density";
import { PromptInputThinkingControl } from "@/components/ai-elements/prompt-input-thinking-control";
import {
  CLAUDE_THINKING_MODE_HELP,
  getClaudeThinkingModeHelp,
  type ClaudeThinkingMode,
} from "@/lib/providers/claude-thinking-mode";

afterEach(() => {
  applyAppLocale("en");
});

function renderControl(
  mode: ClaudeThinkingMode | undefined,
  density: "default" | "icon" = "default",
) {
  return renderToStaticMarkup(
    createElement(
      ComposerControlDensityProvider,
      { value: density },
      createElement(PromptInputThinkingControl, {
        mode,
        disabled: false,
        onChange: () => {},
      }),
    ),
  );
}

describe("Thinking control", () => {
  test("its label says the mode in use, and it opens a menu", () => {
    const html = renderControl("enabled");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="Thinking · Enabled"');
    expect(html).toContain(">Thinking · Enabled<");
    // The hover hint says the mode is shared by every task.
    expect(html).toContain('title="Thinking: Enabled. Applies to every Claude task."');
    expect(html).toContain('data-composer-control="true"');
  });

  test("no stored mode reads as the default, Adaptive", () => {
    expect(renderControl(undefined)).toContain(">Thinking · Adaptive<");
    expect(renderControl("disabled")).toContain(">Thinking · Disabled<");
  });

  test("in a wing the label is the mode alone and the name keeps both", () => {
    const html = renderControl("adaptive", "icon");
    expect(html).toContain('aria-label="Thinking · Adaptive"');
    expect(html).toContain("><span>Adaptive</span><");
    expect(html).not.toContain(">Thinking · Adaptive<");
  });

  test("Korean copy", () => {
    applyAppLocale("ko");
    const html = renderControl("enabled");
    expect(html).toContain('aria-label="사고 · 켜짐"');
    expect(html).toContain(">사고 · 켜짐<");
  });
});

describe("thinking mode help", () => {
  test("the menu and Settings describe the three modes in the same words", () => {
    expect(CLAUDE_THINKING_MODE_HELP.map((option) => option.value)).toEqual([
      "adaptive",
      "enabled",
      "disabled",
    ]);
    for (const option of CLAUDE_THINKING_MODE_HELP) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
    expect(getClaudeThinkingModeHelp("disabled").label).toBe("Disabled");
    expect(getClaudeThinkingModeHelp(undefined).value).toBe("adaptive");
  });
});
