import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog } from "@/components/ads/components/Dialog";
import { Button } from "@/components/ads/components/Button";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { MAX_AGENT_DESCRIPTION_CHARS, type AgentDraftResult } from "@/lib/agents/draft-with-ai";
import { blankCustomAgent, duplicateAgent } from "@/lib/agents/library";
import type { AgentConfig } from "@/lib/agents/schema";
import { describeAgent } from "@/lib/agents/agents-view";
import { draftAgentWithAi } from "@/store/agent-draft-runtime";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { AgentAvatar } from "./AgentAvatar";
import { agentStyles } from "./agents.styles";

export type RunAgentDraft = (
  description: string,
  options: { takenIds: Iterable<string>; signal: AbortSignal },
) => Promise<AgentDraftResult>;

/**
 * "New agent". The main path is one sentence about the job (Enter drafts it):
 * the utility model drafts the name, Use when, instructions and access, and the
 * editor opens with that draft. Duplicating a built-in or repository agent, or
 * starting blank, stays one step below. Every path produces an unsaved
 * draft — nothing is stored until the editor saves it. Closing the dialog
 * cancels a draft in progress so a late answer never opens the editor.
 */
export function NewAgentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: readonly AgentConfig[];
  takenIds: readonly string[];
  onCreate: (draft: AgentConfig) => void;
  /** Injected in tests and the dev preview. */
  runDraft?: RunAgentDraft;
}) {
  useTranslation();
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const reset = () => {
    request.current?.abort();
    request.current = null;
    setPending(false);
    setFailure(null);
    setDescription("");
    setName("");
  };
  const create = (draft: AgentConfig) => {
    props.onCreate(draft);
    reset();
    props.onOpenChange(false);
  };
  const submit = async () => {
    if (pending || request.current || !description.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setFailure(null);
    const run = props.runDraft ?? draftAgentWithAi;
    const result = await run(description, { takenIds: props.takenIds, signal: controller.signal }).catch(
      (error: unknown): AgentDraftResult => ({
        ok: false,
        message: error instanceof Error && error.message ? error.message : i18n.t("agents:newAgentDialog.message"),
      }),
    );
    if (controller.signal.aborted) return;
    request.current = null;
    setPending(false);
    if (result.ok) create(result.agent);
    else setFailure(result.message);
  };
  const trimmedName = name.trim();

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset();
        props.onOpenChange(open);
      }}
      width="md"
      title={i18n.t("agents:newAgentDialog.title")}
      description={i18n.t("agents:newAgentDialog.description")}
    >
      <section className={sx(styles.draftPanel)} aria-label={i18n.t("agents:newAgentDialog.ariaLabel")}>
        <Textarea
          label={i18n.t("agents:newAgentDialog.label")}
          placeholder={i18n.t("agents:newAgentDialog.placeholder")}
          value={description}
          maxLength={MAX_AGENT_DESCRIPTION_CHARS}
          autoResize
          maxRows={6}
          size="sm"
          autoFocus
          error={failure ?? undefined}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className={sx(styles.draftActions)}>
          {pending ? (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                request.current?.abort();
                request.current = null;
                setPending(false);
              }}
            >
              {i18n.t("agents:newAgentDialog.newAgentDialog")}</Button>
          ) : null}
          <Button size="sm" disabled={!description.trim() || pending} loading={pending} onClick={() => void submit()}>
            <Sparkles aria-hidden />
            {i18n.t("agents:newAgentDialog.newAgentDialog2")}</Button>
        </div>
      </section>

      {props.templates.length > 0 ? (
        <>
          <p className={sx(styles.listLabel, styles.listLabelFlush)}>{i18n.t("agents:newAgentDialog.newAgentDialog3")}</p>
          <div className={sx(styles.templates)}>
            {props.templates.map((template) => (
              <Button
                key={template.id}
                layout="host"
                variant="quiet"
                press="none"
                xstyle={styles.template}
                onClick={() => {
                  const copy = duplicateAgent(template, props.takenIds);
                  create({ ...copy, ...(trimmedName ? { name: trimmedName } : {}), appearance: template.appearance });
                }}
              >
                <span className={sx(agentStyles.rowLead)}>
                  <AgentAvatar agent={template} size="sm" aria-label={null} />
                  <span className={sx(agentStyles.rowText)}>
                    <span className={sx(styles.templateTitle)}>{template.name}</span>
                    <span className={sx(styles.templateText)}>{describeAgent(template)}</span>
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <p className={sx(styles.listLabel, styles.listLabelFlush)}>{i18n.t("agents:newAgentDialog.newAgentDialog4")}</p>
      <div className={sx(agentStyles.blankRow)}>
        <TextField
          size="sm"
          controlOnly
          aria-label={i18n.t("agents:newAgentDialog.ariaLabel2")}
          value={name}
          placeholder={i18n.t("agents:newAgentDialog.placeholder2")}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!trimmedName}
          onClick={() => create(blankCustomAgent({ name: trimmedName, takenIds: props.takenIds }))}
        >
          {i18n.t("agents:newAgentDialog.newAgentDialog5")}</Button>
      </div>

    </Dialog>
  );
}
