import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
import {
  ApiConnectionModelIdSchema,
  CLAUDE_CODE_EXPERIMENTAL_MODEL_LABEL,
  CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON,
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
  const detail = [model.name && model.name !== model.id ? model.id : "", formatApiConnectionContext(model.contextWindow), formatApiConnectionPrice(model)]
    .filter(Boolean).join(" · ");
  return <li className={sx(styles.modelRow)}>
    <span className={sx(styles.modelText)}>
      <span className={sx(styles.modelName)}>{model.name ?? model.id}</span>
      {detail && <span className={sx(styles.modelDetail)}>{detail}</span>}
    </span>
    {servesClaude && isExperimentalApiConnectionModel("claude-code", model.id) && (
      <span className={sx(styles.experimental)} title={CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON}>{CLAUDE_CODE_EXPERIMENTAL_MODEL_LABEL}</span>
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
      <span className={sx(accountStyles.label)}>Pinned models ({props.value.length})</span>
      {props.value.length === 0
        ? <p className={sx(accountStyles.muted)}>No models yet. Pin the models this connection offers in the model picker{discover ? ", from the list below or" : ""} by ID.</p>
        : <ul className={sx(styles.modelList)} aria-label="Pinned models">
          {props.value.map((model) => <ModelLine key={model.id} model={model} servesClaude={props.servesClaude} action={
            <Button size="xs" variant="quiet" iconOnly aria-label={`Unpin ${model.name ?? model.id}`}
              onClick={() => props.onChange(props.value.filter((candidate) => candidate.id !== model.id))}>
              <X aria-hidden />
            </Button>} />)}
        </ul>}
      {props.servesClaude && <p className={sx(accountStyles.muted)}>
        Claude Code runs background requests and subagents on the first pinned Claude model. Other models are experimental in Claude Code: {CLAUDE_CODE_EXPERIMENTAL_MODEL_REASON}
      </p>}
    </div>
    {discover && <div className={sx(accountStyles.stackTight)}>
      <label htmlFor={searchId} className={sx(accountStyles.label)}>Find models on Vercel AI Gateway</label>
      <Input id={searchId} placeholder="For example, kimi, glm, sonnet or deepseek" value={query} onChange={(event) => setQuery(event.target.value)} />
      {catalogError ? <p role="alert" className={sx(accountStyles.error)}>{catalogError}</p>
        : !catalog ? <p className={sx(accountStyles.muted)}>Loading the model list…</p>
          : results.length === 0 ? <p className={sx(accountStyles.muted)}>No models match “{query}”. Clear the search, or add the model by ID below.</p>
            : <ul className={sx(styles.results)} aria-label="Models you can pin">
              {results.map((model) => <ModelLine key={model.id} model={model} servesClaude={props.servesClaude} action={
                <Button size="xs" variant="outline" disabled={full} onClick={() => pin(model)}>Pin</Button>} />)}
            </ul>}
      <p className={sx(accountStyles.muted)}>Coding models only: language models that can use tools. Prices are the gateway's list price per 1M input / output tokens.</p>
    </div>}
    <div className={sx(accountStyles.stackTight)}>
      <label htmlFor={manualId} className={sx(accountStyles.label)}>Add a model by ID</label>
      <div className={sx(accountStyles.row)}>
        <Input id={manualId} placeholder="creator/model, for example moonshotai/kimi-k3" value={manual}
          onChange={(event) => setManual(event.target.value)} xstyle={accountStyles.field} />
        <Button size="sm" variant="outline" disabled={!manualValid || full} onClick={addManual}>Add model</Button>
      </div>
      {manual.trim() && !manualValid && <p className={sx(accountStyles.muted)}>Use the gateway's model IDs, separated by commas, such as anthropic/claude-sonnet-5.</p>}
    </div>
  </div>;
}
