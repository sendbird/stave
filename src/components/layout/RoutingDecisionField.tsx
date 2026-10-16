import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { Select } from "@/components/ads/components/Select";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { ApiConnectionCatalogModel } from "@/lib/providers/api-connections";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import type { RoutingDecisionConfig } from "@/lib/providers/routing-decision";
import { useAppStore } from "@/store/app.store";
import { accountStyles } from "./provider-accounts.styles";
import { nativeDecisionModelName, resolveRoutingDecisionStatus } from "./routing-decision-status";
import { SearchablePicker } from "./settings-searchable-picker";

const DEFAULT_GATEWAY_DECISION_MODEL = "typesafe-ai/jev";

/** Shared by global Auto settings and an Agent's optional Decision override. */
export function RoutingDecisionField(props: {
  value?: RoutingDecisionConfig;
  onChange: (value: RoutingDecisionConfig | undefined) => void;
  allowInherit?: boolean;
}) {
  const { t } = useTranslation("settingsProviders");
  const connectionLabelId = useId();
  const modelLabelId = useId();
  useLoadProviderAccounts();
  const profiles = useProviderAccounts((state) => state.profiles);
  const autoRoutingEnabled = useAppStore((state) => state.settings.autoRoutingEnabled);
  const classifierEnabled = useAppStore((state) => state.settings.autoRoutingProfile.signals.classifier);
  const connections = useMemo(() => [...new Map(profiles.filter((profile) => profile.apiConnection?.kind === "vercel-ai-gateway")
    .map((profile) => [profile.id, profile])).values()], [profiles]);
  const hasConnections = connections.length > 0;
  // Choosing the gateway with no connection saves nothing, so the menu shows
  // the gateway while the saved choice (and the status line) stays as it was.
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const mode = gatewayOpen ? "gateway" : props.value?.mode === "native" ? props.value.providerId
    : props.value?.mode ?? (props.allowInherit ? "inherit" : "automatic");
  const selected = props.value?.mode === "gateway" ? props.value : undefined;
  const [catalog, setCatalog] = useState<ApiConnectionCatalogModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mode !== "gateway" || !hasConnections) return;
    let cancelled = false;
    setLoading(true); setFailed(false);
    const api = window.api?.apiConnections;
    if (!api) { setLoading(false); setFailed(true); return; }
    void api.discoverModels({ purpose: "decision" }).then((result) => {
      if (cancelled) return;
      if (result.ok) setCatalog(result.models);
      else setFailed(true);
    }).catch(() => { if (!cancelled) setFailed(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, hasConnections, retry]);
  const chooseMode = (value: string) => {
    setGatewayOpen(false);
    if (value === "inherit") props.onChange(undefined);
    else if (value === "automatic") props.onChange({ mode: "automatic" });
    else if (value === "codex" || value === "claude-code") props.onChange({ mode: "native", providerId: value });
    else if (value === "gateway" && props.value?.mode !== "gateway") {
      setGatewayOpen(true);
      if (connections[0]) props.onChange({ mode: "gateway", connectionId: connections[0].id, model: DEFAULT_GATEWAY_DECISION_MODEL });
    }
  };
  const currentConnection = connections.find((entry) => entry.id === selected?.connectionId);
  const connectionOptions = connections.map((entry) => ({ value: entry.id, label: entry.label }));
  const modelOptions = catalog.map((entry) => ({ value: entry.id, label: entry.name, detail: entry.id }));
  const selectedModelName = selected ? catalog.find((entry) => entry.id === selected.model)?.name ?? selected.model : undefined;
  const status = resolveRoutingDecisionStatus({ value: props.value, allowInherit: props.allowInherit, connectionLabel: currentConnection?.label,
    modelName: selectedModelName, autoRoutingEnabled, classifierEnabled });
  return <div className={sx(accountStyles.stack)}>
    <Select aria-label={t("routingDecision.title")} size="sm" value={mode} onValueChange={(value) => chooseMode(String(value))}
      options={[
        ...(props.allowInherit ? [{ value: "inherit", label: t("routingDecision.inherit") }] : []),
        { value: "automatic", label: t("routingDecision.automatic") },
        ...(["codex", "claude-code"] as const).map((providerId) => ({ value: providerId, label: nativeDecisionModelName(providerId) })),
        { value: "gateway", label: /* i18n-ignore: external service name */ "Vercel AI Gateway" },
      ]} />
    {mode === "gateway" && (!hasConnections
      ? <p role="status" className={sx(accountStyles.attention)}>{t(selected ? "routingDecision.connectionRemoved" : "routingDecision.gatewayNotApplied")}</p>
      : <>
        <div className={sx(accountStyles.stackTight)}>
          <span id={connectionLabelId} className={sx(accountStyles.label)}>{t("routingDecision.connection")}</span>
          <SearchablePicker labelledBy={connectionLabelId} value={currentConnection?.id} options={connectionOptions}
            placeholder={t("routingDecision.connectionPlaceholder")} searchPlaceholder={t("routingDecision.connectionSearch")}
            emptyText={t("routingDecision.connectionEmpty")}
            onSelect={(connectionId) => props.onChange({ mode: "gateway", connectionId, model: selected?.model ?? DEFAULT_GATEWAY_DECISION_MODEL })} />
          {selected && !currentConnection && <p role="status" className={sx(accountStyles.attention)}>{t("routingDecision.missingConnection")}</p>}
        </div>
        <div className={sx(accountStyles.stackTight)}>
          <span id={modelLabelId} className={sx(accountStyles.label)}>{t("routingDecision.model")}</span>
          <SearchablePicker labelledBy={modelLabelId} value={selected?.model} fallbackLabel={selected?.model} options={modelOptions}
            disabled={!selected} loading={loading} loadingText={t("routingDecision.loading")}
            placeholder={t("routingDecision.modelPlaceholder")} searchPlaceholder={t("routingDecision.modelSearch")}
            emptyText={t("routingDecision.modelEmpty")}
            onSelect={(model) => { if (selected) props.onChange({ ...selected, model }); }} />
          {failed && <div className={sx(accountStyles.row)}><p role="alert" className={sx(accountStyles.error)}>{t("routingDecision.loadFailed")}</p>
            <Button variant="quiet" size="sm" onClick={() => setRetry((value) => value + 1)}>{t("routingDecision.retry")}</Button></div>}
        </div>
      </>)}
    <p role="status" className={sx(accountStyles.muted)}>{t(`routingDecision.status.${status.kind}`, status)}</p>
  </div>;
}
