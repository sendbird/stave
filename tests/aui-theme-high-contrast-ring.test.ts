import { expect, test } from "bun:test";
import { vars } from "../src/components/aui/tokens/tokens.stylex";
import { auiDarkHighContrastVariables, auiLightHighContrastVariables, auiThemeVariables } from "../src/components/system/aui-theme";

const ring = (vars["--aui-color-ring"] as string).slice(4, -1);

test("a raised surface's ring is translucent by default and opaque under high contrast, light and dark", () => {
  expect(auiThemeVariables[ring]).toContain("transparent");
  expect(auiLightHighContrastVariables[ring]).toBe("var(--border)");
  expect(auiDarkHighContrastVariables[ring]).toBe("var(--border)");
  // The rest of the mapping is shared: high contrast only overrides its emphasis tokens.
  const faint = (vars["--aui-color-text-faint"] as string).slice(4, -1);
  expect(auiLightHighContrastVariables[faint]).toBe(auiThemeVariables[faint]);
});
