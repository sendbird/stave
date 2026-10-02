import { useState } from "react";
import { Check, Lightbulb, Pencil, X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Switch } from "@/components/ads/components/Switch";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentSuggestion } from "@/lib/agents/learned-suggestions";
import { AGENT_CONFIG_LIMITS, type AgentConfig } from "@/lib/agents/schema";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { agentStyles } from "./agents.styles";

function SuggestionCard(props: {
  suggestion: AgentSuggestion;
  stale: boolean;
  onApply: (instructions: string) => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.suggestion.instructions);
  return (
    <li className={sx(agentStyles.suggestion)}>
      <div className={sx(agentStyles.suggestionHead)}>
        <Lightbulb aria-hidden size={14} />
        <span className={sx(agentStyles.historyWhen)}>{props.suggestion.summary}</span>
      </div>
      <span className={sx(styles.hint)}>
        Learned from a correction on {new Date(props.suggestion.createdAt).toLocaleDateString()}.
        {props.stale ? " The instructions changed since; applying replaces them with this version." : ""}
      </span>
      {editing ? (
        <Textarea
          size="sm"
          aria-label="Suggested instructions"
          value={text}
          maxLength={AGENT_CONFIG_LIMITS.instructions}
          autoResize
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <details>
          <summary className={sx(styles.hint)}>Show the suggested instructions</summary>
          <pre className={sx(agentStyles.instructions)}>{props.suggestion.instructions}</pre>
        </details>
      )}
      <div className={sx(agentStyles.suggestionActions)}>
        <Button size="sm" variant="quiet" onClick={props.onDismiss}>
          <X aria-hidden />
          Dismiss
        </Button>
        {editing ? null : (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
        <Button size="sm" disabled={!text.trim()} onClick={() => props.onApply(text.trim())}>
          <Check aria-hidden />
          Apply
        </Button>
      </div>
    </li>
  );
}

/**
 * Learned suggestions for a custom agent: instruction changes proposed after
 * you corrected it in a task. Apply saves them like an edit (so the old
 * instructions stay in History), Edit changes them first, Dismiss drops them.
 * The switch turns learning off for this agent. With nothing to review it is
 * a single line (title, hint, switch) so it costs almost no space; the
 * detail shows it below the settings form.
 */
export function AgentSuggestions(props: {
  agent: AgentConfig;
  suggestions: readonly AgentSuggestion[];
  learning: boolean;
  onLearningChange: (on: boolean) => void;
  onApply: (suggestion: AgentSuggestion, instructions: string) => void;
  onDismiss: (suggestion: AgentSuggestion) => void;
}) {
  const empty = props.suggestions.length === 0;
  const learningSwitch = (
    <Switch
      density="compact"
      label="Learn from my corrections"
      checked={props.learning}
      onCheckedChange={(checked) => props.onLearningChange(checked)}
    />
  );
  if (empty) {
    return (
      <section aria-label="Learned suggestions" className={sx(agentStyles.suggestionsLine)}>
        <div className={sx(styles.sectionHeader, agentStyles.suggestionsLineText)}>
          <h3 className={sx(styles.sectionTitle, agentStyles.suggestionsLineTitle)}>Learned suggestions</h3>
          <span className={sx(styles.hint)}>
            {props.learning
              ? "None yet. When you correct this agent in a task, a suggested change to its instructions appears here. Each corrected task uses one utility-model request."
              : "Learning is off. Your corrections are not reviewed and nothing is suggested."}
          </span>
        </div>
        {learningSwitch}
      </section>
    );
  }
  return (
    <section aria-label="Learned suggestions" className={sx(agentStyles.suggestions)}>
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>Learned suggestions</h3>
        {learningSwitch}
      </div>
      <ul className={sx(agentStyles.runs)}>
        {props.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            stale={suggestion.basedOn !== props.agent.instructions}
            onApply={(instructions) => props.onApply(suggestion, instructions)}
            onDismiss={() => props.onDismiss(suggestion)}
          />
        ))}
      </ul>
    </section>
  );
}
