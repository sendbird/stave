import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useEffect, useState } from "react";
import {
  Bird,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Input, Loader, toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
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
import { martinSyncStyles as styles } from "./settings-dialog-martin-sync.styles";

const CONNECTOR_SCOPE_OPTIONS: ReadonlyArray<{
  value: AtelierConnectorScope;
  label: string;
  description: string;
}> = [
  {
    value: "martin",
    label: "Martin",
    get description() { return i18n.t("settingsConnections:settingsDialogMartinSync.syncLinkedWorkspaceActivityAndProject"); },
  },
  {
    value: "crane",
    label: "Crane",
    get description() { return i18n.t("settingsConnections:settingsDialogMartinSync.keepRemoteJobDispatchAvailableWith"); },
  },
];

function runtimeLabel(
  state: MartinSyncPublicStatus["runtimeState"] | undefined,
) {
  switch (state) {
    case "idle":
      return i18n.t("common:status.ready");
    case "syncing":
      return i18n.t("settingsConnections:settingsDialogMartinSync.syncing");
    case "offline":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.offline");
    case "unauthorized":
      return i18n.t("settingsConnections:settingsDialogMartinSync.pairAgain");
    case "error":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.attentionNeeded");
    case "unpaired":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.notPaired");
    default:
      return i18n.t("common:status.disabled");
  }
}

function runtimeBadgeStyle(
  state: MartinSyncPublicStatus["runtimeState"] | undefined,
) {
  if (state === "idle" || state === "syncing") {
    return styles.badgeReady;
  }
  if (state === "offline" || state === "unpaired" || state === "disabled") {
    return styles.badgeIdle;
  }
  return styles.badgeAttention;
}

export function MartinSyncSettingsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
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

    const unsubscribe = window.api?.martinSync?.subscribeStatus?.(setStatus);
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
      toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.couldNotRefreshMartinSyncStatus"));
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
      toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.atelierConnectorControlsAreUnavailable"));
      return;
    }
    if (!pairingCode.trim().startsWith("stp_")) {
      toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.pasteAValidStpPairingCode"));
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
        toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.couldNotPairWithAtelier"), {
          description: result.message,
        });
        return;
      }
      setPairingCode("");
      toast.success(i18n.t("settingsConnections:settingsDialogMartinSync.atelierIsPairedForMartinSync"));
      const syncResult = await window.api?.martinSync?.getStatus?.();
      if (syncResult) setStatus(syncResult.status);
    } catch {
      toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.couldNotPairWithAtelierVariantc6ffc372"));
    } finally {
      setBusy(null);
    }
  };

  const retryFailed = async () => {
    const retry = window.api?.martinSync?.retryFailed;
    if (!retry) {
      toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.martinSyncControlsAreUnavailable"));
      return;
    }
    setBusy("retry");
    try {
      const result = await retry();
      setStatus(result.status);
      if (!result.ok) {
        toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.couldNotRetryFailedSyncEvents"), {
          description: result.message,
        });
        return;
      }
      toast.success(i18n.t("settingsConnections:settingsDialogMartinSync.failedMartinSyncEventsAreQueued"));
    } catch {
      toast.error(i18n.t("settingsConnections:settingsDialogMartinSync.couldNotRetryFailedSyncEventsVariantb37a20ef"));
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
      title={t("settings:sections.fields.martinSync.title")}
      description={t("settingsConnections:settingsDialogMartinSync.pushSelectedWorkspaceEventsAndResource")}
      titleAccessory={
        <Badge
          variant="outline"
          className={sx(runtimeBadgeStyle(status?.runtimeState))}
        >
          {runtimeLabel(status?.runtimeState)}
        </Badge>
      }
    >
      <div className={sx(styles.panel)}>
        <div className={sx(styles.panelHeader)}>
          <span className={sx(styles.headerMark)}>
            <Bird className={sx(styles.headerMarkIcon)} />
          </span>
          <div className={sx(styles.headerBody)}>
            <div className={sx(styles.headerTitleLine)}>
              <h4 className={sx(styles.headerTitle)}>{t("settingsConnections:settingsDialogMartinSync.atelierConnector")}</h4>
              <Badge variant={paired ? "secondary" : "outline"}>
                {paired ? t("settingsConnections:settingsDialogMartinSync.paired") : t("settingsConnections:settingsDialogCraneConnector.notPaired")}
              </Badge>
              {connector?.scopes.map((scope) => (
                <Badge
                  key={scope}
                  variant="outline"
                  className={sx(styles.scopeBadge)}
                >
                  {scope}
                </Badge>
              ))}
            </div>
            <p className={sx(styles.headerDescription)}>
              {paired
                ? t(connector.connector?.lastSeenAt ? "settingsConnections:messages.connectorPairedLastSeen" : "settingsConnections:messages.connectorPaired", { name: connector.connector?.name ?? t("settingsConnections:messages.thisInstallation"), time: connector.connector?.lastSeenAt ? formatTaskUpdatedAt({ value: connector.connector.lastSeenAt }) : "" })
                : t("settingsConnections:settingsDialogMartinSync.pairThisInstallationWithAShort")}
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("settingsConnections:settingsDialogMartinSync.refreshMartinSyncStatus")}
            disabled={busy !== null}
            onClick={() => void refreshStatus()}
          >
            <RefreshCw
              className={sx(
                styles.refreshIcon,
                busy === "refresh" && styles.refreshIconSpinning,
              )}
            />
          </Button>
        </div>

        <div className={sx(styles.panelBody)}>
          <div>
            <h5 className={sx(styles.sectionTitle)}>
              {paired ? t("settingsConnections:settingsDialogMartinSync.updateConnectorAccess") : t("settingsConnections:settingsDialogCraneConnector.pairThisInstallation")}
            </h5>
            <p className={sx(styles.sectionDescription)}>
              {t("settingsConnections:settingsDialogMartinSync.aNewPairingReplacesTheStored")}</p>
          </div>

          <div className={sx(styles.fieldGrid)}>
            <div className={sx(styles.field)}>
              <label
                htmlFor="settings-martin-base-url"
                className={sx(styles.fieldLabel)}
              >
                {t("settingsConnections:settingsDialogMartinSync.atelierURL")}</label>
              <Input
                id="settings-martin-base-url"
                value={baseUrl}
                disabled={busy !== null}
                onChange={(event) => setBaseUrl(event.target.value)}
                spellCheck={false}
                autoComplete="url"
              />
            </div>
            <div className={sx(styles.field)}>
              <label
                htmlFor="settings-martin-connector-name"
                className={sx(styles.fieldLabel)}
              >
                {t("settingsConnections:settingsDialogCraneConnector.connectorName")}</label>
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

          <div className={sx(styles.field)}>
            <span className={sx(styles.scopeLabel)}>{t("settingsConnections:settingsDialogMartinSync.connectorAccess")}</span>
            <ToggleChipGroup
              options={CONNECTOR_SCOPE_OPTIONS}
              selected={requestedScopes}
              onToggle={toggleScope}
              aria-label={t("settingsConnections:settingsDialogMartinSync.atelierConnectorAccess")}
            />
          </div>

          <div className={sx(styles.pairRow)}>
            <Input
              aria-label={t("settingsConnections:settingsDialogMartinSync.oneTimeAtelierPairingCode")}
              type="password"
              value={pairingCode}
              disabled={busy !== null}
              onChange={(event) => setPairingCode(event.target.value)}
              placeholder="stp_…"
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              className={sx(styles.pairInput)}
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
                <Loader aria-hidden size="xs" variant="sync" />
              ) : (
                <LockKeyhole className={sx(styles.pairIcon)} />
              )}
              {paired ? t("settingsConnections:settingsDialogMartinSync.pairAgain") : t("settingsConnections:settingsDialogCraneConnector.pairSecurely")}
            </Button>
          </div>

          {connector && !connector.secureStorageAvailable ? (
            <p className={sx(styles.warning)}>
              {t("settingsConnections:settingsDialogCraneConnector.osCredentialEncryptionIsUnavailablePairing")}</p>
          ) : null}

          {paired && !hasMartinScope ? (
            <p className={sx(styles.scopeWarning)}>
              {t("settingsConnections:settingsDialogMartinSync.thisConnectorDoesNotHaveMartin")}</p>
          ) : null}
        </div>
      </div>

      <div className={sx(styles.toggles)}>
        <SwitchField
          title={t("settingsConnections:settingsDialogMartinSync.enableMartinSync")}
          description={t("settingsConnections:settingsDialogMartinSync.offKeepsQueuedEventsOnThis")}
          checked={martinSync.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
        />
        <SwitchField
          title={t("settingsConnections:settingsDialogMartinSync.prOpenedEvents")}
          description={t("settingsConnections:settingsDialogMartinSync.sendAFactualEventWhenA")}
          checked={martinSync.prOpened}
          onCheckedChange={(prOpened) => patch({ prOpened })}
        />
        <SwitchField
          title={t("settingsConnections:settingsDialogMartinSync.taskCompletedEvents")}
          description={t("settingsConnections:settingsDialogMartinSync.sendAFactualEventWhenAVariant16b16a6a")}
          checked={martinSync.taskCompleted}
          onCheckedChange={(taskCompleted) => patch({ taskCompleted })}
        />
        <SwitchField
          title={t("settingsConnections:settingsDialogMartinSync.resourceLinkMirroring")}
          description={t("settingsConnections:settingsDialogMartinSync.mirrorWorkspaceLinksAfterChangesSettle")}
          checked={martinSync.resourceLinks}
          onCheckedChange={(resourceLinks) => patch({ resourceLinks })}
        />
        <SwitchField
          title={t("settingsConnections:settingsDialogMartinSync.turnSummaries")}
          description={t("settingsConnections:settingsDialogMartinSync.sendModelWrittenWorkSummariesThis")}
          checked={martinSync.turnSummaries}
          onCheckedChange={(turnSummaries) => patch({ turnSummaries })}
        />
      </div>

      <div className={sx(styles.outbox)}>
        <ShieldCheck className={sx(styles.outboxIcon)} />
        <div className={sx(styles.outboxText)}>
          <span className={sx(styles.outboxStrong)}>{t("settingsConnections:settingsDialogMartinSync.outbox")}</span>
          {t("settingsConnections:settingsDialogMartinSync.pendingFailed", { value1: status?.pendingCount ?? 0, value2: status?.failedCount ?? 0 })}
          {status?.lastDeliveredAt
            ? t("settingsConnections:settingsDialogMartinSync.lastDelivered", { value1: formatTaskUpdatedAt({ value: status.lastDeliveredAt }) })
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
              <Loader aria-hidden size="xs" variant="sync" />
            ) : (
              <RotateCcw className={sx(styles.retryIcon)} />
            )}
            {t("settingsConnections:settingsDialogMartinSync.retryFailed")}</Button>
        ) : null}
      </div>
    </SettingsCard>
  );
}
