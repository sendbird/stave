import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { apiConnectionCatalogMatches } from "@/lib/providers/api-connection-catalog";
import type { ApiConnectionCatalogModel } from "@/lib/providers/api-connections";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import type { RoutingDecisionConfig } from "@/lib/providers/routing-decision";
import { getUtilityInferenceCapability, toHumanModelName } from "@/lib/providers/model-catalog";
import { accountStyles } from "./provider-accounts.styles";

/** Shared by global Auto settings and an Agent's optional Decision override. */
export function RoutingDecisionField(props: {
  value?: RoutingDecisionConfig;
  onChange: (value: RoutingDecisionConfig | undefined) => void;
  allowInherit?: boolean;
}) {
  const { t } = useTranslation("settingsProviders");
  useLoadProviderAccounts();
  const profiles = useProviderAccounts((state) => state.profiles);
  const connections = useMemo(() => [...new Map(profiles.filter((profile) => profile.apiConnection?.kind === "vercel-ai-gateway")
    .map((profile) => [profile.id, profile])).values()], [profiles]);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const mode = gatewayOpen ? "gateway" : props.value?.mode === "native" ? props.value.providerId
    : props.value?.mode ?? (props.allowInherit ? "inherit" : "automatic");
  const selected = props.value?.mode === "gateway" ? props.value : undefined;
  const [catalog, setCatalog] = useState<ApiConnectionCatalogModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mode !== "gateway") return;
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
  }, [mode, retry]);
  const chooseMode = (value: string) => {
    setGatewayOpen(false);
    if (value === "inherit") props.onChange(undefined);
    else if (value === "automatic") props.onChange({ mode: "automatic" });
    else if (value === "codex" || value === "claude-code") props.onChange({ mode: "native", providerId: value });
    else if (value === "gateway") {
      setGatewayOpen(true);
      if (connections[0]) props.onChange({ mode: "gateway", connectionId: connections[0].id, model: selected?.model ?? "typesafe-ai/jev" });
    }
  };
  const connectionOptions = connections.filter((entry) => `${entry.id} ${entry.label}`.toLowerCase().includes(connectionSearch.trim().toLowerCase()))
    .map((entry) => ({ value: entry.id, label: entry.label }));
  const matchingConnections = connectionOptions.length;
  const currentConnection = connections.find((entry) => entry.id === selected?.connectionId);
  if (currentConnection && !connectionOptions.some((entry) => entry.value === currentConnection.id)) connectionOptions.unshift({ value: currentConnection.id, label: currentConnection.label });
  const models = catalog.filter((entry) => apiConnectionCatalogMatches(entry, modelSearch));
  const modelOptions = models.map((entry) => ({ value: entry.id, label: `${entry.name} · ${entry.id}` }));
  if (selected && !modelOptions.some((entry) => entry.value === selected.model)) {
    const currentModel = catalog.find((entry) => entry.id === selected.model);
    modelOptions.unshift({ value: selected.model, label: currentModel ? `${currentModel.name} · ${currentModel.id}` : selected.model });
  }
  return <div className={sx(accountStyles.stack)}>
    <Select aria-label={t("routingDecision.title")} size="sm" value={mode} onValueChange={(value) => chooseMode(String(value))}
      options={[
        ...(props.allowInherit ? [{ value: "inherit", label: t("routingDecision.inherit") }] : []),
        { value: "automatic", label: t("routingDecision.automatic") },
        ...(["codex", "claude-code"] as const).map((providerId) => ({ value: providerId, label: toHumanModelName({ model: getUtilityInferenceCapability({ providerId }).defaultModel }) })),
        { value: "gateway", label: /* i18n-ignore: external service name */ "Vercel AI Gateway" },
      ]} />
    <p className={sx(accountStyles.muted)}>{t("routingDecision.fallback")}</p>
    {mode === "gateway" && <>
      {connections.length === 0 ? <p role="status" className={sx(accountStyles.attention)}>{t("routingDecision.noConnections")}</p> : <>
        <TextField size="sm" label={t("routingDecision.searchConnections")} value={connectionSearch} onChange={(event) => setConnectionSearch(event.target.value)} />
        <Select size="sm" aria-label={t("routingDecision.connection")} value={selected?.connectionId ?? ""} options={connectionOptions}
          onValueChange={(connectionId) => props.onChange({ mode: "gateway", connectionId: String(connectionId), model: selected?.model ?? "typesafe-ai/jev" })} />
        {matchingConnections === 0 && <p role="status" className={sx(accountStyles.muted)}>{t("routingDecision.noMatches")}</p>}
        {selected && !connections.some((entry) => entry.id === selected.connectionId) && <p role="status" className={sx(accountStyles.attention)}>{t("routingDecision.missingConnection")}</p>}
      </>}
      <TextField size="sm" label={t("routingDecision.searchModels")} placeholder={t("routingDecision.modelPlaceholder")} value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} />
      <Select size="sm" aria-label={t("routingDecision.model")} value={selected?.model ?? ""} options={modelOptions}
        disabled={!selected} loading={loading} loadingText={t("routingDecision.loading")} emptyText={t("routingDecision.noMatches")}
        onValueChange={(model) => { if (selected) props.onChange({ ...selected, model: String(model) }); }} />
      {!loading && !failed && models.length === 0 && <p role="status" className={sx(accountStyles.muted)}>{t("routingDecision.noMatches")}</p>}
      {failed && <div className={sx(accountStyles.row)}><p role="alert" className={sx(accountStyles.error)}>{t("routingDecision.loadFailed")}</p>
        <Button variant="quiet" size="sm" onClick={() => setRetry((value) => value + 1)}>{t("routingDecision.retry")}</Button></div>}
    </>}
  </div>;
}
