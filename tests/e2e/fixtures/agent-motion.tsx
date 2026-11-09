import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { applyAppLocale } from "@/i18n";
import { AgentGlyphSwap, AgentHighlight, AgentTextSwap } from "@/components/aui/components/agent-motion";
import { CommandDialog } from "@/components/aui/components/Command.dialog";
import { agentMotion } from "@/components/aui/recipes/agent-motion";
import { sx } from "@/components/aui/utils/stylex";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import "@/components/aui/styles.css";
import "@/globals.css";

applyAppLocale("en");

type State = { label: string; glyph: "running" | "done"; highlight: number };
let update: (next: Partial<State>) => void = () => {};

function Harness() {
  const [state, setState] = useState<State>({ label: "Running", glyph: "running", highlight: 0 });
  update = (next) => flushSync(() => setState((current) => ({ ...current, ...next })));
  return (
    <main style={{ display: "grid", gap: 16, padding: 24 }}>
      <span data-fixture="text"><AgentTextSwap>{state.label}</AgentTextSwap></span>
      <span data-fixture="glyph">
        <AgentGlyphSwap swapKey={state.glyph}><span data-glyph={state.glyph}>{state.glyph === "done" ? "✓" : "…"}</span></AgentGlyphSwap>
      </span>
      <div data-fixture="highlight" className={sx(agentMotion.layerHost)} style={{ blockSize: 24 }}>
        <AgentHighlight highlightKey={state.highlight} />
        step
      </div>
      <CommandDialog
        trigger="Open palette"
        items={[{ value: "first", label: "First command" }, { value: "second", label: "Second command" }]}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StaveDesignProvider><Harness /></StaveDesignProvider>);
Object.assign(window, { agentMotionFixture: { update: (next: Partial<State>) => update(next) } });
