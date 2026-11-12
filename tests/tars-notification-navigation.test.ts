import { afterEach, expect, test } from "bun:test";
import { describeTarsNotifications } from "@/lib/tars/notifications";
import { useAppStore } from "@/store/app.store";
import { clearTarsNotificationFocus, requestTarsNotificationFocus, useTarsNotificationFocusStore } from "@/store/tars-notification-focus-store";
import { tarsResponsibility, TARS_AT } from "./fixtures/tars-host-bridge";

const original = useAppStore.getState();
afterEach(() => {
  useAppStore.setState(original, true);
  useTarsNotificationFocusStore.setState({ request: null });
});

test("opening a notification enters global Tars on its saved decision without switching repositories or tasks", async () => {
  const draft = describeTarsNotifications({ identity: { id: "personal", name: "Tars", instructions: "", updatedAt: TARS_AT },
    responsibilities: [tarsResponsibility({ state: "paused" })], runtime: "desktop", pendingDecisions: [
      { kind: "ask", responsibilityId: "goal", messageId: "message-1", actionIndex: 0, operation: null, expectedRevision: 4,
        proposedAt: TARS_AT, question: "Continue?" },
    ] })[0]!;
  const reads: string[] = [];
  useAppStore.setState({ notifications: [{ ...draft, createdAt: TARS_AT, readAt: null }], activeAppSurface: { kind: "workspace" },
    repositoryPath: "/tmp/another-repo", activeWorkspaceId: "another-workspace",
    openRepository: async () => { throw new Error("must not switch repository"); },
    switchWorkspace: async () => { throw new Error("must not switch workspace"); },
    markNotificationRead: async ({ id }) => { reads.push(id); },
  });
  await useAppStore.getState().openNotificationContext({ notificationId: draft.id, targetSurface: "task" });
  expect(useAppStore.getState().activeAppSurface.kind).toBe("tars");
  expect(useTarsNotificationFocusStore.getState().request).toMatchObject({ responsibilityId: "goal", decisionId: "ask:message-1:0" });
  expect(reads).toEqual([draft.id]);
  expect(useAppStore.getState().activeWorkspaceId).toBe("another-workspace");
});

test("a later focus request cannot be consumed by an older card opening", () => {
  requestTarsNotificationFocus({ responsibilityId: "first", decisionId: "ask:first:0" });
  const first = useTarsNotificationFocusStore.getState().request!;
  requestTarsNotificationFocus({ responsibilityId: "second" });
  clearTarsNotificationFocus(first.id);
  expect(useTarsNotificationFocusStore.getState().request).toMatchObject({ responsibilityId: "second" });
  clearTarsNotificationFocus(useTarsNotificationFocusStore.getState().request!.id);
  expect(useTarsNotificationFocusStore.getState().request).toBeNull();
});
