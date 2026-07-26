import { useEffect, useState } from "react";
import {
  BookOpen,
  Cable,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RefreshCw,
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
  toast,
} from "@/components/ui";
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
  const connector = useAppStore(
    (state) => state.settings.craneConnector,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const registeredProjectCount = useAppStore(
    (state) => state.recentProjects.length,
  );
  const { status } = useCraneConnectorClientState();
  const [baseUrl, setBaseUrl] = useState(connector.baseUrl);
  const [pairingCode, setPairingCode] = useState("");
  const [connectorName, setConnectorName] =
    useState("Stave Desktop");
  const [busy, setBusy] = useState<
    "pair" | "disconnect" | "refresh" | null
  >(null);

  useEffect(() => {
    setBaseUrl(connector.baseUrl);
  }, [connector.baseUrl]);

  useEffect(() => {
    let cancelled = false;
    void window.api?.craneConnector?.getStatus?.().then((result) => {
      if (!cancelled && result) {
        setCraneConnectorClientStatus(result.status);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConnector = (
    patch: Partial<typeof connector>,
  ) => {
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
    const disconnectConnector =
      window.api?.craneConnector?.disconnect;
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
    <div className="space-y-5">
      <div
        id="settings-field-crane-connector"
        tabIndex={-1}
        className="rounded-xl border border-border bg-card"
      >
        <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <Cable className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Crane connector</h3>
              <Badge variant="outline">
                {statusLabel(status?.runtimeState)}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Poll your own Crane account over outbound HTTPS. Every job still
              requires a local approval before Stave creates a workspace or
              starts a provider.
            </p>
            <Button
              type="button"
              size="xs"
              variant="link"
              className="mt-1 h-auto px-0 text-xs"
              onClick={() => {
                void window.api?.shell?.openExternal?.({
                  url: STAVE_CRANE_CONNECTOR_GUIDE_URL,
                }).catch(() => {
                  toast.error("Could not open the Crane connector guide.");
                });
              }}
            >
              <BookOpen className="size-3" />
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
              className={
                busy === "refresh" ? "size-4 animate-spin" : "size-4"
              }
            />
          </Button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label
                htmlFor="settings-crane-enabled"
                className="text-sm font-medium"
              >
                Enable outbound polling
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Off means no connector timer or network traffic.
              </p>
            </div>
            <Switch
              id="settings-crane-enabled"
              checked={enabled}
              disabled={busy !== null}
              onCheckedChange={(checked) =>
                saveConnector({ enabled: checked })
              }
            />
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="settings-crane-base-url"
              className="text-xs font-medium text-muted-foreground"
            >
              Crane URL
            </label>
            <div className="flex gap-2">
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
                    toast.error("Enter a valid Crane URL before opening Crane.");
                  }
                }}
              >
                <ExternalLink className="size-4" />
                Open Crane
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Production endpoints must use HTTPS. Localhost HTTP is accepted
              only in development builds.
            </p>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="settings-crane-poll-interval"
              className="text-xs font-medium text-muted-foreground"
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
                className="w-48"
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
            <div className="space-y-3 rounded-lg border border-border bg-muted/25 p-4">
              <div>
                <h4 className="text-sm font-medium">Pair this installation</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Generate a short-lived code from the Crane connector page,
                  then paste it here. The code is exchanged once and is never
                  persisted in settings.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label
                    htmlFor="settings-crane-connector-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Connector name
                  </label>
                  <Input
                    id="settings-crane-connector-name"
                    value={connectorName}
                    onChange={(event) =>
                      setConnectorName(event.target.value)
                    }
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <label
                    htmlFor="settings-crane-pairing-code"
                    className="text-xs font-medium text-muted-foreground"
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
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                Pair securely
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {status?.connector?.name ?? "Paired Stave"}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {status?.connector?.id}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void disconnect()}
              >
                {busy === "disconnect" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Unplug className="size-4" />
                )}
                Disconnect
              </Button>
            </div>
          )}

          {status && !status.secureStorageAvailable ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
              OS credential encryption is unavailable. Pairing remains blocked
              until a secure credential store is available.
            </p>
          ) : null}

          <div className="rounded-lg border border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
            {registeredProjectCount > 0
              ? `${registeredProjectCount} registered project${registeredProjectCount === 1 ? "" : "s"} can be selected per incoming job.`
              : "Register a local Stave project before approving a Crane job."}{" "}
            Local paths are never sent to Crane.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <h3 className="text-sm font-semibold">Outbound data</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Crane receives job lifecycle states and safe error codes only.
          Transcripts, reasoning, diffs, files, local paths, branches,
          provider credentials, and Local MCP metadata remain on this machine.
        </p>
      </div>
    </div>
  );
}
