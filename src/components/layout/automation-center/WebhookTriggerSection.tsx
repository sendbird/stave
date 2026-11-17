import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { TextField } from "@/components/aui/components/TextField";
import { Textarea } from "@/components/aui/components/Textarea";
import { Switch } from "@/components/aui/components/Switch";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import type { AutomationUpsertInput } from "@/lib/automations";

const styles = stylex.create({
  root: { display: "grid", gap: vars["--aui-space-12"], minInlineSize: 0 },
  row: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--aui-space-8"], minInlineSize: 0 },
  field: { display: "grid", gap: vars["--aui-space-4"], minInlineSize: 0, flex: "1 1 12rem" },
  text: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], margin: 0, overflowWrap: "anywhere" },
  warning: { color: vars["--aui-color-warning-text"], fontSize: vars["--aui-font-size-caption"], margin: 0 },
  list: { display: "grid", gap: vars["--aui-space-8"], padding: 0, margin: 0, listStyle: "none" },
  delivery: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
});

type ReceiverSettings = { enabled: boolean; bindAddress: string; port: number };
type Delivery = { id: string; automationId: string; receivedAt: string; status: "accepted" | "filtered" | "duplicate" | "rejected"; reason: string | null };

/** The editor owns transient provisioning state; the saved draft contains ids only. */
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
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [testBody, setTestBody] = useState('{"action":"opened"}');
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [provisionId] = useState(() => crypto.randomUUID());
  const webhook = props.draft.webhook;
  const nonLoopback = !["127.0.0.1", "::1", "localhost"].includes(settings.bindAddress);
  const url = webhook ? `http://${appliedSettings.bindAddress.includes(":") ? `[${appliedSettings.bindAddress}]` : appliedSettings.bindAddress}:${appliedSettings.port}/webhooks/${webhook.endpointId}` : "";

  useEffect(() => {
    let active = true;
    window.api?.automations?.webhookStatus?.().then((result) => {
      if (!active || !result.ok) return;
      setSettings(result.settings);
      setAppliedSettings(result.settings);
      setDeliveries(result.deliveries);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [props.automationId]);

  async function provision() {
    setBusy(true);
    props.onProvisioningChange(true);
    setError(false);
    try {
      const api = window.api?.automations;
      if (!api?.provisionWebhook) throw new Error();
      const result = await api.provisionWebhook({ id: props.automationId ?? provisionId });
      if (!result.ok) throw new Error();
      setSecret(result.secret);
      const { runOnceAt: _runOnceAt, ...draft } = props.draft;
      props.onDraftChange({ ...draft, enabled: true, webhook: { endpointId: result.endpointId, secretId: result.secretId, filters: [], dedupeWindowSeconds: 86400, coalesceWindowSeconds: 0, rateLimitPerMinute: 60 } });
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
      if (!result.ok) throw new Error();
      setSettings(result.settings);
      setAppliedSettings(result.settings);
      setDeliveries(result.deliveries);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  async function sendTest() {
    if (!props.automationId) return;
    setBusy(true);
    setError(false);
    try {
      const api = window.api?.automations;
      if (!api?.sendWebhookTest || !api.webhookStatus) throw new Error();
      const result = await api.sendWebhookTest({ id: props.automationId, body: testBody });
      if (!result.ok) throw new Error();
      setTestStatus(result.status);
      const status = await api.webhookStatus();
      if (status.ok) setDeliveries(status.deliveries);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  function update(patch: Partial<NonNullable<AutomationUpsertInput["webhook"]>>) {
    if (webhook) props.onDraftChange({ ...props.draft, webhook: { ...webhook, ...patch } });
  }

  return (
    <section className={sx(styles.root)} data-webhook-trigger="">
      <div className={sx(styles.row)} role="group" aria-label={t("automation:webhook.trigger")}>
        <Button type="button" size="sm" variant={webhook ? "quiet" : "secondary"} aria-pressed={!webhook} disabled={busy} onClick={() => {
          const { webhook: _webhook, ...draft } = props.draft;
          setSecret(null);
          props.onDraftChange(draft);
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
        <h3 className={sx(styles.text)}>{t("automation:webhook.receiver")}</h3>
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
        <div className={sx(styles.row)}><Button type="button" size="sm" variant="outlined" disabled={busy || !props.automationId || !settings.enabled} onClick={() => void sendTest()}>{t("automation:webhook.sendTest")}</Button></div>
        {testStatus !== null ? <p className={sx(styles.text)} role="status">{t("automation:webhook.testStatus", { status: testStatus })}</p> : null}
        <h3 className={sx(styles.text)}>{t("automation:webhook.recent")}</h3>
        <div className={sx(styles.row)}><Button type="button" size="sm" variant="quiet" onClick={async () => {
          try { const api = window.api?.automations; if (!api?.webhookStatus) throw new Error(); const result = await api.webhookStatus(); if (!result.ok) throw new Error(); setDeliveries(result.deliveries); } catch { setError(true); }
        }}>{t("automation:webhook.refresh")}</Button></div>
        <ul className={sx(styles.list)}>{deliveries.filter((delivery) => delivery.automationId === props.automationId).map((delivery) => <li key={delivery.id} className={sx(styles.delivery)}><span>{t(`automation:webhook.status.${delivery.status}`)}</span><time dateTime={delivery.receivedAt}>{formatDateTime(delivery.receivedAt)}</time></li>)}</ul>
        {!deliveries.some((delivery) => delivery.automationId === props.automationId) ? <p className={sx(styles.text)}>{t("automation:webhook.noDeliveries")}</p> : null}
      </>}
    </section>
  );
}
