import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TraceOutput, ReasoningRow } from "@/components/session/message/turn-event-rows";
import { CommandResult } from "@/components/session/message/command-result";

export const rawOutput = Array.from(
  { length: 60 },
  (_, index) => `line-${index}: **raw output**`,
).join("\n");
export const thought =
  "**Important** and `inlineCode`\n\n- First step\n- 두 번째 단계\n\n```ts\nconst value = 1;\n```\n\n[Unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>";

export function mountTraceContent() {
  const app = document.getElementById("root");
  if (app) app.hidden = true;
  const host = document.createElement("main");
  host.dataset.traceContentFixture = "";
  document.body.append(host);
  const root = createRoot(host);
  const render = (streaming: boolean, text = thought) =>
    flushSync(() =>
      root.render(
        <>
          <section data-copy-fixture>
            <TraceOutput capped label="Output" text={rawOutput} />
          </section>
          <section data-short-copy-fixture>
            <TraceOutput text="short output" />
          </section>
          <section data-command-copy-fixture>
            <CommandResult command="bun test --timeout 30000" output="done" />
          </section>
          <section data-reasoning-fixture>
            <ReasoningRow isStreaming={streaming} text={text} />
          </section>
        </>,
      ),
    );
  render(true);
  return { settle: () => render(false), append: () => render(true, `${thought}\n\n**Appended**`) };
}
