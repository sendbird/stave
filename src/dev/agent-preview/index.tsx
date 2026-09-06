import { useEffect, useMemo, useState } from "react";
import {
  AgentStyleProvider,
  type AgentStyle,
} from "@/components/ai-elements/agent-style-context";
import type { ReasoningTextVariant } from "@/components/ai-elements/reasoning-text";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { applyThemeClass } from "@/lib/themes/apply";
import { agentPreviewStyles as a } from "./agent-preview.styles";
import {
  createCompletedPreviewMessage,
  createStreamingPreviewMessage,
  type PreviewMessage,
} from "./fixtures";

/**
 * Dev-only side-by-side comparison of the legacy and current agent trace
 * rendering. Mounted from `src/main.tsx` instead of `<App />` when
 * `?stavePreview=agent-messages` is present, so none of App's workspace
 * bootstrap effects run.
 */

const STYLES: { style: AgentStyle; title: string; note: string }[] = [
  {
    style: "legacy",
    title: "Legacy",
    note: "Brain icon · fade rows · uncapped viewport",
  },
  {
    style: "beui",
    title: "Current",
    note: "Thinking orb · spring rows · capped glide",
  },
];

const PHRASE_VARIANTS: ReasoningTextVariant[] = ["cascade", "swap", "scramble"];

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      layout="host"
      type="button"
      onClick={onClick}
      xstyle={[a.toggle, transition.colors, active && a.toggleActive]}
    >
      {label}
    </Button>
  );
}

function PreviewColumn({
  style,
  title,
  note,
  message,
  fontSize,
  phraseVariant,
}: {
  style: AgentStyle;
  title: string;
  note: string;
  message: PreviewMessage;
  fontSize: number;
  phraseVariant: ReasoningTextVariant;
}) {
  return (
    <section className={sx(a.column)}>
      <header className={sx(a.columnHeader)}>
        <h2 className={sx(a.columnTitle)}>{title}</h2>
        <p className={sx(a.columnNote)}>{note}</p>
      </header>
      <div className={sx(a.columnBody)} style={{ fontSize: `${fontSize}px` }}>
        <AgentStyleProvider style={style} phraseVariant={phraseVariant}>
          <AssistantMessageBody
            message={message}
            taskId="preview-task"
            messageId={`preview-message-${style}`}
            streamingEnabled
            traceExpansionMode="auto"
          />
        </AgentStyleProvider>
      </div>
    </section>
  );
}

export function AgentPreviewApp() {
  const [streaming, setStreaming] = useState(true);
  const [dark, setDark] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [phraseVariant, setPhraseVariant] =
    useState<ReasoningTextVariant>("cascade");

  useEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);

  const message = useMemo(
    () =>
      streaming
        ? createStreamingPreviewMessage()
        : createCompletedPreviewMessage(),
    [streaming],
  );

  return (
    <div className={sx(a.page)}>
      <div className={sx(a.container)}>
        <div className={sx(a.controlsRow)}>
          <h1 className={sx(a.heading)}>Agent trace preview</h1>
          <div className={sx(a.toggleGroup)}>
            <Toggle
              label={streaming ? "Streaming" : "Completed"}
              active={streaming}
              onClick={() => setStreaming((value) => !value)}
            />
            <Toggle
              label={dark ? "Dark" : "Light"}
              active={dark}
              onClick={() => setDark((value) => !value)}
            />
          </div>
          <label className={sx(a.fontLabel)}>
            Font size
            <input
              type="range"
              min={12}
              max={24}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
            <span className={sx(a.fontValue)}>{fontSize}px</span>
          </label>
          <div className={sx(a.toggleGroup)}>
            {PHRASE_VARIANTS.map((variant) => (
              <Toggle
                key={variant}
                label={variant}
                active={phraseVariant === variant}
                onClick={() => setPhraseVariant(variant)}
              />
            ))}
          </div>
        </div>

        <div className={sx(a.columns)}>
          {STYLES.map((entry) => (
            <PreviewColumn
              key={entry.style}
              style={entry.style}
              title={entry.title}
              note={entry.note}
              message={message}
              fontSize={fontSize}
              phraseVariant={phraseVariant}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
