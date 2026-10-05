import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
import {
  ApiConnectionModelIdSchema,
  CLAUDE_CODE_EXPERIMENTAL_MODEL_LABEL_KEY,
  CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON_KEY,
  MAX_API_CONNECTION_MODELS,
  formatApiConnectionContext,
  formatApiConnectionPrice,
  isExperimentalApiConnectionModel,
  type ApiConnectionCatalogModel,
  type ApiConnectionKind,
  type ApiConnectionModel,
} from "@/lib/providers/api-connections";
import { apiConnectionCatalogMatches } from "@/lib/providers/api-connection-catalog";
import { accountStyles } from "./provider-accounts.styles";
import { apiConnectionStyles as styles } from "./api-connections.styles";

const RESULT_LIMIT = 40;

function ModelLine({ model, servesClaude, action }: { model: ApiConnectionModel; servesClaude: boolean; action: React.ReactNode }) {
  useTranslation(I18N_NAMESPACES);
  const detail = [model.name && model.name !== model.id ? model.id : "", formatApiConnectionContext(model.contextWindow), formatApiConnectionPrice(model)]
    .filter(Boolean).join(" · ");
  return <li className={sx(styles.modelRow)}>
    <span className={sx(styles.modelText)}>
      <span className={sx(styles.modelName)}>{model.name ?? model.id}</span>
      {detail && <span className={sx(styles.modelDetail)}>{detail}</span>}
    </span>
    {servesClaude && isExperimentalApiConnectionModel("claude-code", model.id) && (
      <span className={sx(styles.experimental)} title={i18n.t(CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON_KEY)}>{i18n.t(CLAUDE_CODE_EXPERIMENTAL_MODEL_LABEL_KEY)}</span>
    )}
    {action}
  </li>;
}

/**
 * The connection's pinned shortlist. Vercel AI Gateway models come from its
 * public catalog, with name, context and price; any gateway can also take a
 * model by ID, which is how a custom gateway lists its models.
 */
export function ApiConnectionModelPicker(props: {
  kind: ApiConnectionKind;
  servesClaude: boolean;
  value: ApiConnectionModel[];
  onChange: (models: ApiConnectionModel[]) => void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const searchId = useId();
  const manualId = useId();
  const [catalog, setCatalog] = useState<ApiConnectionCatalogModel[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const discover = props.kind === "vercel-ai-gateway";
  useEffect(() => {
    if (!discover || catalog) return;
    let cancelled = false;
    void window.api?.apiConnections?.discoverModels().then((result) => {
      if (cancelled) return;
      if (result.ok) setCatalog(result.models);
      else setCatalogError(result.message);
    });
    return () => { cancelled = true; };
  }, [discover, catalog]);
  const pinnedIds = useMemo(() => new Set(props.value.map((model) => model.id)), [props.value]);
  const results = useMemo(() => (catalog ?? [])
    .filter((model) => !pinnedIds.has(model.id) && apiConnectionCatalogMatches(model, query))
    .slice(0, RESULT_LIMIT), [catalog, pinnedIds, query]);
  const full = props.value.length >= MAX_API_CONNECTION_MODELS;
  const pin = (model: ApiConnectionModel) => {
    const { tags: _tags, ...stored } = model as ApiConnectionCatalogModel;
    if (!full && !pinnedIds.has(model.id)) props.onChange([...props.value, stored]);
  };
  const manualIds = manual.split(",").map((id) => id.trim()).filter(Boolean);
  const manualValid = manualIds.length > 0 && manualIds.every((id) => ApiConnectionModelIdSchema.safeParse(id).success);
  const addManual = () => {
    const known = new Map((catalog ?? []).map((model) => [model.id, model]));
    const additions = manualIds.filter((id) => !pinnedIds.has(id)).map((id) => known.get(id) ?? { id });
    props.onChange([...props.value, ...additions].slice(0, MAX_API_CONNECTION_MODELS));
    setManual("");
  };
  return <div className={sx(accountStyles.stack)}>
    <div className={sx(accountStyles.stackTight)}>
      <span className={sx(accountStyles.label)}>{t("settingsConnections:messages.pinnedModels", { count: props.value.length })}</span>
      {props.value.length === 0
        ? <p className={sx(accountStyles.muted)}>{t(discover ? "settingsConnections:messages.pinModelsDiscovery" : "settingsConnections:messages.pinModelsManual")}</p>
        : <ul className={sx(styles.modelList)} aria-label={t("settingsConnections:apiConnectionModelPicker.pinnedModelsVariant12aa6b92")}>
          {props.value.map((model) => <ModelLine key={model.id} model={model} servesClaude={props.servesClaude} action={
            <Button size="xs" variant="quiet" iconOnly aria-label={i18n.t("settingsConnections:apiConnectionModelPicker.unpin", { value1: model.name ?? model.id })}
              onClick={() => props.onChange(props.value.filter((candidate) => candidate.id !== model.id))}>
              <X aria-hidden />
            </Button>} />)}
        </ul>}
      {props.servesClaude && <p className={sx(accountStyles.muted)}>{t("settingsConnections:messages.experimentalExplanation", { reason: i18n.t(CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON_KEY) })}</p>}
    </div>
    {discover && <div className={sx(accountStyles.stackTight)}>
      <label htmlFor={searchId} className={sx(accountStyles.label)}>{t("settingsConnections:apiConnectionModelPicker.findModelsOnVercelAIGateway")}</label>
      <Input id={searchId} placeholder={t("settingsConnections:apiConnectionModelPicker.forExampleKimiGlmSonnetOr")} value={query} onChange={(event) => setQuery(event.target.value)} />
      {catalogError ? <p role="alert" className={sx(accountStyles.error)}>{catalogError}</p>
        : !catalog ? <p className={sx(accountStyles.muted)}>{t("settingsConnections:apiConnectionModelPicker.loadingTheModelList")}</p>
          : results.length === 0 ? <p className={sx(accountStyles.muted)}>{t("settingsConnections:messages.noMatchingModels", { query: query })}</p>
            : <ul className={sx(styles.results)} aria-label={t("settingsConnections:apiConnectionModelPicker.modelsYouCanPin")}>
              {results.map((model) => <ModelLine key={model.id} model={model} servesClaude={props.servesClaude} action={
                <Button size="xs" variant="outline" disabled={full} onClick={() => pin(model)}>{i18n.t("settings:commandPaletteSection.visibility.pin")}</Button>} />)}
            </ul>}
      <p className={sx(accountStyles.muted)}>{t("settingsConnections:apiConnectionModelPicker.codingModelsOnlyLanguageModelsThat")}</p>
    </div>}
    <div className={sx(accountStyles.stackTight)}>
      <label htmlFor={manualId} className={sx(accountStyles.label)}>{t("settingsConnections:apiConnectionModelPicker.addAModelByID")}</label>
      <div className={sx(accountStyles.row)}>
        <Input id={manualId} placeholder={t("settingsConnections:apiConnectionModelPicker.creatorModelForExampleMoonshotaiKimi")} value={manual}
          onChange={(event) => setManual(event.target.value)} xstyle={accountStyles.field} />
        <Button size="sm" variant="outline" disabled={!manualValid || full} onClick={addManual}>{t("settingsConnections:apiConnectionModelPicker.addModel")}</Button>
      </div>
      {manual.trim() && !manualValid && <p className={sx(accountStyles.muted)}>{t("settingsConnections:apiConnectionModelPicker.useTheGatewaySModelIDs")}</p>}
    </div>
  </div>;
}
