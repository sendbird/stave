import { useEffect, useMemo, useState } from "react";
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
 * Dev-only preview of the agent trace rendering. Mounted from `src/main.tsx` instead of `<App />` when
 * `?stavePreview=agent-messages` is present, so none of App's workspace
 * bootstrap effects run.
 */

const PREVIEW_TITLE = "Current";
const PREVIEW_NOTE = "Thinking orb · spring rows · capped glide";

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
  message,
  fontSize,
}: {
  message: PreviewMessage;
  fontSize: number;
}) {
  return (
    <section className={sx(a.column)}>
      <header className={sx(a.columnHeader)}>
        <h2 className={sx(a.columnTitle)}>{PREVIEW_TITLE}</h2>
        <p className={sx(a.columnNote)}>{PREVIEW_NOTE}</p>
      </header>
      <div className={sx(a.columnBody)} style={{ fontSize: `${fontSize}px` }}>
        <AssistantMessageBody
          message={message}
          taskId="preview-task"
          messageId="preview-message"
          streamingEnabled
          traceExpansionMode="auto"
        />
      </div>
    </section>
  );
}

export function AgentPreviewApp() {
  const [streaming, setStreaming] = useState(true);
  const [dark, setDark] = useState(true);
  const [fontSize, setFontSize] = useState(18);

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
        </div>

        <PreviewColumn message={message} fontSize={fontSize} />
      </div>
    </div>
  );
}
