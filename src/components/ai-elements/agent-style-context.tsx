import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { ReasoningTextVariant } from "./reasoning-text";

/**
 * Selects between the previous agent-trace rendering (`legacy`) and the current
 * one (`beui`). The only reason this exists is the side-by-side dev preview at
 * `?stavePreview=agent-messages`; product code always runs on the default.
 *
 * Every `legacy` branch is marked with `TODO(agent-style-legacy)` and should be
 * deleted — along with this module — once the new visual is signed off.
 */
export type AgentStyle = "legacy" | "beui";

interface AgentStyleContextValue {
  style: AgentStyle;
  /** Dev-preview override for the thinking-phrase variant. */
  phraseVariant?: ReasoningTextVariant;
}

const DEFAULT_VALUE: AgentStyleContextValue = { style: "beui" };

const AgentStyleContext = createContext<AgentStyleContextValue>(DEFAULT_VALUE);

export function AgentStyleProvider({
  style,
  phraseVariant,
  children,
}: {
  style: AgentStyle;
  phraseVariant?: ReasoningTextVariant;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ style, phraseVariant }), [style, phraseVariant]);
  return <AgentStyleContext.Provider value={value}>{children}</AgentStyleContext.Provider>;
}

export function useAgentStyle(): AgentStyle {
  return useContext(AgentStyleContext).style;
}

export function useAgentPhraseVariant(): ReasoningTextVariant | undefined {
  return useContext(AgentStyleContext).phraseVariant;
}
