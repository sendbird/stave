import { i18n, useTranslation } from "@/i18n";
import { useMemo, useState } from "react";
import type * as React from "react";
import { Accordion } from "@/components/ads/components/Accordion";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import {
  AGENT_COLOR_CHART_INDEX,
  AGENT_COLOR_LABELS,
} from "@/lib/agents/agent-appearance";
import {
  AGENT_COLORS,
  AGENT_CONFIG_LIMITS,
  AGENT_PERMISSION_LABELS,
  AGENT_PERMISSIONS,
  AGENT_REPORT_SECTIONS,
  AGENT_EFFORT_ORDER,
  AGENT_ROLE_LABELS,
  AGENT_ROLES,
  AGENT_WORKSPACE_LABELS,
  AGENT_WORKSPACES,
  AgentConfigSchema,
  type AgentColor,
  type AgentConfig,
  type AgentModel,
} from "@/lib/agents/schema";
import { TASK_CLASSES } from "@/lib/providers/auto-routing-profile";
import { CLAUDE_SDK_MODEL_OPTIONS, CODEX_MODEL_OPTIONS, listProviderIds } from "@/lib/providers/model-catalog";
import { PROVIDER_LABELS } from "@/lib/agents/provider-labels";
import type { ProviderId } from "@/lib/providers/provider.types";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { agentStyles } from "./agents.styles";
import { TagField } from "./TagField";
import { AgentCanCallField } from "./AgentCanCallField";
import { AgentWorkflowField } from "./AgentWorkflowField";

const REPORT_LABELS: Readonly<Record<(typeof AGENT_REPORT_SECTIONS)[number], string>> = {
  get summary() { return i18n.t("agents:agentEditor.summary"); },
  get changes() { return i18n.t("agents:agentEditor.changes"); },
  get verification() { return i18n.t("agents:agentEditor.verification"); },
  get findings() { return i18n.t("agents:agentEditor.findings"); },
  get sources() { return i18n.t("agents:agentEditor.sources"); },
  get decisions() { return i18n.t("agents:agentEditor.decisions"); },
  get risks() { return i18n.t("agents:agentEditor.risks"); },
  get limitations() { return i18n.t("agents:agentEditor.limitations"); },
};

const MODEL_OPTIONS_BY_PROVIDER: Partial<Record<ProviderId, readonly string[]>> = {
  "claude-code": CLAUDE_SDK_MODEL_OPTIONS,
  codex: CODEX_MODEL_OPTIONS,
};

/** Field-keyed validation issues from `AgentConfigSchema` for inline display. */
function fieldIssues(agent: AgentConfig): Record<string, string> {
  const parsed = AgentConfigSchema.safeParse(agent);
  if (parsed.success) return {};
  const issues: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!issues[key]) issues[key] = issue.message;
  }
  return issues;
}

function FieldError(props: { message?: string }) {
  useTranslation();
  return props.message ? <p className={sx(styles.fieldError)}>{props.message}</p> : null;
}

function Section(props: { title: string; first?: boolean; children: React.ReactNode }) {
  useTranslation();
  return (
    <section
      aria-label={props.title}
      className={sx(agentStyles.section, props.first && agentStyles.sectionFirst)}
    >
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>{props.title}</h3>
      </div>
      {props.children}
    </section>
  );
}

function ColorChooser(props: { value: AgentColor | undefined; onChange: (color: AgentColor) => void }) {
  useTranslation();
  return (
    <div role="group" aria-label={i18n.t("agents:agentEditor.ariaLabel")} className={sx(agentStyles.swatches)}>
      {AGENT_COLORS.map((color) => (
        <Button
          key={color}
          size="sm"
          variant="quiet"
          aria-label={AGENT_COLOR_LABELS[color]}
          aria-pressed={props.value === color}
          xstyle={[agentStyles.swatch, props.value === color && agentStyles.swatchSelected]}
          style={{ "--agent-swatch-color": `var(--ads-chart-${AGENT_COLOR_CHART_INDEX[color]})` } as React.CSSProperties}
          onClick={() => props.onChange(color)}
        />
      ))}
    </div>
  );
}

/** Fields that live under Advanced; a save blocked by one of them opens it. */
const ADVANCED_FIELDS = new Set(["avoidWhen", "skills", "tools", "concurrency", "usableAs", "canCall", "report"]);

/**
 * The agent editor. What most agents need is always visible — Profile (name,
 * colour, Use when), Instructions, Workflow (its stages and check-ins) and
 * How it runs (model, permission, where)
 * — and everything else sits under one collapsed Advanced. Edits a draft copy;
 * `onSave` receives the draft and returns an error message or null.
 * Validation issues from the schema are shown next to their field, and a save
 * blocked by an Advanced field opens Advanced. The parent decides when to
 * render this and whether the draft is new.
 */
export function AgentEditor(props: {
  agent: AgentConfig;
  onDraftChange?: (draft: AgentConfig) => void;
  onSave: (agent: AgentConfig) => string | null;
  onCancel?: () => void;
  saveLabel?: string;
  /** Inside a padded detail tab or a dialog: drop the page padding the standalone editor carries. */
  embedded?: boolean;
}) {
  useTranslation();
  const [draft, setDraftState] = useState(props.agent);
  const [formError, setFormError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState<string[]>([]);
  const setDraft = (next: AgentConfig) => {
    setDraftState(next);
    props.onDraftChange?.(next);
  };
  const issues = useMemo(() => fieldIssues(draft), [draft]);
  const changed = JSON.stringify(draft) !== JSON.stringify(props.agent);
  const providers = listProviderIds();

  const setModel = (model: AgentModel) => setDraft({ ...draft, model });

  return (
    <div className={sx(props.embedded ? agentStyles.pane : styles.editor)}>
      <Section title={i18n.t("agents:agentEditor.title")} first>
        <dl className={sx(styles.properties)}>
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <TextField
              size="sm"
              controlOnly
              aria-label={i18n.t("agents:agentEditor.ariaLabel2")}
              value={draft.name}
              maxLength={AGENT_CONFIG_LIMITS.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <FieldError message={issues.name} />
          </dd>
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor2")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <ColorChooser
              value={draft.appearance?.color}
              onChange={(color) => setDraft({ ...draft, appearance: { color } })}
            />
          </dd>
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor3")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <Textarea
              size="sm"
              aria-label={i18n.t("agents:agentEditor.ariaLabel3")}
              value={draft.description}
              maxLength={AGENT_CONFIG_LIMITS.description}
              autoResize
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <FieldError message={issues.description} />
          </dd>
        </dl>
      </Section>

      <Section title={i18n.t("agents:agentEditor.title2")}>
        <Textarea
          size="sm"
          aria-label={i18n.t("agents:agentEditor.ariaLabel4")}
          value={draft.instructions}
          maxLength={AGENT_CONFIG_LIMITS.instructions}
          autoResize
          onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
        />
        <FieldError message={issues.instructions} />
      </Section>

      <Section title={i18n.t("agents:agentEditor.title3")}>
        <AgentWorkflowField agent={draft} issues={issues} onChange={setDraft} />
      </Section>

      <Section title={i18n.t("agents:agentEditor.title4")}>
        <dl className={sx(styles.properties)}>
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor4")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <Select
              size="sm"
              aria-label={i18n.t("agents:agentEditor.ariaLabel5")}
              value={draft.model.mode}
              options={[
                { value: "auto", label: "Auto-routing" },
                { value: "fixed", label: i18n.t("agents:agentEditor.label") },
              ]}
              onValueChange={(value) =>
                setModel(value === "fixed" ? { mode: "fixed", providerId: providers[0]! } : { mode: "auto" })
              }
            />
          </dd>
          {draft.model.mode === "auto" ? (
            <>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor5")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <Select
                  size="sm"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel6")}
                  value={draft.model.taskClass ?? ""}
                  options={[
                    { value: "", label: i18n.t("agents:agentEditor.label2") },
                    ...TASK_CLASSES.map((value) => ({ value, label: value })),
                  ]}
                  onValueChange={(value) =>
                    setModel({ mode: "auto", taskClass: value ? (String(value) as (typeof TASK_CLASSES)[number]) : undefined })
                  }
                />
              </dd>
            </>
          ) : (
            <>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor6")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <Select
                  size="sm"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel7")}
                  value={draft.model.providerId}
                  options={providers.map((value) => ({ value, label: PROVIDER_LABELS[value] ?? value }))}
                  onValueChange={(value) =>
                    setModel({ mode: "fixed", providerId: String(value) as ProviderId })
                  }
                />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor7")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <Select
                  size="sm"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel8")}
                  value={draft.model.model ?? ""}
                  options={[
                    { value: "", label: i18n.t("agents:agentEditor.label3") },
                    ...(MODEL_OPTIONS_BY_PROVIDER[draft.model.providerId] ?? []).map((value) => ({ value, label: value })),
                  ]}
                  onValueChange={(value) =>
                    setModel({ ...(draft.model as Extract<AgentModel, { mode: "fixed" }>), model: value ? String(value) : undefined })
                  }
                />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor8")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <Select
                  size="sm"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel9")}
                  value={draft.model.effort ?? ""}
                  options={[
                    { value: "", label: i18n.t("agents:agentEditor.label4") },
                    ...AGENT_EFFORT_ORDER.map((value) => ({ value, label: value })),
                  ]}
                  onValueChange={(value) =>
                    setModel({ ...(draft.model as Extract<AgentModel, { mode: "fixed" }>), effort: value ? (String(value) as (typeof AGENT_EFFORT_ORDER)[number]) : undefined })
                  }
                />
              </dd>
            </>
          )}
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor9")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <Select
              size="sm"
              aria-label={i18n.t("agents:agentEditor.ariaLabel10")}
              value={draft.permission}
              options={AGENT_PERMISSIONS.map((value) => ({ value, label: AGENT_PERMISSION_LABELS[value] }))}
              onValueChange={(value) => setDraft({ ...draft, permission: String(value) as AgentConfig["permission"] })}
            />
          </dd>
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.agentEditor10")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <Select
              size="sm"
              aria-label={i18n.t("agents:agentEditor.ariaLabel11")}
              value={draft.workspace}
              options={AGENT_WORKSPACES.map((value) => ({ value, label: AGENT_WORKSPACE_LABELS[value] }))}
              onValueChange={(value) => setDraft({ ...draft, workspace: String(value) as AgentConfig["workspace"] })}
            />
            <FieldError message={issues.workspace} />
          </dd>
        </dl>
      </Section>

      <Accordion
        xstyle={agentStyles.advanced}
        value={advancedOpen}
        onValueChange={(value) => setAdvancedOpen(value as string[])}
        items={[
          {
            value: "advanced",
            title: i18n.t("agents:agentEditor.title5"),
            content: (
              <dl className={sx(styles.properties)}>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <Textarea
                  size="sm"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel12")}
                  value={draft.avoidWhen ?? ""}
                  maxLength={AGENT_CONFIG_LIMITS.avoidWhen}
                  autoResize
                  onChange={(event) => setDraft({ ...draft, avoidWhen: event.target.value || undefined })}
                />
                <FieldError message={issues.avoidWhen} />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content2")}</dt>
              <dd className={sx(styles.propertyValue)}>
              <TagField
                label={i18n.t("agents:agentEditor.label5")}
                values={draft.skills}
                placeholder={i18n.t("agents:agentEditor.placeholder")}
                maxLength={AGENT_CONFIG_LIMITS.skillRef}
                onChange={(skills) => setDraft({ ...draft, skills })}
              />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content3")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <TagField
                  label={i18n.t("agents:agentEditor.label6")}
                  values={draft.tools.allow ?? []}
                  placeholder={i18n.t("agents:agentEditor.placeholder2")}
                  maxLength={AGENT_CONFIG_LIMITS.toolName}
                  onChange={(allow) => setDraft({ ...draft, tools: { ...draft.tools, allow: allow.length ? allow : undefined } })}
                />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content4")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <TagField
                  label={i18n.t("agents:agentEditor.label7")}
                  values={draft.tools.deny ?? []}
                  placeholder={i18n.t("agents:agentEditor.placeholder3")}
                  maxLength={AGENT_CONFIG_LIMITS.toolName}
                  onChange={(deny) => setDraft({ ...draft, tools: { ...draft.tools, deny: deny.length ? deny : undefined } })}
                />
                <FieldError message={issues.tools} />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content5")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <TextField
                  size="sm"
                  controlOnly
                  type="number"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel13")}
                  value={draft.tools.maxTurns != null ? String(draft.tools.maxTurns) : ""}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    setDraft({ ...draft, tools: { ...draft.tools, maxTurns: Number.isFinite(value) ? value : undefined } });
                  }}
                />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content6")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <TextField
                  size="sm"
                  controlOnly
                  type="number"
                  aria-label={i18n.t("agents:agentEditor.ariaLabel14")}
                  value={String(draft.concurrency)}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    setDraft({ ...draft, concurrency: Number.isFinite(value) ? value : draft.concurrency });
                  }}
                />
                <FieldError message={issues.concurrency} />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content7")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <div role="group" aria-label={i18n.t("agents:agentEditor.ariaLabel15")} className={sx(agentStyles.roles)}>
                  {AGENT_ROLES.map((role) => {
                    const checked = draft.usableAs.includes(role);
                    return (
                      <Checkbox
                        key={role}
                        label={AGENT_ROLE_LABELS[role]}
                        checked={checked}
                        disabled={checked && draft.usableAs.length === 1}
                        onCheckedChange={(value) =>
                          setDraft({
                            ...draft,
                            usableAs:
                              value === true
                                ? AGENT_ROLES.filter((candidate) => candidate === role || draft.usableAs.includes(candidate))
                                : draft.usableAs.filter((candidate) => candidate !== role),
                          })
                        }
                      />
                    );
                  })}
                </div>
                <FieldError message={issues.usableAs} />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content8")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <AgentCanCallField
                  agent={draft}
                  onChange={(canCall) => setDraft({ ...draft, canCall })}
                />
                <FieldError message={issues.canCall} />
              </dd>
              <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentEditor.content9")}</dt>
              <dd className={sx(styles.propertyValue)}>
                <div role="group" aria-label={i18n.t("agents:agentEditor.ariaLabel16")} className={sx(agentStyles.roles)}>
                  {AGENT_REPORT_SECTIONS.map((sectionName) => {
                    const checked = draft.report.includes(sectionName);
                    return (
                      <Checkbox
                        key={sectionName}
                        label={REPORT_LABELS[sectionName]}
                        checked={checked}
                        disabled={checked && draft.report.length === 1}
                        onCheckedChange={(value) =>
                          setDraft({
                            ...draft,
                            report:
                              value === true
                                ? AGENT_REPORT_SECTIONS.filter((candidate) => candidate === sectionName || draft.report.includes(candidate))
                                : draft.report.filter((candidate) => candidate !== sectionName),
                          })
                        }
                      />
                    );
                  })}
                </div>
                <FieldError message={issues.report} />
              </dd>
              </dl>
            ),
          },
        ]}
      />

      {formError ? <p className={sx(styles.hint, styles.hintWarning)}>{formError}</p> : null}
      <div className={sx(styles.footer, agentStyles.editorFooter)}>
        <Button
          size="sm"
          disabled={props.onCancel ? false : !changed}
          onClick={() => {
            if (Object.keys(issues).some((key) => ADVANCED_FIELDS.has(key.split(".")[0] ?? key))) {
              setAdvancedOpen(["advanced"]);
            }
            setFormError(props.onSave(draft));
          }}
        >
          {props.saveLabel ?? i18n.t("agents:agentEditor.agentEditor11")}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => (props.onCancel ? props.onCancel() : setDraft(props.agent))}
        >
          {props.onCancel ? i18n.t("agents:agentEditor.agentEditor12") : i18n.t("agents:agentEditor.agentEditor13")}
        </Button>
      </div>
    </div>
  );
}
