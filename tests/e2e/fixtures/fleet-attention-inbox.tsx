import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { FleetAttentionInbox } from "@/components/layout/FleetAttentionInbox";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { useAppStore } from "@/store/app.store";
import "@/components/ads/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
applyAppLocale(params.get("locale") === "ko" ? "ko" : "en");
useAppStore.persist.setOptions({ name: "fleet-attention-inbox-focus-fixture" });

function need(id: string, kind: FleetAttentionItem["kind"], title: string): FleetAttentionItem {
  return {
    id,
    kind,
    priority: 0,
    repositoryPath: "/tmp/fleet-focus-fixture",
    repositoryName: "fixture",
    workspaceId: "ws-fixture",
    workspaceName: "deploy",
    taskId: `task-${id}`,
    taskTitle: title,
    ...(kind === "approval" ? { requestId: `request-${id}` } : {}),
    notificationId: `notification-${id}`,
    createdAt: "2026-11-03T00:00:00.000Z",
    source: "notification",
  };
}

const NEEDS = [
  need("one", "approval", "Ship the release"),
  need("two", "run-failed", "Tune the search index"),
  need("three", "approval", "Rotate the deploy key"),
];

/**
 * The inbox with the write each row action makes: the row turns busy, and a
 * beat later the row leaves, as a persistence round trip does in the app.
 */
function Fixture() {
  const [items, setItems] = useState(NEEDS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const leave = useCallback((target: FleetAttentionItem) => {
    setBusyId(target.id);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== target.id));
      setBusyId(null);
    }, 80);
  }, []);
  const noop = () => {};
  return (
    <StaveDesignProvider>
      <main>
        <FleetAttentionInbox
          items={items}
          selectedAttentionId={null}
          busyAttentionId={busyId}
          onOpen={noop}
          onOpenTask={noop}
          onMarkRead={leave}
          onDismiss={leave}
          onSnooze={leave}
          onOpenPr={noop}
          onClearReview={noop}
          onRestoreSnoozed={noop}
          onClearSelection={noop}
        />
      </main>
    </StaveDesignProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
