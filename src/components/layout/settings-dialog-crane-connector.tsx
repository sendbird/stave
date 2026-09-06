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
      return "Connected";
    case "awaiting_local_approval":
      return "Needs local approval";
    case "running":
      return "Running";
    case "connecting":
      return "Connecting";
    case "offline":
      return "Offline";
    case "error":
      return "Attention needed";
    case "unpaired":
      return "Not paired";
    default:
      return "Disabled";
  }
}

export function CraneConnectorSettingsSection() {
  const connector = useAppStore((state) => state.settings.craneConnector);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const registeredProjects = useAppStore((state) => state.recentProjects);
  const registeredProjectCount = registeredProjects.length;
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
      toast.error("Could not refresh the Crane connector status.");
    } finally {
      setBusy(null);
    }
  };

  const pair = async () => {
    const pairConnector = window.api?.craneConnector?.pair;
    if (!pairConnector) {
      toast.error("Crane connector controls are unavailable.");
      return;
    }
    if (!pairingCode.trim()) {
      toast.error("Paste the one-time pairing code from Crane.");
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
        toast.error("Could not pair with Crane", {
          description: result.message,
        });
        return;
      }
      setPairingCode("");
      saveConnector({
        enabled: true,
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      });
      toast.success("Crane is paired with this Stave installation.");
    } catch {
      toast.error("Could not pair with Crane.");
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
        toast.success("Crane connector disconnected.");
      } else {
        toast.error("Could not fully disconnect the Crane connector", {
          description: result.message,
        });
      }
    } catch {
      toast.error("Could not disconnect the Crane connector.");
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
              <h3 className={sx(styles.headerTitle)}>Crane connector</h3>
              <Badge variant="outline">
                {statusLabel(status?.runtimeState)}
              </Badge>
            </div>
            <p className={sx(styles.headerDescription)}>
              Poll your own Crane account over outbound HTTPS. Every job still
              requires a local approval before Stave creates a workspace or
              starts a provider.
            </p>
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
                    toast.error("Could not open the Crane connector guide.");
                  });
              }}
            >
              <BookOpen className={sx(styles.guideIcon)} />
              Read setup guide
            </Button>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh Crane connector status"
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
                Enable outbound polling
              </label>
              <p className={sx(styles.enableHint)}>
                Off means no connector timer or network traffic.
              </p>
            </div>
            <Switch
              id="settings-crane-enabled"
              aria-label="Enable outbound polling"
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
              Crane URL
            </label>
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
                aria-label="Open Crane connector page"
                onClick={() => {
                  const url =
                    baseUrl.trim() || DEFAULT_CRANE_CONNECTOR_BASE_URL;
                  try {
                    void window.api?.shell
                      ?.openExternal?.({
                        url: buildCraneConnectorSettingsUrl(url),
                      })
                      .catch(() => {
                        toast.error("Could not open the Crane connector page.");
                      });
                  } catch {
                    toast.error(
                      "Enter a valid Crane URL before opening Crane.",
                    );
                  }
                }}
              >
                <ExternalLink className={sx(styles.actionIcon)} />
                Open Crane
              </Button>
            </div>
            <p className={sx(styles.fieldHint)}>
              Production endpoints must use HTTPS. Localhost HTTP is accepted
              only in development builds.
            </p>
          </div>

          <div className={sx(styles.field)}>
            <label
              htmlFor="settings-crane-poll-interval"
              className={sx(styles.fieldLabel)}
            >
              Poll interval
            </label>
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
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!paired ? (
            <div className={sx(styles.pairPanel)}>
              <div>
                <h4 className={sx(styles.panelTitle)}>
                  Pair this installation
                </h4>
                <p className={sx(styles.panelHint)}>
                  Generate a short-lived code from the Crane connector page,
                  then paste it here. The code is exchanged once and is never
                  persisted in settings.
                </p>
              </div>
              <div className={sx(styles.pairGrid)}>
                <div className={sx(styles.field)}>
                  <label
                    htmlFor="settings-crane-connector-name"
                    className={sx(styles.fieldLabel)}
                  >
                    Connector name
                  </label>
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
                    One-time pairing code
                  </label>
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
                Pair securely
              </Button>
            </div>
          ) : (
            <div className={sx(styles.pairedPanel)}>
              <div className={sx(styles.pairedMeta)}>
                <p className={sx(styles.pairedName)}>
                  {status?.connector?.name ?? "Paired Stave"}
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
                Disconnect
              </Button>
            </div>
          )}

          {status?.connector ? (
            <p className={sx(styles.infoNote)}>
              Crane and Martin share this one connector credential.
              Disconnecting revokes both, so Martin workspace sync stops
              delivering until you pair again. Queued items are kept and resume
              after re-pairing.
            </p>
          ) : null}

          {status && !status.secureStorageAvailable ? (
            <p className={sx(styles.warning)}>
              OS credential encryption is unavailable. Pairing remains blocked
              until a secure credential store is available.
            </p>
          ) : null}

          <div className={sx(styles.infoNote)}>
            {registeredProjectCount > 0
              ? `${registeredProjectCount} registered project${registeredProjectCount === 1 ? "" : "s"} can be selected per incoming job.`
              : "Register a local Stave project before approving a Crane job."}{" "}
            Local paths are never sent to Crane.
          </div>

          {connector.projectMappings.length > 0 ? (
            <div className={sx(styles.mappings)}>
              <div>
                <h4 className={sx(styles.panelTitle)}>Project mappings</h4>
                <p className={sx(styles.panelHint)}>
                  Incoming issue teams preselect these local Stave projects. The
                  mapping never leaves this device.
                </p>
              </div>
              <div className={sx(styles.mappingsList)}>
                {connector.projectMappings.map((mapping, index) => {
                  const projectName =
                    registeredProjects.find(
                      (project) =>
                        project.projectPath === mapping.staveProjectPath,
                    )?.projectName ?? "Unregistered project";
                  const routeLabel =
                    mapping.craneTeamKey ??
                    mapping.craneProjectId ??
                    "Crane route";
                  return (
                    <div
                      key={`${routeLabel}:${mapping.staveProjectPath}`}
                      className={sx(styles.mappingRow)}
                    >
                      <Badge variant="secondary">{routeLabel}</Badge>
                      <div className={sx(styles.mappingBody)}>
                        <p className={sx(styles.mappingName)}>{projectName}</p>
                        <p className={sx(styles.mappingPath)}>
                          {mapping.staveProjectPath}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${routeLabel} project mapping`}
                        onClick={() =>
                          saveConnector({
                            projectMappings: connector.projectMappings.filter(
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
        <h3 className={sx(styles.outboundTitle)}>Outbound data</h3>
        <p className={sx(styles.outboundText)}>
          Crane receives job lifecycle states and safe error codes only.
          Transcripts, reasoning, diffs, files, local paths, branches, provider
          credentials, and Local MCP metadata remain on this machine.
        </p>
      </div>
    </div>
  );
}
