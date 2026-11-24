import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useState } from "react";
import { TopBarNotifications } from "@/components/layout/TopBarNotifications";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { applyAppLocale } from "@/i18n";
import { collectFleetNotificationAttentionItems } from "@/lib/fleet/attention-projection";
import { buildFleetInbox } from "@/lib/fleet/inbox-model";
import type { AppNotification } from "@/lib/notifications/notification.types";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import { EMPTY_FLEET_ATTENTION, publishFleetAttention } from "@/store/fleet-attention-store";
import type { ApprovalPart, ChatMessage, Task, UserInputPart } from "@/types/chat";

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    minHeight: "100vh",
    padding: vars["--aui-space-16"],
  },
});

const workspaceId = "bell-preview";
const repositoryPath = "/tmp/bell-preview";

function makeFixtures(ko: boolean) {
  const question = ko ? "어떤 형식으로 내보낼까요?" : "Which format should I export?";
  const short: UserInputPart = {
    type: "user_input", requestId: "short", toolName: "AskUserQuestion", state: "input-requested",
    questions: [{ question, key: "format", header: ko ? "형식" : "Format", options: [{ label: "JSON", value: "json", description: "" }, { label: "CSV", description: "" }] }],
  };
  const long: UserInputPart = {
    ...short, requestId: "long",
    questions: [{
      ...short.questions[0]!,
      question: ko
        ? "내보낸 데이터의 형식을 선택하기 전에 다운스트림 소비자와의 호환성, 다양한 날짜 표기 방식, 열 이름의 번역, 기존 자동화에서 사용하는 구분 기호를 모두 검토해 주세요. 이 조건을 모두 고려하면 어떤 형식이 적합할까요?"
        : "Before selecting an export format, consider compatibility with downstream consumers, date formatting across locales, translation of column names, and the delimiters used by existing automation. Which format fits all of those requirements?",
    }],
  };
  const approval: ApprovalPart = {
    type: "approval", requestId: "approval", toolName: "Read",
    description: ko ? "프로젝트 설정 읽기" : "Read project settings", state: "approval-requested",
    supportsAllowAlways: true,
  };
  // Flagged as risky, so the row cannot offer Allow once: Deny and Open task only.
  const risky: ApprovalPart = {
    type: "approval", requestId: "risky", toolName: "Bash",
    description: ko ? "릴리스 노트 내려받기" : "Download the release notes",
    input: JSON.stringify({ command: "curl -sSL https://example.com/notes" }),
    risk: "network-access", state: "approval-requested",
  };
  const fixtures = [
    { id: "short", title: ko ? "데이터 내보내기" : "Export data", part: short },
    { id: "long", title: ko ? "내보내기 설정 검토" : "Review export requirements", part: long },
    { id: "approval", title: ko ? "설정 확인" : "Check settings", part: approval },
    { id: "stale", title: ko ? "종료된 작업" : "Ended task", part: { ...approval, requestId: "stale" } },
    { id: "risky", title: ko ? "릴리스 확인" : "Check release", part: risky },
  ];
  const tasks: Task[] = fixtures.map(({ id, title }) => ({
    id, title, updatedAt: new Date().toISOString(), unread: false,
    provider: id === "short" ? "codex" : "claude-code", controlOwner: "stave", controlMode: "interactive",
  }));
  const notifications: AppNotification[] = fixtures.map(({ id, title, part }, index) => ({
    id, title, taskTitle: title, taskId: id, workspaceId, repositoryPath,
    workspaceName: "main", repositoryName: "Export", readAt: null,
    providerId: id === "short" ? "codex" : "claude-code",
    turnId: `turn-${id}`, createdAt: new Date(Date.now() - index * 60_000).toISOString(),
    kind: part.type === "approval" ? "task.approval_requested" : "task.user_input_requested",
    body: part.type === "approval" ? part.description : part.questions[0]!.question,
    action: part.type === "approval" ? { type: "approval", requestId: id, messageId: id } : null,
    payload: { requestId: id, messageId: id },
  }));
  const messagesByTask: Record<string, ChatMessage[]> = Object.fromEntries(fixtures.map(({ id, part }) => [id, [{
    id, role: "assistant", model: "preview", providerId: id === "short" ? "codex" : "claude-code",
    content: "", turnId: `turn-${id}`, parts: [part],
  }]]));
  return { tasks, notifications, messagesByTask };
}

export function BellAnswersPreview() {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const initialize = () => {
      const params = new URLSearchParams(location.search);
      const ko = params.get("lang") === "ko";
      applyAppLocale(ko ? "ko" : "en");
      applyThemeClass({ enabled: params.get("theme") === "dark" });
      const fixtures = makeFixtures(ko);
      Object.defineProperty(window, "api", { configurable: true, value: {
        ...window.api,
        provider: {
          respondApproval: async () => ({ ok: true }),
          respondUserInput: async () => ({ ok: params.get("delivery") !== "fail" }),
        },
        persistence: {
          markNotificationRead: async ({ id, readAt, resolvedAt }: { id: string; readAt: string; resolvedAt?: string }) => ({
            ok: true,
            notification: { ...fixtures.notifications.find((row) => row.id === id), readAt, resolvedAt },
          }),
        },
      } });
      useAppStore.setState((state) => ({
        ...fixtures, activeWorkspaceId: workspaceId, repositoryPath,
        hasHydratedWorkspaces: true, workspaces: [{ id: workspaceId, name: "main", updatedAt: new Date().toISOString() }],
        activeTurnIdsByTask: { short: "turn-short", long: "turn-long", approval: "turn-approval", risky: "turn-risky" },
        notificationsLoad: { status: "ready" },
        openNotificationContext: async ({ notificationId }) => {
          useAppStore.setState({ activeTaskId: notificationId });
          return { status: "opened" };
        },
        activeTaskId: "",
        settings: { ...state.settings, notificationActionsEnabled: params.get("actions") !== "off",
          uiDensity: params.get("density") === "compact" ? "compact" : "regular" },
      }));
      const publish = () => {
        const { notifications } = useAppStore.getState();
        const items = collectFleetNotificationAttentionItems(notifications);
        publishFleetAttention({
          ...EMPTY_FLEET_ATTENTION, items,
          inbox: buildFleetInbox({ items, notifications }),
          needsYouTaskCount: items.length,
        });
      };
      publish();
      unsubscribe = useAppStore.subscribe((state, previous) => {
        if (state.notifications !== previous.notifications) publish();
      });
      setReady(true);
    };
    const cancel = useAppStore.persist.hasHydrated() ? (initialize(), undefined) : useAppStore.persist.onFinishHydration(initialize);
    return () => { cancel?.(); unsubscribe?.(); };
  }, []);
  return ready ? <div className={sx(styles.page)}><OpenedTask /><TopBarNotifications noDragStyle={{}} /></div> : null;
}

function OpenedTask() {
  const taskId = useAppStore((state) => state.activeTaskId);
  return <output data-testid="opened-task">{taskId}</output>;
}
