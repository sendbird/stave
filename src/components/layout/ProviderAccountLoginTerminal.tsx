import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { useCliTerminalInstance } from "./useCliTerminalInstance";
import { useAppStore } from "@/store/app.store";
import { sx } from "@/components/ads/utils/stylex";
import { accountStyles as styles } from "./provider-accounts.styles";

/** Login output is never persisted as a terminal transcript or copied into app state. */
export function ProviderAccountLoginTerminal({ sessionId }: { sessionId: string }) {
  useTranslation("settingsConnections");
  const containerRef = useRef<HTMLDivElement>(null);
  const isDarkMode = useAppStore(s => s.isDarkMode);
  const [error, setError] = useState<string | null>(null);
  const { controller, ready } = useCliTerminalInstance({
    containerRef, instanceKey: sessionId, enabled: true, visible: true, restartToken: 0,
    fontFamily: "monospace", fontSize: 13, isDarkMode,
    onData: input => { void window.api?.terminal?.writeSession?.({ sessionId, input }); },
    onResize: (cols, rows) => { void window.api?.terminal?.resizeSession?.({ sessionId, cols, rows }); },
  });
  useEffect(() => {
    if (!ready) return;
    const terminal = window.api?.terminal;
    let cancelled = false;
    let attachmentId: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const detach = () => { if (attachmentId) void terminal?.detachSession?.({ sessionId, attachmentId }); };
    async function poll() {
      try {
        const result = await terminal?.readSession?.({ sessionId });
        if (cancelled) return;
        if (!result?.ok) { setError(result?.stderr ?? i18n.t("settingsConnections:messages.loginTerminalDisconnected")); return; }
        if (result.output) controller.write(result.output);
        timer = setTimeout(poll, 150);
      } catch (error) { if (!cancelled) setError(String(error)); }
    }
    void terminal?.attachSession?.({ sessionId, deliveryMode: "poll" }).then(result => {
      attachmentId = result.attachmentId;
      if (cancelled) { detach(); return; }
      if (!result.ok) { setError(result.stderr ?? i18n.t("settingsConnections:messages.loginTerminalAttachFailed")); return; }
      if (result.backlog) controller.write(result.backlog);
      controller.focus();
      void poll();
    }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; clearTimeout(timer); detach(); };
  }, [sessionId, ready, controller]);
  return <div><div ref={containerRef} className={sx(styles.terminal)} />{error && <p role="status" className={sx(styles.muted)}>{error}</p>}</div>;
}
