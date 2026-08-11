import { useEffect, useState } from "react";
import {
  Bird,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Input, toast } from "@/components/ui";
import {
  type AtelierConnectorPublicStatus,
  type AtelierConnectorScope,
} from "@/lib/atelier-connector/types";
import { DEFAULT_CRANE_CONNECTOR_BASE_URL } from "@/lib/crane-connector/types";
import {
  type MartinSyncPublicStatus,
  type MartinSyncSettings,
} from "@/lib/martin-sync/types";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import {
  SettingsCard,
  SwitchField,
  ToggleChipGroup,
} from "./settings-dialog.shared";

const CONNECTOR_SCOPE_OPTIONS: ReadonlyArray<{
  value: AtelierConnectorScope;
  label: string;
  description: string;
}> = [
  {
    value: "martin",
    label: "Martin",
    description: "Sync linked workspace activity and project context.",
  },
  {
    value: "crane",
    label: "Crane",
    description: "Keep remote job dispatch available with the same connector.",
  },
];

function runtimeLabel(
  state: MartinSyncPublicStatus["runtimeState"] | undefined,
) {
  switch (state) {
    case "idle":
      return "Ready";
    case "syncing":
      return "Syncing";
    case "offline":
      return "Offline";
    case "unauthorized":
      return "Pair again";
    case "error":
      return "Attention needed";
    case "unpaired":
      return "Not paired";
    default:
      return "Disabled";
  }
}

function runtimeBadgeClass(
  state: MartinSyncPublicStatus["runtimeState"] | undefined,
) {
  if (state === "idle" || state === "syncing") {
    return "border-success/30 bg-success/10 text-success";
  }
  if (state === "offline" || state === "unpaired" || state === "disabled") {
    return "border-warning/35 bg-warning/10 text-warning";
  }
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

export function MartinSyncSettingsSection() {
  const martinSync = useAppStore((state) => state.settings.martinSync);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [status, setStatus] = useState<MartinSyncPublicStatus | null>(null);
  const [connector, setConnector] =
    useState<AtelierConnectorPublicStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CRANE_CONNECTOR_BASE_URL);
  const [pairingCode, setPairingCode] = useState("");
  const [connectorName, setConnectorName] = useState("Stave Desktop");
  const [requestedScopes, setRequestedScopes] = useState<
    AtelierConnectorScope[]
  >(["martin", "crane"]);
  const [busy, setBusy] = useState<"pair" | "refresh" | "retry" | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.api?.martinSync
      ?.getStatus?.()
      .then((result) => {
        if (!cancelled && result) setStatus(result.status);
      })
      .catch(() => undefined);
    void window.api?.atelierConnector
      ?.getStatus?.()
      .then((result) => {
        if (cancelled || !result) return;
        setConnector(result.status);
        if (result.status.scopes.length > 0) {
          setRequestedScopes(
            Array.from(
              new Set<AtelierConnectorScope>([
                ...result.status.scopes,
                "martin",
              ]),
            ),
          );
        }
      })
      .catch(() => undefined);

    const unsubscribe =
      window.api?.martinSync?.subscribeStatus?.(setStatus);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const patch = (partial: Partial<MartinSyncSettings>) => {
    updateSettings({
      patch: {
        martinSync: { ...martinSync, ...partial },
      },
    });
  };

  const refreshStatus = async () => {
    setBusy("refresh");
    try {
      const [syncResult, connectorResult] = await Promise.all([
        window.api?.martinSync?.getStatus?.(),
        window.api?.atelierConnector?.getStatus?.(),
      ]);
      if (syncResult) setStatus(syncResult.status);
      if (connectorResult) setConnector(connectorResult.status);
    } catch {
      toast.error("Could not refresh Martin sync status.");
    } finally {
      setBusy(null);
    }
  };

  const toggleScope = (scope: AtelierConnectorScope) => {
    setRequestedScopes((current) => {
      if (current.includes(scope)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== scope);
      }
      return [...current, scope];
    });
  };

  const pair = async () => {
    const pairConnector = window.api?.atelierConnector?.pair;
    if (!pairConnector) {
      toast.error("Atelier connector controls are unavailable.");
      return;
    }
    if (!pairingCode.trim().startsWith("stp_")) {
      toast.error("Paste a valid stp_ pairing code from Atelier.");
      return;
    }

    setBusy("pair");
    try {
      const normalizedBaseUrl = (
        baseUrl.trim() || DEFAULT_CRANE_CONNECTOR_BASE_URL
      ).replace(/\/+$/, "");
      const result = await pairConnector({
        baseUrl: normalizedBaseUrl,
        code: pairingCode.trim(),
        name: connectorName.trim() || "Stave Desktop",
        requestedScopes,
      });
      setConnector(result.status);
      setBaseUrl(normalizedBaseUrl);
      if (!result.ok) {
        toast.error("Could not pair with Atelier", {
          description: result.message,
        });
        return;
      }
      setPairingCode("");
      toast.success("Atelier is paired for Martin sync.");
      const syncResult = await window.api?.martinSync?.getStatus?.();
      if (syncResult) setStatus(syncResult.status);
    } catch {
      toast.error("Could not pair with Atelier.");
    } finally {
      setBusy(null);
    }
  };

  const retryFailed = async () => {
    const retry = window.api?.martinSync?.retryFailed;
    if (!retry) {
      toast.error("Martin sync controls are unavailable.");
      return;
    }
    setBusy("retry");
    try {
      const result = await retry();
      setStatus(result.status);
      if (!result.ok) {
        toast.error("Could not retry failed sync events", {
          description: result.message,
        });
        return;
      }
      toast.success("Failed Martin sync events are queued again.");
    } catch {
      toast.error("Could not retry failed sync events.");
    } finally {
      setBusy(null);
    }
  };

  const hasMartinScope = connector?.scopes.includes("martin") === true;
  const paired = connector?.paired === true;

  return (
    <SettingsCard
      id="settings-field-martin-sync"
      tabIndex={-1}
      title="Martin sync"
      description="Push selected workspace events and resource links to a linked Martin project, and pull its current context back into the workspace."
      titleAccessory={
        <Badge
          variant="outline"
          className={runtimeBadgeClass(status?.runtimeState)}
        >
          {runtimeLabel(status?.runtimeState)}
        </Badge>
      }
    >
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <Bird className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">Atelier connector</h4>
              <Badge variant={paired ? "secondary" : "outline"}>
                {paired ? "Paired" : "Not paired"}
              </Badge>
              {connector?.scopes.map((scope) => (
                <Badge key={scope} variant="outline" className="capitalize">
                  {scope}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {paired
                ? `${connector.connector?.name ?? "This installation"} is paired${
                    connector.connector?.lastSeenAt
                      ? ` · last seen ${formatTaskUpdatedAt({ value: connector.connector.lastSeenAt })}`
                      : ""
                  }.`
                : "Pair this installation with a short-lived code from Atelier."}
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh Martin sync status"
            disabled={busy !== null}
            onClick={() => void refreshStatus()}
          >
            <RefreshCw
              className={busy === "refresh" ? "size-4 animate-spin" : "size-4"}
            />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <h5 className="text-sm font-medium">
              {paired ? "Update connector access" : "Pair this installation"}
            </h5>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              A new pairing replaces the stored connector credential. Keep every
              integration you still use selected below.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label
                htmlFor="settings-martin-base-url"
                className="text-xs font-medium text-muted-foreground"
              >
                Atelier URL
              </label>
              <Input
                id="settings-martin-base-url"
                value={baseUrl}
                disabled={busy !== null}
                onChange={(event) => setBaseUrl(event.target.value)}
                spellCheck={false}
                autoComplete="url"
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="settings-martin-connector-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Connector name
              </label>
              <Input
                id="settings-martin-connector-name"
                value={connectorName}
                disabled={busy !== null}
                onChange={(event) => setConnectorName(event.target.value)}
                maxLength={80}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Connector access
            </span>
            <ToggleChipGroup
              options={CONNECTOR_SCOPE_OPTIONS}
              selected={requestedScopes}
              onToggle={toggleScope}
              aria-label="Atelier connector access"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="One-time Atelier pairing code"
              type="password"
              value={pairingCode}
              disabled={busy !== null}
              onChange={(event) => setPairingCode(event.target.value)}
              placeholder="stp_…"
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              className="sm:max-w-sm"
            />
            <Button
              type="button"
              disabled={
                busy !== null ||
                !pairingCode.trim() ||
                connector?.secureStorageAvailable === false
              }
              onClick={() => void pair()}
            >
              {busy === "pair" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LockKeyhole className="size-4" />
              )}
              {paired ? "Pair again" : "Pair securely"}
            </Button>
          </div>

          {connector && !connector.secureStorageAvailable ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
              OS credential encryption is unavailable. Pairing remains blocked
              until a secure credential store is available.
            </p>
          ) : null}

          {paired && !hasMartinScope ? (
            <p className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              This connector does not have Martin access. Pair again with
              the Martin scope selected before enabling sync.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 border-t border-border/65 pt-5">
        <SwitchField
          title="Enable Martin sync"
          description="Off keeps queued events on this device and stops outbound delivery."
          checked={martinSync.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
        />
        <SwitchField
          title="PR opened events"
          description="Send a factual event when a pull request is opened."
          checked={martinSync.prOpened}
          onCheckedChange={(prOpened) => patch({ prOpened })}
        />
        <SwitchField
          title="Task completed events"
          description="Send a factual event when a task is archived as completed."
          checked={martinSync.taskCompleted}
          onCheckedChange={(taskCompleted) => patch({ taskCompleted })}
        />
        <SwitchField
          title="Resource link mirroring"
          description="Mirror workspace links after changes settle."
          checked={martinSync.resourceLinks}
          onCheckedChange={(resourceLinks) => patch({ resourceLinks })}
        />
        <SwitchField
          title="Turn summaries"
          description="Send model-written work summaries. This interpretive data is off by default."
          checked={martinSync.turnSummaries}
          onCheckedChange={(turnSummaries) => patch({ turnSummaries })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/25 px-4 py-3">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Outbox</span>
          {` · ${status?.pendingCount ?? 0} pending · ${status?.failedCount ?? 0} failed`}
          {status?.lastDeliveredAt
            ? ` · last delivered ${formatTaskUpdatedAt({ value: status.lastDeliveredAt })}`
            : ""}
        </div>
        {(status?.failedCount ?? 0) > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void retryFailed()}
          >
            {busy === "retry" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Retry failed
          </Button>
        ) : null}
      </div>
    </SettingsCard>
  );
}
