import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Smartphone } from "lucide-react";
import { Alert } from "@/components/aui/components/Alert";
import { Badge } from "@/components/aui/components/Badge";
import { Button, Input, toast } from "@/components/ui";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  isLoopbackAddress,
  REMOTE_CONTROL_DEFAULT_ADDRESS,
  REMOTE_CONTROL_PORT_MAX,
  REMOTE_CONTROL_PORT_MIN,
  RemoteAdminResultSchema,
  type RemoteAdmin,
  type RemoteAdminError,
  type RemoteAudit,
  type RemotePairing,
  type RemoteStatus,
} from "@/lib/remote-control";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  LabeledField,
  SectionStack,
  SelectField,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";
import { remoteControlStyles as styles } from "./settings-dialog-remote-control.styles";

export const REMOTE_CONTROL_SETTING_FIELD_ID = "settings-field-remote-control";
const STATUS_REFRESH_MS = 5_000;

const ERROR_KEYS = {
  "invalid-request": "settingsConnections:remoteControl.errors.failed",
  "invalid-address": "settingsConnections:remoteControl.errors.invalidAddress",
  "address-unavailable": "settingsConnections:remoteControl.errors.addressUnavailable",
  "bind-failed": "settingsConnections:remoteControl.errors.bindFailed",
  "pairing-unavailable": "settingsConnections:remoteControl.errors.pairingUnavailable",
  failed: "settingsConnections:remoteControl.errors.failed",
} as const satisfies Record<RemoteAdminError, string>;

const RESULT_KEYS = {
  applied: "settingsConnections:remoteControl.results.applied",
  expired: "settingsConnections:remoteControl.results.expired",
  invalid: "settingsConnections:remoteControl.results.invalid",
  unavailable: "settingsConnections:remoteControl.results.unavailable",
} as const;

function auditKey(entry: RemoteAudit) {
  if (entry.action.kind === "question") return "settingsConnections:remoteControl.audit.answered" as const;
  return entry.action.approved
    ? ("settingsConnections:remoteControl.audit.approved" as const)
    : ("settingsConnections:remoteControl.audit.denied" as const);
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** One admin call, validated on the way back as main validated it on the way in. */
async function invokeRemote(args: RemoteAdmin) {
  const api = window.api?.remoteControl;
  if (!api) return null;
  const parsed = RemoteAdminResultSchema.safeParse(await api.invoke(args));
  return parsed.success ? parsed.data : null;
}

export function RemoteControlSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const available = typeof window !== "undefined" && Boolean(window.api?.remoteControl);
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RemoteAdminError | null>(null);
  const [pairing, setPairing] = useState<RemotePairing | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [portDraft, setPortDraft] = useState("");
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const apply = useCallback((result: Awaited<ReturnType<typeof invokeRemote>>) => {
    if (!result) {
      setError("failed");
      return false;
    }
    if (result.status) setStatus(result.status);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    return true;
  }, []);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const read = () =>
      void invokeRemote({ kind: "status" })
        .then((result) => {
          if (!cancelled && result?.status) setStatus(result.status);
        })
        .catch(() => undefined);
    read();
    // Devices' last use and new remote actions arrive while the section is open.
    const timer = window.setInterval(read, STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [available]);

  const statusPort = status?.port;
  useEffect(() => {
    if (statusPort !== undefined) setPortDraft(String(statusPort));
  }, [statusPort]);

  useEffect(() => {
    if (!pairing) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const configure = async (patch: { enabled?: boolean; address?: string; port?: number }) => {
    if (!status) return;
    const address = patch.address ?? status.address;
    setBusy(true);
    try {
      const ok = apply(
        await invokeRemote({
          kind: "configure",
          config: {
            enabled: patch.enabled ?? status.configured,
            address,
            port: patch.port ?? status.port,
            // A network address is only sent after the user confirmed it in the dialog below.
            confirmNetwork: !isLoopbackAddress(address),
          },
        }),
      );
      // Any restart invalidates an open code.
      if (ok || patch.enabled === false) setPairing(null);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  };

  const pair = async () => {
    setBusy(true);
    try {
      const result = await invokeRemote({ kind: "pair" });
      if (apply(result) && result?.ok && result.pairing) {
        setPairing(result.pairing);
        setCopied(false);
      }
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id?: string) => {
    setBusy(true);
    try {
      apply(await invokeRemote(id ? { kind: "revoke", id } : { kind: "revoke" }));
      setPairing(null);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
      setConfirmRevokeAll(false);
    }
  };

  const commitPort = () => {
    if (!status) return;
    const port = Number(portDraft);
    if (!Number.isInteger(port) || port < REMOTE_CONTROL_PORT_MIN || port > REMOTE_CONTROL_PORT_MAX) {
      setPortDraft(String(status.port));
      return;
    }
    if (port !== status.port) void configure({ port });
  };

  if (!available) {
    return (
      <SectionStack>
        <SettingsCard title={t("settingsConnections:remoteControl.title")} id={REMOTE_CONTROL_SETTING_FIELD_ID} tabIndex={-1}>
          <p className={sx(styles.status)}>{t("settingsConnections:remoteControl.desktopOnly")}</p>
        </SettingsCard>
      </SectionStack>
    );
  }

  const running = status?.enabled === true;
  const url = status ? `http://${status.address.includes(":") ? `[${status.address}]` : status.address}:${status.port}` : "";
  const addressOptions = [
    {
      value: REMOTE_CONTROL_DEFAULT_ADDRESS,
      label: t("settingsConnections:remoteControl.addressLoopback", { address: REMOTE_CONTROL_DEFAULT_ADDRESS }),
    },
    ...(status?.interfaces ?? []).map((entry) => ({
      value: entry.address,
      label: t("settingsConnections:remoteControl.addressInterface", { name: entry.name, address: entry.address }),
    })),
  ];
  if (status && !addressOptions.some((option) => option.value === status.address)) {
    addressOptions.push({ value: status.address, label: status.address });
  }
  const pairingLeft = pairing ? pairing.expiresAt - now : 0;
  const errorText = error
    ? t(ERROR_KEYS[error], { port: status?.port ?? REMOTE_CONTROL_PORT_MIN })
    : status?.startError && status.configured && !running
      ? t(ERROR_KEYS[status.startError], { port: status.port })
      : null;

  return (
    <SectionStack>
      <SettingsCard
        id={REMOTE_CONTROL_SETTING_FIELD_ID}
        tabIndex={-1}
        title={t("settingsConnections:remoteControl.title")}
        description={t("settingsConnections:remoteControl.description")}
        titleAccessory={
          <Badge tone={running ? "success" : status?.configured ? "danger" : "neutral"}>
            {running
              ? t("settingsConnections:remoteControl.statusOn")
              : status?.configured
                ? t("settingsConnections:remoteControl.statusNotRunning")
                : t("settingsConnections:remoteControl.statusOff")}
          </Badge>
        }
      >
        <Alert tone="warning" role="note" title={t("settingsConnections:remoteControl.risk")} />
        <SwitchField
          title={t("settingsConnections:remoteControl.enableTitle")}
          description={t("settingsConnections:remoteControl.enableDescription")}
          checked={status?.configured ?? false}
          onCheckedChange={(checked) => {
            if (!busy && status) void configure({ enabled: checked });
          }}
        />
        <SelectField
          title={t("settingsConnections:remoteControl.addressTitle")}
          description={t("settingsConnections:remoteControl.addressDescription")}
          value={status?.address ?? REMOTE_CONTROL_DEFAULT_ADDRESS}
          disabled={busy || !status}
          options={addressOptions}
          onChange={(address) => {
            if (!status || address === status.address) return;
            if (isLoopbackAddress(address)) void configure({ address });
            else setPendingAddress(address);
          }}
        />
        <LabeledField
          title={t("settingsConnections:remoteControl.portTitle")}
          description={t("settingsConnections:remoteControl.portDescription", {
            min: REMOTE_CONTROL_PORT_MIN,
            max: REMOTE_CONTROL_PORT_MAX,
          })}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={REMOTE_CONTROL_PORT_MIN}
            max={REMOTE_CONTROL_PORT_MAX}
            value={portDraft}
            disabled={busy || !status}
            aria-label={t("settingsConnections:remoteControl.portTitle")}
            className={sx(styles.portInput)}
            onChange={(event) => setPortDraft(event.target.value)}
            onBlur={commitPort}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitPort();
            }}
          />
        </LabeledField>
        {running ? (
          <p className={sx(styles.status)} role="status">
            {t("settingsConnections:remoteControl.listeningAt", { url })}
          </p>
        ) : null}
        {errorText ? (
          <p className={sx(styles.error)} role="alert">
            {errorText}
          </p>
        ) : null}
      </SettingsCard>

      <SettingsCard
        title={t("settingsConnections:remoteControl.pairTitle")}
        description={t("settingsConnections:remoteControl.pairDescription")}
      >
        <div className={sx(styles.pairActions)}>
          <Button type="button" variant="outline" disabled={!running || busy || status?.pairingLocked} onClick={() => void pair()}>
            <Smartphone className={sx(styles.actionIcon)} aria-hidden="true" />
            {pairing ? t("settingsConnections:remoteControl.newCode") : t("settingsConnections:remoteControl.pairButton")}
          </Button>
        </div>
        {!running ? (
          <p className={sx(styles.status)}>{t("settingsConnections:remoteControl.pairNeedsOn")}</p>
        ) : status?.pairingLocked ? (
          <p className={sx(styles.error)}>{t("settingsConnections:remoteControl.pairingLocked")}</p>
        ) : null}
        {running && pairing && pairingLeft > 0 ? (
          <>
            <div className={sx(styles.pairing)} data-remote-pairing="">
              <span className={sx(styles.pairingLabel)}>{t("settingsConnections:remoteControl.pairingUrl")}</span>
              <span className={sx(styles.pairingValueRow)}>
                <span className={sx(styles.pairingValue)}>{pairing.url}</span>
                <Tooltip content={copied ? t("settingsConnections:remoteControl.copied") : t("settingsConnections:remoteControl.copyUrl")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("settingsConnections:remoteControl.copyUrl")}
                    onClick={() => {
                      void copyTextToClipboard(pairing.url)
                        .then(() => setCopied(true))
                        .catch(() => toast.error(t("settingsConnections:remoteControl.copyFailed")));
                    }}
                  >
                    {copied ? <Check className={sx(styles.actionIcon)} /> : <Copy className={sx(styles.actionIcon)} />}
                  </Button>
                </Tooltip>
              </span>
              <span className={sx(styles.pairingLabel)}>{t("settingsConnections:remoteControl.pairingCode")}</span>
              <span className={sx(styles.pairingValue)}>{pairing.code}</span>
            </div>
            <p className={sx(styles.status)} role="timer" aria-live="off">
              {t("settingsConnections:remoteControl.expiresIn", { time: formatCountdown(pairingLeft) })}
            </p>
            {status && isLoopbackAddress(status.address) ? (
              <p className={sx(styles.status)}>{t("settingsConnections:remoteControl.loopbackPairNote")}</p>
            ) : null}
          </>
        ) : running && pairing ? (
          <p className={sx(styles.status)}>{t("settingsConnections:remoteControl.expired")}</p>
        ) : null}
      </SettingsCard>

      <SettingsCard
        title={t("settingsConnections:remoteControl.devicesTitle")}
        titleAccessory={
          status && status.devices.length > 0 ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRevokeAll(true)}>
              {t("settingsConnections:remoteControl.revokeAll")}
            </Button>
          ) : null
        }
      >
        {status && status.devices.length > 0 ? (
          <ul className={sx(styles.list)} aria-label={t("settingsConnections:remoteControl.devicesTitle")}>
            {status.devices.map((device) => (
              <li key={device.id} className={sx(styles.row)}>
                <div className={sx(styles.rowBody)}>
                  <p className={sx(styles.rowTitle)}>{device.name}</p>
                  <p className={sx(styles.rowMeta)}>
                    {t("settingsConnections:remoteControl.deviceMeta", {
                      paired: formatDateTime(device.createdAt),
                      lastUsed: formatDateTime(device.lastSeen),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={t("settingsConnections:remoteControl.revokeAria", { name: device.name })}
                  className={sx(styles.rowAside)}
                  onClick={() => void revoke(device.id)}
                >
                  {t("settingsConnections:remoteControl.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={sx(styles.empty)}>{t("settingsConnections:remoteControl.devicesEmpty")}</p>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("settingsConnections:remoteControl.auditTitle")}
        description={t("settingsConnections:remoteControl.auditDescription")}
      >
        {status && status.audit.length > 0 ? (
          <ul className={sx(styles.list)} aria-label={t("settingsConnections:remoteControl.auditTitle")}>
            {[...status.audit].reverse().map((entry) => (
              <li key={entry.id} className={sx(styles.row)}>
                <div className={sx(styles.rowBody)}>
                  <p className={sx(styles.rowTitle)}>{t(auditKey(entry), { device: entry.deviceName })}</p>
                  <p className={sx(styles.rowMeta)}>{formatDateTime(entry.time)}</p>
                </div>
                <Badge
                  tone={entry.result.reason === "applied" ? "success" : entry.result.reason === "unavailable" ? "danger" : "neutral"}
                  xstyle={styles.rowAside}
                >
                  {t(RESULT_KEYS[entry.result.reason])}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className={sx(styles.empty)}>{t("settingsConnections:remoteControl.auditEmpty")}</p>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={pendingAddress !== null}
        defaultFocus="cancel"
        title={t("settingsConnections:remoteControl.confirmTitle")}
        description={t("settingsConnections:remoteControl.confirmDescription", { address: pendingAddress ?? "" })}
        confirmLabel={t("settingsConnections:remoteControl.confirmLabel")}
        loading={busy}
        onConfirm={() => {
          const address = pendingAddress;
          setPendingAddress(null);
          if (address) void configure({ address });
        }}
        onCancel={() => setPendingAddress(null)}
      />
      <ConfirmDialog
        open={confirmRevokeAll}
        defaultFocus="cancel"
        title={t("settingsConnections:remoteControl.revokeAllTitle")}
        description={t("settingsConnections:remoteControl.revokeAllDescription")}
        confirmLabel={t("settingsConnections:remoteControl.revokeAll")}
        loading={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setConfirmRevokeAll(false)}
      />
    </SectionStack>
  );
}
