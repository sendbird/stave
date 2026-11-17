import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { TextField } from "@/components/aui/components/TextField";
import { Textarea } from "@/components/aui/components/Textarea";
import { Switch } from "@/components/aui/components/Switch";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { enforceWebhookTrustPolicy, type AutomationUpsertInput } from "@/lib/automations";
import type { AutomationWebhookConfig, AutomationWebhookDelivery, AutomationWebhookRejection, AutomationWebhookReceiverStatus, WebhookRejectionReason } from "@/lib/automation-webhooks";

const styles = stylex.create({
  root: { display: "grid", gap: vars["--aui-space-12"], minInlineSize: 0 },
  row: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--aui-space-8"], minInlineSize: 0 },
  field: { display: "grid", gap: vars["--aui-space-4"], minInlineSize: 0, flex: "1 1 12rem" },
  text: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], margin: 0, overflowWrap: "anywhere" },
  warning: { color: vars["--aui-color-warning-text"], fontSize: vars["--aui-font-size-caption"], margin: 0 },
  danger: { color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-caption"], margin: 0 },
  list: { display: "grid", gap: vars["--aui-space-8"], padding: 0, margin: 0, listStyle: "none" },
  delivery: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  code: {
    fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"], margin: 0,
    padding: vars["--aui-space-8"], borderRadius: vars["--aui-radius-control"],
    backgroundColor: vars["--aui-color-surface-tint"], color: vars["--aui-color-text"],
    whiteSpace: "pre-wrap", overflowWrap: "anywhere", minInlineSize: 0,
  },
});

type ReceiverSettings = { enabled: boolean; bindAddress: string; port: number };
type ReceiverState = AutomationWebhookReceiverStatus & { applyError: AutomationWebhookReceiverStatus["error"] };

const RECEIVER_ERROR_KEYS = {
  "port-in-use": "automation:webhook.receiverError.portInUse",
  "address-unavailable": "automation:webhook.receiverError.addressUnavailable",
  "permission-denied": "automation:webhook.receiverError.permissionDenied",
  "bind-failed": "automation:webhook.receiverError.bindFailed",
  "receiver-failed": "automation:webhook.receiverError.receiverFailed",
} as const satisfies Record<NonNullable<AutomationWebhookReceiverStatus["error"]>, string>;
const RECEIVER_NOTICE_KEYS = {
  "journal-quarantined": "automation:webhook.receiverNotice.journalQuarantined",
} as const satisfies Record<NonNullable<AutomationWebhookReceiverStatus["notice"]>, string>;
const REJECTION_KEYS = {
  "signature-required": "automation:webhook.rejection.signatureRequired",
  "signature-invalid": "automation:webhook.rejection.signatureInvalid",
  "timestamp-required": "automation:webhook.rejection.timestampRequired",
  "timestamp-out-of-range": "automation:webhook.rejection.timestampOutOfRange",
  "delivery-id-invalid": "automation:webhook.rejection.deliveryIdInvalid",
  "invalid-json": "automation:webhook.rejection.invalidJson",
  "body-too-large": "automation:webhook.rejection.bodyTooLarge",
  disabled: "automation:webhook.rejection.disabled",
  "rate-limit": "automation:webhook.rejection.rateLimit",
  "unsigned-rate-limit": "automation:webhook.rejection.unsignedRateLimit",
} as const satisfies Record<WebhookRejectionReason, string>;
/** Why a queued event never started a run, as the receiver records it. */
function failureReasonKey(reason: string) {
  return reason === "interrupted" ? "automation:webhook.failureReason.interrupted"
    : reason === "disabled" ? "automation:webhook.failureReason.disabled"
    : "automation:webhook.failureReason.dispatchExpired";
}

// i18n-ignore: protocol example for senders (headers, shell commands), not application copy
const SIGNING_EXAMPLE = `ts=$(date +%s); id=evt-42; body='{"action":"opened"}'
sig=$(printf '%s.%s.%s' "$ts" "$id" "$body" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -X POST "$URL" -H "content-type: application/json" \\
  -H "x-stave-timestamp: $ts" -H "x-stave-delivery-id: $id" \\
  -H "x-stave-signature: sha256=$sig" -d "$body"`;

/**
 * The editor owns transient provisioning state; the saved draft contains ids only.
 * Secrets provisioned here and never saved are released when the editor closes.
 */
export function WebhookTriggerSection(props: {
  automationId: string | null;
  draft: AutomationUpsertInput;
  onDraftChange: (draft: AutomationUpsertInput) => void;
  onProvisioningChange: (pending: boolean) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation(["automation"]);
  const [settings, setSettings] = useState<ReceiverSettings>({ enabled: false, bindAddress: "127.0.0.1", port: 6330 });
  const [appliedSettings, setAppliedSettings] = useState(settings);
  const [receiver, setReceiver] = useState<ReceiverState | null>(null);
  const [deliveries, setDeliveries] = useState<AutomationWebhookDelivery[]>([]);
  const [rejections, setRejections] = useState<AutomationWebhookRejection[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [testBody, setTestBody] = useState('{"action":"opened"}');
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [sampleRunStarted, setSampleRunStarted] = useState(false);
  const [provisionId] = useState(() => crypto.randomUUID());
  // The webhook this draft last had, so switching back to it in the same draft reuses its endpoint and secret.
  const [lastWebhook, setLastWebhook] = useState<AutomationWebhookConfig | null>(props.draft.webhook ?? null);
  const provisioned = useRef<string[]>([]);
  const webhook = props.draft.webhook ?? null;
  const nonLoopback = !["127.0.0.1", "::1", "localhost"].includes(settings.bindAddress);
  const url = webhook ? `http://${appliedSettings.bindAddress.includes(":") ? `[${appliedSettings.bindAddress}]` : appliedSettings.bindAddress}:${appliedSettings.port}/webhooks/${webhook.endpointId}` : "";

  function applyStatus(result: { settings: ReceiverSettings; receiver: ReceiverState; deliveries: AutomationWebhookDelivery[]; rejections: AutomationWebhookRejection[] }) {
    setAppliedSettings(result.settings);
    setReceiver(result.receiver);
    setDeliveries(result.deliveries);
    setRejections(result.rejections);
  }

  async function refreshStatus() {
    const api = window.api?.automations;
    if (!api?.webhookStatus) throw new Error();
    const result = await api.webhookStatus();
    if (!result.ok) throw new Error();
    applyStatus(result);
    return result;
  }

  useEffect(() => {
    let active = true;
    window.api?.automations?.webhookStatus?.().then((result) => {
      if (!active || !result.ok) return;
      setSettings(result.settings);
      applyStatus(result);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [props.automationId]);

  useEffect(() => () => {
    // Closing the editor (saved or cancelled): the main process deletes each one no saved schedule uses.
    const secretIds = provisioned.current.splice(0);
    if (secretIds.length) void window.api?.automations?.releaseWebhookSecrets?.({ secretIds }).catch(() => undefined);
  }, []);

  /** A webhook schedule never runs unattended, and is turned on only by the user. */
  function selectWebhook(next: AutomationWebhookConfig) {
    const { runOnceAt: _runOnceAt, ...draft } = props.draft;
    props.onDraftChange(enforceWebhookTrustPolicy({ ...draft, enabled: false, webhook: next }));
  }

  async function provision() {
    if (lastWebhook) { selectWebhook(lastWebhook); return; }
    setBusy(true);
    props.onProvisioningChange(true);
    setError(false);
    try {
      const api = window.api?.automations;
      if (!api?.provisionWebhook) throw new Error();
      const result = await api.provisionWebhook({ id: props.automationId ?? provisionId });
      if (!result.ok) throw new Error();
      provisioned.current.push(result.secretId);
      setSecret(result.secret);
      const next: AutomationWebhookConfig = { endpointId: result.endpointId, secretId: result.secretId, filters: [], dedupeWindowSeconds: 86400, coalesceWindowSeconds: 0, rateLimitPerMinute: 60 };
      setLastWebhook(next);
      selectWebhook(next);
    } catch { setError(true); }
    finally { setBusy(false); props.onProvisioningChange(false); }
  }

  async function configure() {
    setBusy(true);
    setError(false);
    try {
      const api = window.api?.automations;
      if (!api?.configureWebhookReceiver) throw new Error();
      const result = await api.configureWebhookReceiver(settings);
      if (!result.ok) {
        // The status says why (for example a port in use) and what the receiver is doing instead.
        await refreshStatus().catch(() => setError(true));
        return;
      }
      setSettings(result.settings);
      applyStatus(result);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  async function sendTest() {
    if (!props.automationId) return;
    setBusy(true);
    setError(false);
    try {
      const api = window.api?.automations;
      if (!api?.sendWebhookTest) throw new Error();
      const result = await api.sendWebhookTest({ id: props.automationId, body: testBody });
      if (!result.ok) throw new Error();
      setTestStatus(result.status);
      await refreshStatus();
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  async function runWithSample() {
    if (!props.automationId) return;
    setBusy(true);
    setError(false);
    setSampleRunStarted(false);
    try {
      const api = window.api?.automations;
      if (!api?.runNow) throw new Error();
      const result = await api.runNow({ id: props.automationId, payload: JSON.parse(testBody) as unknown });
      if (!result.ok) throw new Error();
      setSampleRunStarted(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  function update(patch: Partial<AutomationWebhookConfig>) {
    if (!webhook) return;
    const next = { ...webhook, ...patch };
    setLastWebhook(next);
    props.onDraftChange({ ...props.draft, webhook: next });
  }

  const receiverLine = !receiver ? null
    : receiver.error ? <p className={sx(styles.danger)} role="alert" data-webhook-receiver-error="">{t(RECEIVER_ERROR_KEYS[receiver.error])}</p>
    : receiver.listening ? <p className={sx(styles.text)} role="status">{t("automation:webhook.receiverListening", { port: receiver.port })}</p>
    : <p className={sx(styles.text)} role="status">{t("automation:webhook.receiverOff")}</p>;
  const ownRejections = rejections.filter((entry) => entry.automationId === props.automationId);
  const ownDeliveries = deliveries.filter((delivery) => delivery.automationId === props.automationId);

  return (
    <section className={sx(styles.root)} data-webhook-trigger="">
      <div className={sx(styles.row)} role="group" aria-label={t("automation:webhook.trigger")}>
        <Button type="button" size="sm" variant={webhook ? "quiet" : "secondary"} aria-pressed={!webhook} disabled={busy} onClick={() => {
          // null removes the webhook on save; the secret is released when the editor closes unless a saved schedule uses it.
          setSecret(null);
          props.onDraftChange({ ...props.draft, webhook: null });
        }}>{t("automation:webhook.time")}</Button>
        <Button type="button" size="sm" variant={webhook ? "secondary" : "quiet"} aria-pressed={Boolean(webhook)} disabled={busy} onClick={() => { if (!webhook) void provision(); }}>{t("automation:webhook.label")}</Button>
      </div>
      {error ? <p className={sx(styles.warning)} role="alert">{t("automation:webhook.error")}</p> : null}
      {!webhook ? props.children : <>
        <p className={sx(styles.text)}>{t("automation:webhook.runningRequired")}</p>
        <label className={sx(styles.row)}>
          <Switch aria-label={t("automation:webhook.automationEnabled")} checked={props.draft.enabled} onCheckedChange={(enabled) => props.onDraftChange({ ...props.draft, enabled })} />
          {t("automation:webhook.automationEnabled")}
        </label>
        <label className={sx(styles.field)}>{t("automation:webhook.url")}<TextField controlOnly readOnly value={url} data-webhook-url="" /></label>
        <div className={sx(styles.row)}><Button type="button" size="sm" variant="outlined" onClick={() => navigator.clipboard.writeText(url).catch(() => setError(true))}>{t("automation:webhook.copyUrl")}</Button></div>
        {secret ? <div className={sx(styles.root)}>
          <p className={sx(styles.warning)}>{t("automation:webhook.shownOnce")}</p>
          <label className={sx(styles.field)}>{t("automation:webhook.secret")}<TextField controlOnly readOnly value={secret} data-webhook-secret="" /></label>
          <div className={sx(styles.row)}>
            <Button type="button" size="sm" variant="outlined" onClick={() => navigator.clipboard.writeText(secret).catch(() => setError(true))}>{t("automation:webhook.copySecret")}</Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setSecret(null)}>{t("automation:webhook.dismissSecret")}</Button>
          </div>
        </div> : null}
        <h3 className={sx(styles.text)}>{t("automation:webhook.signing")}</h3>
        <p className={sx(styles.text)}>{t("automation:webhook.signingHelp")}</p>
        <pre className={sx(styles.code)} data-webhook-signing-example="">{SIGNING_EXAMPLE}</pre>
        <h3 className={sx(styles.text)}>{t("automation:webhook.receiver")}</h3>
        {receiverLine}
        {receiver?.applyError ? <p className={sx(styles.danger)} role="alert">{t("automation:webhook.applyFailed", { reason: t(RECEIVER_ERROR_KEYS[receiver.applyError]) })}</p> : null}
        {receiver?.notice ? <p className={sx(styles.warning)} role="note">{t(RECEIVER_NOTICE_KEYS[receiver.notice])}</p> : null}
        <label className={sx(styles.row)}><Switch aria-label={t("automation:webhook.receiverEnabled")} checked={settings.enabled} onCheckedChange={(enabled) => setSettings({ ...settings, enabled })} />{t("automation:webhook.receiverEnabled")}</label>
        <div className={sx(styles.row)}>
          <label className={sx(styles.field)}>{t("automation:webhook.bindAddress")}<TextField controlOnly value={settings.bindAddress} onChange={(event) => setSettings({ ...settings, bindAddress: event.target.value })} /></label>
          <label className={sx(styles.field)}>{t("automation:webhook.port")}<TextField controlOnly type="number" min={1} max={65535} value={settings.port} onChange={(event) => setSettings({ ...settings, port: Number(event.target.value) })} /></label>
        </div>
        {nonLoopback ? <p className={sx(styles.warning)} role="note">{t("automation:webhook.exposureWarning")}</p> : null}
        <div className={sx(styles.row)}><Button type="button" variant="outlined" size="sm" disabled={busy} onClick={() => void configure()}>{t("automation:webhook.applyReceiver")}</Button></div>
        <h3 className={sx(styles.text)}>{t("automation:webhook.filters")}</h3>
        <p className={sx(styles.text)}>{t("automation:webhook.filtersHelp")}</p>
        {webhook.filters.map((filter, index) => <div className={sx(styles.root)} key={index}>
          <label className={sx(styles.field)}>{t("automation:webhook.path")}<TextField controlOnly value={filter.path} onChange={(event) => update({ filters: webhook.filters.map((item, at) => at === index ? { ...item, path: event.target.value } : item) })} /></label>
          <div className={sx(styles.row)} role="group" aria-label={t("automation:webhook.operator")}>
            {(["equals", "contains"] as const).map((operator) => <Button type="button" size="sm" variant={filter.operator === operator ? "secondary" : "quiet"} key={operator} aria-pressed={filter.operator === operator} onClick={() => update({ filters: webhook.filters.map((item, at) => at === index ? { ...item, operator } : item) })}>{t(`automation:webhook.${operator}`)}</Button>)}
            <Button type="button" size="sm" variant="quiet" onClick={() => update({ filters: webhook.filters.filter((_, at) => at !== index) })}>{t("automation:webhook.removeFilter")}</Button>
          </div>
          <label className={sx(styles.field)}>{t("automation:webhook.value")}<TextField controlOnly value={String(filter.value ?? "")} onChange={(event) => update({ filters: webhook.filters.map((item, at) => at === index ? { ...item, value: event.target.value } : item) })} /></label>
        </div>)}
        <div className={sx(styles.row)}><Button type="button" size="sm" variant="outlined" disabled={webhook.filters.length >= 20} onClick={() => update({ filters: [...webhook.filters, { path: "$.action", operator: "equals", value: "opened" }] })}>{t("automation:webhook.addFilter")}</Button></div>
        <div className={sx(styles.row)}>
          <label className={sx(styles.field)}>{t("automation:webhook.dedupe")}<TextField controlOnly type="number" min={1} max={604800} value={webhook.dedupeWindowSeconds} onChange={(event) => update({ dedupeWindowSeconds: Number(event.target.value) })} /></label>
          <label className={sx(styles.field)}>{t("automation:webhook.coalesce")}<TextField controlOnly type="number" min={0} max={3600} value={webhook.coalesceWindowSeconds} onChange={(event) => update({ coalesceWindowSeconds: Number(event.target.value) })} /></label>
          <label className={sx(styles.field)}>{t("automation:webhook.rate")}<TextField controlOnly type="number" min={1} max={600} value={webhook.rateLimitPerMinute} onChange={(event) => update({ rateLimitPerMinute: Number(event.target.value) })} /></label>
        </div>
        <label className={sx(styles.field)}>{t("automation:webhook.testPayload")}<Textarea controlOnly value={testBody} onChange={(event) => setTestBody(event.target.value)} /></label>
        <p className={sx(styles.text)}>{t("automation:webhook.testHelp", { template: "{{body.path}}" })}</p>
        <div className={sx(styles.row)}>
          <Button type="button" size="sm" variant="outlined" disabled={busy || !props.automationId || !settings.enabled} onClick={() => void sendTest()}>{t("automation:webhook.sendTest")}</Button>
          <Button type="button" size="sm" variant="outlined" disabled={busy || !props.automationId} onClick={() => void runWithSample()}>{t("automation:webhook.runWithSample")}</Button>
        </div>
        {testStatus !== null ? <p className={sx(styles.text)} role="status">{t("automation:webhook.testStatus", { status: testStatus })}</p> : null}
        {sampleRunStarted ? <p className={sx(styles.text)} role="status">{t("automation:webhook.sampleRunStarted")}</p> : null}
        <h3 className={sx(styles.text)}>{t("automation:webhook.recent")}</h3>
        <div className={sx(styles.row)}><Button type="button" size="sm" variant="quiet" onClick={() => { void refreshStatus().catch(() => setError(true)); }}>{t("automation:webhook.refresh")}</Button></div>
        <ul className={sx(styles.list)}>{ownDeliveries.map((delivery) => <li key={delivery.id} className={sx(styles.delivery)}>
          <span>{t(`automation:webhook.status.${delivery.status}`)}</span>
          {delivery.status === "failed" && delivery.reason ? <span>{t(failureReasonKey(delivery.reason))}</span> : null}
          <time dateTime={delivery.receivedAt}>{formatDateTime(delivery.receivedAt)}</time>
        </li>)}</ul>
        {!ownDeliveries.length ? <p className={sx(styles.text)}>{t("automation:webhook.noDeliveries")}</p> : null}
        {ownRejections.length ? <>
          <h3 className={sx(styles.text)}>{t("automation:webhook.rejected")}</h3>
          <ul className={sx(styles.list)} data-webhook-rejections="">{ownRejections.map((entry) => <li key={entry.reason} className={sx(styles.delivery)}>
            <span>{t(REJECTION_KEYS[entry.reason])}</span>
            <span>{t("automation:webhook.rejectionCount", { count: entry.count })}</span>
            <time dateTime={entry.lastAt}>{formatDateTime(entry.lastAt)}</time>
          </li>)}</ul>
        </> : null}
      </>}
    </section>
  );
}
