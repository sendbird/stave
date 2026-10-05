import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Cable,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Loader,
  toast,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  setCraneConnectorClientStatus,
  useCraneConnectorClientState,
} from "@/lib/crane-connector/client-state";
import {
  buildCraneConnectorSettingsUrl,
  STAVE_CRANE_CONNECTOR_GUIDE_URL,
} from "@/lib/crane-connector/links";
import { DEFAULT_CRANE_CONNECTOR_BASE_URL } from "@/lib/crane-connector/types";
import { useAppStore } from "@/store/app.store";
import { craneConnectorStyles as styles } from "./settings-dialog-crane-connector.styles";

function statusLabel(state: string | undefined) {
  switch (state) {
    case "connected":
      return i18n.t("settingsProviders:mcpSection.stats.connected");
    case "awaiting_local_approval":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.needsLocalApproval");
    case "running":
      return i18n.t("common:status.running");
    case "connecting":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.connecting");
    case "offline":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.offline");
    case "error":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.attentionNeeded");
    case "unpaired":
      return i18n.t("settingsConnections:settingsDialogCraneConnector.notPaired");
    default:
      return i18n.t("common:status.disabled");
  }
}

export function CraneConnectorSettingsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const connector = useAppStore((state) => state.settings.craneConnector);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const registeredRepositories = useAppStore((state) => state.recentRepositories);
  const registeredRepositoryCount = registeredRepositories.length;
  const { status } = useCraneConnectorClientState();
  const [baseUrl, setBaseUrl] = useState(connector.baseUrl);
  const [pairingCode, setPairingCode] = useState("");
  const [connectorName, setConnectorName] = useState("Stave Desktop");
  const [busy, setBusy] = useState<"pair" | "disconnect" | "refresh" | null>(
    null,
  );

  useEffect(() => {
    setBaseUrl(connector.baseUrl);
  }, [connector.baseUrl]);

  useEffect(() => {
    let cancelled = false;
    void window.api?.craneConnector
      ?.getStatus?.()
      .then((result) => {
        if (!cancelled && result) {
          setCraneConnectorClientStatus(result.status);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConnector = (patch: Partial<typeof connector>) => {
    updateSettings({
      patch: {
        craneConnector: {
          ...connector,
          ...patch,
        },
      },
    });
  };

  const refreshStatus = async () => {
    setBusy("refresh");
    try {
      const result = await window.api?.craneConnector?.getStatus?.();
      if (result) {
        setCraneConnectorClientStatus(result.status);
      }
    } catch {
      toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotRefreshTheCraneConnector"));
    } finally {
      setBusy(null);
    }
  };

  const pair = async () => {
    const pairConnector = window.api?.craneConnector?.pair;
    if (!pairConnector) {
      toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.craneConnectorControlsAreUnavailable"));
      return;
    }
    if (!pairingCode.trim()) {
      toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.pasteTheOneTimePairingCode"));
      return;
    }
    setBusy("pair");
    try {
      const result = await pairConnector({
        baseUrl: baseUrl.trim(),
        code: pairingCode.trim(),
        name: connectorName.trim() || "Stave Desktop",
      });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok) {
        toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotPairWithCrane"), {
          description: result.message,
        });
        return;
      }
      setPairingCode("");
      saveConnector({
        enabled: true,
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      });
      toast.success(i18n.t("settingsConnections:settingsDialogCraneConnector.craneIsPairedWithThisStave"));
    } catch {
      toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotPairWithCraneVariantae865285"));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    const disconnectConnector = window.api?.craneConnector?.disconnect;
    if (!disconnectConnector) {
      return;
    }
    setBusy("disconnect");
    try {
      const result = await disconnectConnector();
      setCraneConnectorClientStatus(result.status);
      saveConnector({ enabled: false });
      if (result.ok) {
        toast.success(i18n.t("settingsConnections:settingsDialogCraneConnector.craneConnectorDisconnected"));
      } else {
        toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotFullyDisconnectTheCrane"), {
          description: result.message,
        });
      }
    } catch {
      toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotDisconnectTheCraneConnector"));
    } finally {
      setBusy(null);
    }
  };

  const paired = status?.paired === true;
  const enabled = connector.enabled;

  return (
    <div className={sx(styles.root)}>
      <div
        id="settings-field-crane-connector"
        tabIndex={-1}
        className={sx(styles.card)}
      >
        <div className={sx(styles.header)}>
          <span className={sx(styles.headerMark)}>
            <Cable className={sx(styles.headerMarkIcon)} />
          </span>
          <div className={sx(styles.headerBody)}>
            <div className={sx(styles.headerTitleLine)}>
              <h3 className={sx(styles.headerTitle)}>{t("settings:sections.fields.craneConnector.title")}</h3>
              <Badge variant="outline">
                {statusLabel(status?.runtimeState)}
              </Badge>
            </div>
            <p className={sx(styles.headerDescription)}>
              {t("settingsConnections:settingsDialogCraneConnector.pollYourOwnCraneAccountOver")}</p>
            <Button
              type="button"
              size="xs"
              variant="link"
              className={sx(styles.guideButton)}
              onClick={() => {
                void window.api?.shell
                  ?.openExternal?.({
                    url: STAVE_CRANE_CONNECTOR_GUIDE_URL,
                  })
                  .catch(() => {
                    toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotOpenTheCraneConnector"));
                  });
              }}
            >
              <BookOpen className={sx(styles.guideIcon)} />
              {t("settingsConnections:settingsDialogCraneConnector.readSetupGuide")}</Button>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("settingsConnections:settingsDialogCraneConnector.refreshCraneConnectorStatus")}
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

        <div className={sx(styles.body)}>
          <div className={sx(styles.enableRow)}>
            <div>
              <label
                htmlFor="settings-crane-enabled"
                className={sx(styles.enableLabel)}
              >
                {t("settingsConnections:settingsDialogCraneConnector.enableOutboundPolling")}</label>
              <p className={sx(styles.enableHint)}>
                {t("settingsConnections:settingsDialogCraneConnector.offMeansNoConnectorTimerOr")}</p>
            </div>
            <Switch
              id="settings-crane-enabled"
              aria-label={t("settingsConnections:settingsDialogCraneConnector.enableOutboundPolling")}
              checked={enabled}
              disabled={busy !== null}
              onCheckedChange={(checked) => saveConnector({ enabled: checked })}
            />
          </div>

          <div className={sx(styles.field)}>
            <label
              htmlFor="settings-crane-base-url"
              className={sx(styles.fieldLabel)}
            >
              {t("settingsConnections:settingsDialogCraneConnector.craneURL")}</label>
            <div className={sx(styles.urlRow)}>
              <Input
                id="settings-crane-base-url"
                value={baseUrl}
                disabled={paired || busy !== null}
                onChange={(event) => setBaseUrl(event.target.value)}
                onBlur={() => {
                  const normalized =
                    baseUrl.trim() || DEFAULT_CRANE_CONNECTOR_BASE_URL;
                  setBaseUrl(normalized);
                  saveConnector({ baseUrl: normalized });
                }}
                spellCheck={false}
                autoComplete="url"
              />
              <Button
                type="button"
                variant="outline"
                aria-label={t("settingsConnections:settingsDialogCraneConnector.openCraneConnectorPage")}
                onClick={() => {
                  const url =
                    baseUrl.trim() || DEFAULT_CRANE_CONNECTOR_BASE_URL;
                  try {
                    void window.api?.shell
                      ?.openExternal?.({
                        url: buildCraneConnectorSettingsUrl(url),
                      })
                      .catch(() => {
                        toast.error(i18n.t("settingsConnections:settingsDialogCraneConnector.couldNotOpenTheCraneConnectorVariant4ed670bc"));
                      });
                  } catch {
                    toast.error(
                      i18n.t("settingsConnections:settingsDialogCraneConnector.enterAValidCraneURLBefore"),
                    );
                  }
                }}
              >
                <ExternalLink className={sx(styles.actionIcon)} />
                {t("settingsConnections:settingsDialogCraneConnector.openCrane")}</Button>
            </div>
            <p className={sx(styles.fieldHint)}>
              {t("settingsConnections:settingsDialogCraneConnector.productionEndpointsMustUseHTTPSLocalhost")}</p>
          </div>

          <div className={sx(styles.field)}>
            <label
              htmlFor="settings-crane-poll-interval"
              className={sx(styles.fieldLabel)}
            >
              {t("settingsConnections:settingsDialogCraneConnector.pollInterval")}</label>
            <Select
              value={String(connector.pollIntervalSeconds)}
              disabled={busy !== null}
              onValueChange={(value) =>
                saveConnector({
                  pollIntervalSeconds: Number(value),
                })
              }
            >
              <SelectTrigger
                id="settings-crane-poll-interval"
                className={sx(styles.pollTrigger)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">{t("settingsConnections:settingsDialogCraneConnector.seconds")}</SelectItem>
                <SelectItem value="30">{t("settingsConnections:settingsDialogCraneConnector.secondsVariante9093fbc")}</SelectItem>
                <SelectItem value="60">{t("settingsConnections:settingsDialogCraneConnector.minute")}</SelectItem>
                <SelectItem value="120">{t("settingsConnections:settingsDialogCraneConnector.minutes")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!paired ? (
            <div className={sx(styles.pairPanel)}>
              <div>
                <h4 className={sx(styles.panelTitle)}>
                  {t("settingsConnections:settingsDialogCraneConnector.pairThisInstallation")}</h4>
                <p className={sx(styles.panelHint)}>
                  {t("settingsConnections:settingsDialogCraneConnector.generateAShortLivedCodeFrom")}</p>
              </div>
              <div className={sx(styles.pairGrid)}>
                <div className={sx(styles.field)}>
                  <label
                    htmlFor="settings-crane-connector-name"
                    className={sx(styles.fieldLabel)}
                  >
                    {t("settingsConnections:settingsDialogCraneConnector.connectorName")}</label>
                  <Input
                    id="settings-crane-connector-name"
                    value={connectorName}
                    onChange={(event) => setConnectorName(event.target.value)}
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>
                <div className={sx(styles.field)}>
                  <label
                    htmlFor="settings-crane-pairing-code"
                    className={sx(styles.fieldLabel)}
                  >
                    {t("settingsConnections:settingsDialogCraneConnector.oneTimePairingCode")}</label>
                  <Input
                    id="settings-crane-pairing-code"
                    type="password"
                    value={pairingCode}
                    onChange={(event) => setPairingCode(event.target.value)}
                    placeholder="stp_…"
                    maxLength={128}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <Button
                type="button"
                disabled={
                  busy !== null ||
                  !pairingCode.trim() ||
                  status?.secureStorageAvailable === false
                }
                onClick={() => void pair()}
              >
                {busy === "pair" ? (
                  <Loader aria-hidden size="xs" variant="signal" />
                ) : (
                  <LockKeyhole className={sx(styles.actionIcon)} />
                )}
                {t("settingsConnections:settingsDialogCraneConnector.pairSecurely")}</Button>
            </div>
          ) : (
            <div className={sx(styles.pairedPanel)}>
              <div className={sx(styles.pairedMeta)}>
                <p className={sx(styles.pairedName)}>
                  {status?.connector?.name ?? t("settingsConnections:settingsDialogCraneConnector.pairedStave")}
                </p>
                <p className={sx(styles.pairedId)}>{status?.connector?.id}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void disconnect()}
              >
                {busy === "disconnect" ? (
                  <Loader aria-hidden size="xs" variant="signal" />
                ) : (
                  <Unplug className={sx(styles.actionIcon)} />
                )}
                {t("settingsConnections:settingsDialogCraneConnector.disconnect")}</Button>
            </div>
          )}

          {status?.connector ? (
            <p className={sx(styles.infoNote)}>
              {t("settingsConnections:settingsDialogCraneConnector.craneAndMartinShareThisOne")}</p>
          ) : null}

          {status && !status.secureStorageAvailable ? (
            <p className={sx(styles.warning)}>
              {t("settingsConnections:settingsDialogCraneConnector.osCredentialEncryptionIsUnavailablePairing")}</p>
          ) : null}

          <div className={sx(styles.infoNote)}>
            {registeredRepositoryCount > 0
              ? t("settingsConnections:messages.selectableRepositories", { count: registeredRepositoryCount })
              : t("settingsConnections:settingsDialogCraneConnector.registerALocalStaveRepositoryBefore")}{" "}
            {t("settingsConnections:settingsDialogCraneConnector.localPathsAreNeverSentTo")}</div>

          {connector.repositoryMappings.length > 0 ? (
            <div className={sx(styles.mappings)}>
              <div>
                <h4 className={sx(styles.panelTitle)}>{t("settingsConnections:settingsDialogCraneConnector.repositoryMappings")}</h4>
                <p className={sx(styles.panelHint)}>
                  {t("settingsConnections:settingsDialogCraneConnector.incomingIssueTeamsPreselectTheseLocal")}</p>
              </div>
              <div className={sx(styles.mappingsList)}>
                {connector.repositoryMappings.map((mapping, index) => {
                  const repositoryName =
                    registeredRepositories.find(
                      (repository) =>
                        repository.repositoryPath === mapping.staveProjectPath,
                    )?.repositoryName ?? i18n.t("settingsConnections:settingsDialogCraneConnector.unregisteredRepository");
                  const routeLabel =
                    mapping.craneTeamKey ??
                    mapping.craneProjectId ??
                    i18n.t("settingsConnections:settingsDialogCraneConnector.craneRoute");
                  return (
                    <div
                      key={`${routeLabel}:${mapping.staveProjectPath}`}
                      className={sx(styles.mappingRow)}
                    >
                      <Badge variant="secondary">{routeLabel}</Badge>
                      <div className={sx(styles.mappingBody)}>
                        <p className={sx(styles.mappingName)}>{repositoryName}</p>
                        <p className={sx(styles.mappingPath)}>
                          {mapping.staveProjectPath}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={i18n.t("settingsConnections:settingsDialogCraneConnector.removeRepositoryMapping", { value1: routeLabel })}
                        onClick={() =>
                          saveConnector({
                            repositoryMappings: connector.repositoryMappings.filter(
                              (_, mappingIndex) => mappingIndex !== index,
                            ),
                          })
                        }
                      >
                        <Trash2
                          className={sx(styles.actionIcon)}
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={sx(styles.outboundCard)}>
        <h3 className={sx(styles.outboundTitle)}>{t("settingsConnections:settingsDialogCraneConnector.outboundData")}</h3>
        <p className={sx(styles.outboundText)}>
          {t("settingsConnections:settingsDialogCraneConnector.craneReceivesJobLifecycleStatesAnd")}</p>
      </div>
    </div>
  );
}
