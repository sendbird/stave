import { describe, expect, it } from "bun:test";
import {
  BUILTIN_CUSTOM_THEMES,
  PRESET_THEME_TOKENS,
} from "@/lib/themes";
import {
  CONTROL_LABEL_FLOOR,
  MUTED_SURFACES,
  MUTED_TEXT_FLOOR,
  PLACEHOLDER_TEXT_FLOOR,
  SELECTION_DISTINGUISH_FLOOR,
  SEMANTIC_FILL_FLOOR,
  SUBTLE_TEXT_FLOOR,
  compositeOver,
  contrastRatio,
  deriveAdsSemanticRamp,
  deriveAdsTextRamp,
  parseCssColor,
} from "@/lib/themes/contrast";

const catalog = [
  { id: "preset-light", tokens: PRESET_THEME_TOKENS.light },
  { id: "preset-dark", tokens: PRESET_THEME_TOKENS.dark },
  ...BUILTIN_CUSTOM_THEMES.map((theme) => ({
    id: theme.id,
    tokens: theme.tokens,
  })),
];

describe("theme contrast helpers", () => {
  it("measures black on white as 21:1", () => {
    const black = parseCssColor("#000000");
    const white = parseCssColor("#ffffff");
    expect(black).not.toBeNull();
    expect(white).not.toBeNull();
    expect(contrastRatio(black!, white!)).toBeCloseTo(21, 5);
  });
});

describe("built-in themes meet ADS text floors", () => {
  it("keeps body ink at 4.5:1 on the surfaces it sits on", () => {
    const pairs = [
      ["foreground", "background"],
      ["foreground", "card"],
      ["card-foreground", "card"],
      ["popover-foreground", "popover"],
      ["sidebar-foreground", "sidebar"],
    ] as const;
    const failures: string[] = [];
    for (const theme of catalog) {
      for (const [inkName, surfaceName] of pairs) {
        const ink = parseCssColor(theme.tokens[inkName] ?? "");
        const surface = parseCssColor(theme.tokens[surfaceName] ?? "");
        if (!ink || !surface) {
          continue;
        }
        const ratio = contrastRatio(ink, surface);
        if (ratio < MUTED_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: ${inkName}/${surfaceName} ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps muted, placeholder, and subtle copy above ADS floors", () => {
    const failures: string[] = [];
    for (const theme of catalog) {
      const ramp = deriveAdsTextRamp(theme.tokens);
      if (!ramp) {
        failures.push(`${theme.id}: missing muted ramp`);
        continue;
      }
      for (const surfaceName of MUTED_SURFACES) {
        const surface = parseCssColor(theme.tokens[surfaceName] ?? "");
        if (!surface) {
          continue;
        }
        const muted = contrastRatio(ramp.muted, surface);
        const placeholder = contrastRatio(ramp.placeholder, surface);
        const subtle = contrastRatio(ramp.subtle, surface);
        if (muted < MUTED_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: muted/${surfaceName} ${muted.toFixed(2)}:1`,
          );
        }
        if (placeholder < PLACEHOLDER_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: placeholder/${surfaceName} ${placeholder.toFixed(2)}:1`,
          );
        }
        if (subtle < SUBTLE_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: subtle/${surfaceName} ${subtle.toFixed(2)}:1`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps control labels at 3:1 on their fills", () => {
    const pairs = [
      ["primary-foreground", "primary"],
      ["destructive-foreground", "destructive"],
      ["success-foreground", "success"],
      ["warning-foreground", "warning"],
      ["sidebar-primary-foreground", "sidebar-primary"],
    ] as const;
    const failures: string[] = [];
    for (const theme of catalog) {
      for (const [inkName, fillName] of pairs) {
        const ink = parseCssColor(theme.tokens[inkName] ?? "");
        const fill = parseCssColor(theme.tokens[fillName] ?? "");
        if (!ink || !fill) {
          continue;
        }
        const ratio = contrastRatio(ink, fill);
        if (ratio < CONTROL_LABEL_FLOOR) {
          failures.push(
            `${theme.id}: ${inkName}/${fillName} ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps semantic ink and fills readable on cards", () => {
    const failures: string[] = [];
    for (const theme of catalog) {
      const card = parseCssColor(theme.tokens.card ?? "");
      const foreground = parseCssColor(theme.tokens.foreground ?? "");
      if (!card || !foreground) {
        continue;
      }
      for (const name of ["destructive", "success", "warning", "info"] as const) {
        const fill = parseCssColor(theme.tokens[name] ?? "");
        if (!fill) {
          continue;
        }
        const ramp = deriveAdsSemanticRamp({ fill, foreground, card });
        const fillRatio = contrastRatio(fill, card);
        const textOnCard = contrastRatio(ramp.text, card);
        const textOnSoft = contrastRatio(ramp.text, ramp.soft);
        if (fillRatio < SEMANTIC_FILL_FLOOR) {
          failures.push(
            `${theme.id}: ${name}/card ${fillRatio.toFixed(2)}:1`,
          );
        }
        if (textOnCard < MUTED_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: ${name}-text/card ${textOnCard.toFixed(2)}:1`,
          );
        }
        if (textOnSoft < MUTED_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: ${name}-text/soft ${textOnSoft.toFixed(2)}:1`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps diff ink at 4.5:1 on the wash", () => {
    const failures: string[] = [];
    for (const theme of catalog) {
      const card = parseCssColor(theme.tokens.card ?? "");
      if (!card) {
        continue;
      }
      for (const [inkName, washName] of [
        ["diff-added-foreground", "diff-added"],
        ["diff-removed-foreground", "diff-removed"],
      ] as const) {
        const ink = parseCssColor(theme.tokens[inkName] ?? "");
        const wash = parseCssColor(theme.tokens[washName] ?? "");
        if (!ink || !wash) {
          continue;
        }
        const ratio = contrastRatio(ink, compositeOver(wash, card));
        if (ratio < MUTED_TEXT_FLOOR) {
          failures.push(
            `${theme.id}: ${inkName}/${washName} ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps translucent selection fills distinguishable from the card", () => {
    const failures: string[] = [];
    for (const theme of catalog) {
      const card = parseCssColor(theme.tokens.card ?? "");
      const accent = parseCssColor(theme.tokens.accent ?? "");
      if (!card || !accent || accent.alpha >= 1) {
        continue;
      }
      const ratio = contrastRatio(compositeOver(accent, card), card);
      if (ratio < SELECTION_DISTINGUISH_FLOOR) {
        failures.push(`${theme.id}: accent/card ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});
