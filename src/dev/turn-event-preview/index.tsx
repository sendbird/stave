import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { AgentStyleProvider } from "@/components/ai-elements/agent-style-context";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import { createEventSamples } from "./fixtures";

export function TurnEventPreview() {
  const [samples, setSamples] = useState(createEventSamples);
  const [dark, setDark] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const expand = () => {
    root.current
      ?.querySelectorAll<HTMLButtonElement>(
        'button[aria-expanded="false"]:not([aria-haspopup])',
      )
      .forEach((button) => button.click());
  };
  useEffect(() => {
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: dark });
  }, [dark]);
  useEffect(() => {
    const original = useAppStore.getState();
    // This isolated dev entrypoint keeps decision clicks inside its fixtures.
    useAppStore.setState({
      resolveApproval: ({ requestId, approved }) =>
        setSamples((rows) =>
          rows.map((row) => ({
            ...row,
            parts: row.parts.map((part) =>
              part.type === "approval" && part.requestId === requestId
                ? {
                    ...part,
                    state: approved ? "approval-responded" : "output-denied",
                  }
                : part,
            ),
          })),
        ),
      resolveUserInput: ({ requestId, answers, denied }) =>
        setSamples((rows) =>
          rows.map((row) => ({
            ...row,
            parts: row.parts.map((part) =>
              part.type === "user_input" && part.requestId === requestId
                ? {
                    ...part,
                    answers,
                    state: denied ? "input-denied" : "input-responded",
                  }
                : part,
            ),
          })),
        ),
    });
    return () => {
      useAppStore.setState({
        resolveApproval: original.resolveApproval,
        resolveUserInput: original.resolveUserInput,
      });
    };
  }, []);
  useEffect(() => {
    const timers = [100, 350, 700].map((delay) => setTimeout(expand, delay));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className={sx(styles.page)}>
      <header className={sx(styles.header)}>
        <h1 className={sx(styles.title)}>Turn events · 현재 구현</h1>
        <Button variant="quiet" onClick={() => setDark((value) => !value)}>
          {dark ? "Dark" : "Light"}
        </Button>
        <Button variant="quiet" onClick={expand}>
          모두 펼치기
        </Button>
        <Button
          variant="quiet"
          onClick={() => setSamples(createEventSamples())}
        >
          상태 초기화
        </Button>
        <p className={sx(styles.note)}>
          번호로 수정할 부분을 지정하세요. 실제 채팅 렌더러를 사용하며
          승인·답변은 이 예시 안에서만 변경됩니다.
        </p>
      </header>
      <div ref={root} className={sx(styles.list)}>
        <AgentStyleProvider style="beui" phraseVariant="cascade">
          {samples.map((sample, index) => (
            <section
              key={sample.title}
              id={`event-${index + 1}`}
              className={sx(styles.section)}
            >
              <h2 className={sx(styles.label)}>
                {String(index + 1).padStart(2, "0")} · {sample.title}
              </h2>
              <div className={sx(styles.body)}>
                <AssistantMessageBody
                  taskId="turn-event-preview"
                  messageId={`event-${index}`}
                  streamingEnabled
                  traceExpansionMode="manual"
                  showInterimMessages
                  message={{
                    role: "assistant",
                    content: "",
                    parts: sample.parts,
                    isStreaming: sample.streaming ?? false,
                  }}
                />
              </div>
            </section>
          ))}
        </AgentStyleProvider>
      </div>
    </div>
  );
}
const styles = stylex.create({
  page: {
    backgroundColor: vars.colorCanvas,
    color: vars.colorText,
    minHeight: "100vh",
    padding: vars.space24,
  },
  header: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: vars.space12,
    marginInline: "auto",
    maxWidth: "60rem",
    marginBottom: vars.space24,
  },
  title: { fontSize: vars.fontSizeLead, fontWeight: vars.fontWeightSemibold },
  note: {
    flexBasis: "100%",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space32,
    maxWidth: "60rem",
    marginInline: "auto",
  },
  section: { minWidth: 0, scrollMarginTop: vars.space24 },
  label: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
    fontWeight: vars.fontWeightSemibold,
    paddingBottom: vars.space8,
    borderBottom: `1px solid ${vars.colorBorderSubtle}`,
    marginBottom: vars.space16,
  },
  body: { fontSize: vars.fontSizeBody, minWidth: 0 },
});
