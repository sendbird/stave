import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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

  test("marks the selected choice segment with the checked data attribute", () => {
    const html = renderToStaticMarkup(
      createElement(ChoiceButtons, {
        value: "preset",
        onChange: () => {},
        "aria-label": "Notification sound source",
        options: [
          { value: "preset", label: "Preset" },
          { value: "custom", label: "Custom" },
        ],
      }),
    );

    // Base UI keys the selected state off `data-checked` / `data-unchecked` on
    // the radio root; the segment styling must hang off those attributes.
    expect(html).toMatch(/data-checked=""[^>]*aria-checked="true"/);
    expect(html).toMatch(/data-unchecked=""[^>]*aria-checked="false"/);
  });

  /*
   * StyleX merges by property, not by condition: a later style object in the
   * same `sx()` call replaces every branch of a property it redeclares. The
   * segment/card overrides sit on top of the shared `radio` base, so dropping
   * their `[data-checked]` branch silently erases the selected state (the
   * checked segment rendered exactly like an unchecked one). Compiled class
   * names are state-independent, so this is guarded at the source level.
   */
  test("choice overrides restate the checked branch they inherit", () => {
    const source = readFileSync(
      new URL(
        "../src/components/layout/settings-dialog.shared.styles.ts",
        import.meta.url,
      ),
      "utf8",
    );

    for (const name of ["radioSegment", "radioCard"]) {
      const block = source.slice(
        source.indexOf(`${name}: {`),
        source.indexOf("\n  },", source.indexOf(`${name}: {`)),
      );
      expect(block.length).toBeGreaterThan(0);
      for (const property of ["backgroundColor", "color"]) {
        const start = block.indexOf(`${property}: {`);
        if (start === -1) {
          continue;
        }
        expect(block.slice(start, block.indexOf("},", start))).toContain(
          "[data-checked]",
        );
      }
    }
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
