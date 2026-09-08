import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { TurnModelChip } from "@/components/ai-elements/turn-model-chip";
import { agentSurface } from "@/components/ads/recipes/agent-surface";
import { sx } from "@/components/ads/utils/stylex";
import { turnModelChipStyles } from "@/components/ai-elements/turn-model-chip.styles";

describe("TurnModelChip", () => {
  test("renders context in the machine register and Fast as a bolt", () => {
    const html = renderToStaticMarkup(
      <TurnModelChip
        providerId="claude-code"
        model="claude-opus-4-8[1m]"
        parts={{ name: "Claude Opus 4.8", details: ["1M", "X-High", "Fast"] }}
      />,
    );

    expect(html).toContain("Claude Opus 4.8");
    expect(html).toContain("1M");
    expect(html).toContain("X-High");
    expect(html).toContain('data-turn-model-detail="1M"');
    expect(html).toContain('data-turn-model-detail="X-High"');
    expect(html).toContain('data-turn-model-detail="Fast"');
    expect(html).toContain(sx(agentSurface.meta, turnModelChipStyles.context));
    expect(html).toContain(sx(turnModelChipStyles.detail));
    expect(html).toContain(sx(turnModelChipStyles.fast));
    expect(html).toContain("<svg");
  });
});
