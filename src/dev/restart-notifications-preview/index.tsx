import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import { RestartContinuationNotice } from "@/components/layout/RestartContinuationNotice";
import { DesktopNotificationsCard } from "@/components/layout/settings-sections/settings-dialog-desktop-notifications-card";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

const styles = stylex.create({
  page: { padding: vars["--aui-space-24"], minHeight: "100vh", backgroundColor: vars["--aui-color-canvas"], color: vars["--aui-color-text"] },
});

/** Actual settings and startup notice with local, non-executing recovery actions. */
export function RestartNotificationsPreview() {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const initialize = () => {
    const params = new URLSearchParams(location.search);
    Object.defineProperty(window, "api", { configurable: true, value: { ...window.api, platform: params.get("platform") ?? "darwin" } });
    applyAppLocale(params.get("lang") === "ko" ? "ko" : "en");
    applyThemeClass({ enabled: params.get("theme") === "dark" });
    const dismiss = ({ taskId }: { taskId?: string } = {}) => { useAppStore.setState(state => ({ interruptedTasks: taskId ? state.interruptedTasks.filter(task => task.taskId !== taskId) : [] })); };
    useAppStore.setState({
      interruptedTasks: [
        { taskId: "one", workspaceId: "workspace", title: params.get("lang") === "ko" ? "중단된 변경 사항을 확인하고 검증하기" : "Check interrupted changes and finish verification", providerId: "codex", turnId: "turn-one" },
        { taskId: "two", workspaceId: "workspace", title: params.get("lang") === "ko" ? "긴 작업 이름이 좁은 화면에서도 버튼을 밀어내지 않고 여러 줄로 표시되는지 확인하기" : "Confirm that a longer interrupted task title wraps without pushing its Continue button outside the notice", providerId: "claude-code", turnId: "turn-two" },
      ],
      continueInterruptedTask: async ({ taskId }) => dismiss({ taskId }),
      dismissInterruptedTasks: dismiss,
    });
    setReady(true);
    };
    if (useAppStore.persist.hasHydrated()) initialize();
    else return useAppStore.persist.onFinishHydration(initialize);
  }, []);
  return ready ? <div className={sx(styles.page)}><DesktopNotificationsCard /><RestartContinuationNotice /></div> : null;
}
