import { useEffect, useMemo, useState } from "react";
import { AgentStyleProvider, type AgentStyle } from "@/components/ai-elements/agent-style-context";
import type { ReasoningTextVariant } from "@/components/ai-elements/reasoning-text";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { applyThemeClass } from "@/lib/themes/apply";
import { cn } from "@/lib/utils";
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
  { style: "legacy", title: "Legacy", note: "Brain icon · fade rows · uncapped viewport" },
  { style: "beui", title: "Current", note: "Thinking orb · spring rows · capped glide" },
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
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
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-0.5 border-b border-border pb-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{note}</p>
      </header>
      <div
        className="min-w-0 rounded-lg border border-border bg-card p-4"
        style={{ fontSize: `${fontSize}px` }}
      >
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
  const [phraseVariant, setPhraseVariant] = useState<ReasoningTextVariant>("cascade");

  useEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);

  const message = useMemo(
    () => (streaming ? createStreamingPreviewMessage() : createCompletedPreviewMessage()),
    [streaming],
  );

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-base font-semibold">Agent trace preview</h1>
          <div className="flex items-center gap-1.5">
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Font size
            <input
              type="range"
              min={12}
              max={24}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
            <span className="tabular-nums text-foreground">{fontSize}px</span>
          </label>
          <div className="flex items-center gap-1.5">
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

        <div className="flex flex-col gap-6 lg:flex-row">
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
