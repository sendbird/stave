import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChoiceButtons,
  LabeledField,
  SwitchField,
  ToggleChipGroup,
} from "@/components/layout/settings-dialog.shared";
import { Slider } from "@/components/ui/slider";

describe("settings control accessibility", () => {
  test("connects visible field labels to switch and choice controls", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(SwitchField, {
          title: "Sound",
          description: "Play a sound when a task completes.",
          checked: true,
          onCheckedChange: () => {},
        }),
        createElement(
          LabeledField,
          { title: "Source" },
          createElement(ChoiceButtons, {
            value: "preset",
            onChange: () => {},
            options: [
              { value: "preset", label: "Preset" },
              { value: "custom", label: "Custom" },
            ],
          }),
        ),
      ),
    );

    expect(html).toMatch(
      /role="switch"[^>]*aria-checked="true"[^>]*aria-labelledby="[^"]+"/,
    );
    expect(html).toMatch(/role="switch"[^>]*aria-describedby="[^"]+"/);
    expect(html).toMatch(/role="radiogroup" aria-labelledby="[^"]+"/);
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
  });

  test("renders multi-select chips as a labelled pressed-button group", () => {
    const html = renderToStaticMarkup(
      createElement(
        LabeledField,
        { title: "Eligible models" },
        createElement(ToggleChipGroup, {
          selected: ["claude"],
          onToggle: () => {},
          options: [
            { value: "claude", label: "Claude" },
            { value: "codex", label: "Codex" },
          ],
        }),
      ),
    );

    expect(html).toMatch(/role="group" aria-labelledby="[^"]+"/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  test("forwards semantic value text to the slider thumb input", () => {
    const html = renderToStaticMarkup(
      createElement(Slider, {
        "aria-label": "Message font size",
        value: 16,
        min: 12,
        max: 24,
        getAriaValueText: (_formattedValue, value) => `${value} pixels`,
      }),
    );

    expect(html).toContain('aria-label="Message font size"');
    expect(html).toContain('aria-valuetext="16 pixels"');
  });
});
