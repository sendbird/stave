import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge, Textarea } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { RouteFlow } from "@/components/auto-routing";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cloneProfileAsCustom,
  buildStarterRules,
  formatResolvedRouteLabel,
  isStarterProfileId,
  listEligibleRouteModels,
  resolveRoute,
  ROUTE_TIER_LABELS,
  ROUTE_TIERS,
  ROUTER_ROLE_LABELS,
  ROUTER_ROLES,
  STANCE_DESCRIPTIONS,
  STANCE_LABELS,
  STANCES,
  TASK_CLASS_LABELS,
  TASK_CLASSES,
  withStance,
  type AutoRoutingProfile,
  type RouteProviderSelector,
  type RouteRule,
  type RouterRole,
  type RouteTier,
  type Stance,
  type TaskClass,
} from "@/lib/providers/auto-routing-profile";
import {
  formatModelPrice,
  getProviderLabel,
  getSdkModelOptions,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  computeRouterSignals,
  formatAutoRoutingSignalSummary,
  summarizeRouterSignals,
} from "@/store/auto-routing";
import { useAppStore } from "@/store/app.store";
import { sx } from "@/components/ads/utils/stylex";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
  ToggleChipGroup,
} from "./settings-dialog.shared";
import { autoRoutingSectionStyles as styles } from "./settings-dialog-auto-routing-section.styles";
import { SettingsAutoRoutingWizard } from "./settings-dialog-auto-routing-wizard";
import type { UsageSample } from "@/lib/providers/auto-routing-wizard";

export const AUTO_ROUTING_SETTING_FIELD_ID = "settings-field-auto-routing";

const ANY_VALUE = "__any__";
const DEFAULT_VALUE = "__default__";
const PROVIDER_SELECTORS: ReadonlyArray<{ value: RouteProviderSelector; label: string }> = [
  { value: "any-eligible", label: "Same provider as the task" },
  { value: "alternate-provider", label: "The other provider" },
  ...listProviderIds().map((providerId) => ({
    value: providerId,
    label: getProviderLabel({ providerId }),
  })),
];
const EFFORT_VALUES = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
const ROLE_HINTS: Readonly<Record<RouterRole, string>> = {
  primary: "Rules without a role apply here. First match wins, top to bottom.",
  advisor: "Decides the Advisor when its target is left on Auto.",
  worker: "Consulted before the worker preset's own model when the worker is on Auto.",
  delegate: "Seeds the model and effort a delegated child task starts with.",
};

function modelLabel(model: string) {
  const price = formatModelPrice(model);
  const name = toHumanModelName({ model });
  return price ? `${name} (${price})` : name;
}

function nextRuleId(profile: AutoRoutingProfile, role: RouterRole) {
  const taken = new Set(profile.rules.map((entry) => entry.id));
  let index = 1;
  while (taken.has(`${role}-rule-${index}`)) {
    index += 1;
  }
  return `${role}-rule-${index}`;
}

function RuleField(args: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={sx(styles.ruleField, args.wide && styles.ruleFieldWide)}>
      <span className={sx(styles.ruleFieldLabel)}>{args.label}</span>
      {args.children}
    </label>
  );
}

function RuleSelect<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <Select value={args.value} onValueChange={(value) => args.onChange(value as T)}>
      <SelectTrigger className={sx(styles.ruleSelectTrigger)} aria-label={args.ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {args.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RuleRow(args: {
  rule: RouteRule;
  index: number;
  count: number;
  modelsByProvider: Partial<Record<ProviderId, readonly string[]>>;
  onChange: (rule: RouteRule) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { rule } = args;
  const role = rule.when.role ?? "primary";
  const providerForModels: ProviderId | null =
    rule.then.providerId === "any-eligible" || rule.then.providerId === "alternate-provider"
      ? null
      : rule.then.providerId;
  const modelOptions = (
    providerForModels
      ? (args.modelsByProvider[providerForModels] ?? [])
      : listProviderIds().flatMap((providerId) => args.modelsByProvider[providerId] ?? [])
  ).map((model) => ({ value: model, label: modelLabel(model) }));
  const patchWhen = (when: Partial<RouteRule["when"]>) =>
    args.onChange({ ...rule, when: { ...rule.when, ...when } });
  const patchThen = (then: Partial<RouteRule["then"]>) =>
    args.onChange({ ...rule, then: { ...rule.then, ...then } });

  return (
    <div className={sx(styles.ruleCard, !rule.enabled && styles.ruleCardDisabled)}>
      <div className={sx(styles.ruleHeader)}>
        <div className={sx(styles.ruleHeaderLead)}>
          <Switch
            size="sm"
            checked={rule.enabled}
            onCheckedChange={(enabled) => args.onChange({ ...rule, enabled })}
            aria-label={`Enable rule ${rule.id}`}
          />
          <span className={sx(styles.ruleId)} title={rule.id}>
            {rule.id}
          </span>
        </div>
        <div className={sx(styles.ruleActions)}>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            aria-label="Move rule up"
            disabled={args.index === 0}
            onClick={() => args.onMove(-1)}
          >
            <ArrowUp className={sx(styles.icon)} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            aria-label="Move rule down"
            disabled={args.index >= args.count - 1}
            onClick={() => args.onMove(1)}
          >
            <ArrowDown className={sx(styles.icon)} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            aria-label="Delete rule"
            onClick={args.onDelete}
          >
            <Trash2 className={sx(styles.icon)} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className={sx(styles.ruleGrid)}>
        <RuleField label="Role">
          <RuleSelect
            ariaLabel="Rule role"
            value={role}
            onChange={(value) => patchWhen({ role: value })}
            options={ROUTER_ROLES.map((entry) => ({
              value: entry,
              label: ROUTER_ROLE_LABELS[entry],
            }))}
          />
        </RuleField>
        <RuleField label="Task class">
          <RuleSelect
            ariaLabel="Task class condition"
            value={rule.when.taskClass ?? ANY_VALUE}
            onChange={(value) =>
              patchWhen({ taskClass: value === ANY_VALUE ? undefined : (value as TaskClass) })
            }
            options={[
              { value: ANY_VALUE, label: "Any" },
              ...TASK_CLASSES.map((entry) => ({
                value: entry,
                label: TASK_CLASS_LABELS[entry],
              })),
            ]}
          />
        </RuleField>
        <RuleField label="Skill (comma-separated)">
          <DraftInput
            xstyle={styles.ruleInput}
            placeholder="ship, ci-fix"
            value={(rule.when.skill ?? []).join(", ")}
            onCommit={(value) => {
              const skill = value
                .split(",")
                .map((entry) => entry.trim().replace(/^\//, "").toLowerCase())
                .filter(Boolean);
              patchWhen({ skill: skill.length > 0 ? skill : undefined });
            }}
          />
        </RuleField>
        <RuleField label="Complexity">
          <RuleSelect
            ariaLabel="Complexity condition"
            value={rule.when.complexity ?? ANY_VALUE}
            onChange={(value) =>
              patchWhen({
                complexity:
                  value === ANY_VALUE ? undefined : (value as RouteRule["when"]["complexity"]),
              })
            }
            options={[
              { value: ANY_VALUE, label: "Any" },
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </RuleField>
        <RuleField label="Sensitive">
          <RuleSelect
            ariaLabel="Sensitive condition"
            value={
              rule.when.sensitive === undefined ? ANY_VALUE : rule.when.sensitive ? "yes" : "no"
            }
            onChange={(value) =>
              patchWhen({ sensitive: value === ANY_VALUE ? undefined : value === "yes" })
            }
            options={[
              { value: ANY_VALUE, label: "Any" },
              { value: "yes", label: "Only sensitive" },
              { value: "no", label: "Only non-sensitive" },
            ]}
          />
        </RuleField>
        <RuleField label="Usage at least (%)">
          <DraftInput
            xstyle={styles.ruleInput}
            inputMode="numeric"
            placeholder="—"
            value={
              rule.when.budgetUsedAtLeast === undefined ? "" : String(rule.when.budgetUsedAtLeast)
            }
            onCommit={(value) => {
              const parsed = Number.parseInt(value, 10);
              patchWhen({
                budgetUsedAtLeast: Number.isFinite(parsed)
                  ? Math.min(100, Math.max(0, parsed))
                  : undefined,
              });
            }}
          />
        </RuleField>
        <RuleField label="Provider">
          <RuleSelect
            ariaLabel="Target provider"
            value={rule.then.providerId}
            onChange={(value) => patchThen({ providerId: value, model: undefined })}
            options={PROVIDER_SELECTORS}
          />
        </RuleField>
        <RuleField label="Tier">
          <RuleSelect
            ariaLabel="Target tier"
            value={rule.then.tier ?? DEFAULT_VALUE}
            onChange={(value) =>
              patchThen({ tier: value === DEFAULT_VALUE ? undefined : (value as RouteTier) })
            }
            options={[
              { value: DEFAULT_VALUE, label: rule.then.model ? "From model" : "Provider default" },
              ...ROUTE_TIERS.map((entry) => ({
                value: entry,
                label: ROUTE_TIER_LABELS[entry],
              })),
            ]}
          />
        </RuleField>
        <RuleField label="Model">
          <RuleSelect
            ariaLabel="Target model"
            value={rule.then.model ?? DEFAULT_VALUE}
            onChange={(value) =>
              patchThen({ model: value === DEFAULT_VALUE ? undefined : value })
            }
            options={[{ value: DEFAULT_VALUE, label: "Pick by tier" }, ...modelOptions]}
          />
        </RuleField>
        <RuleField label="Effort">
          <RuleSelect
            ariaLabel="Target effort"
            value={rule.then.effort ?? DEFAULT_VALUE}
            onChange={(value) =>
              patchThen({ effort: value === DEFAULT_VALUE ? undefined : value })
            }
            options={[
              { value: DEFAULT_VALUE, label: "Model default" },
              ...EFFORT_VALUES.map((entry) => ({
                value: entry,
                label: `${entry.slice(0, 1).toUpperCase()}${entry.slice(1)}`,
              })),
            ]}
          />
        </RuleField>
        <RuleField label="Reason shown to the user" wide>
          <DraftInput
            xstyle={styles.ruleInput}
            placeholder="Why this route is the right one."
            value={rule.reason}
            onCommit={(value) => args.onChange({ ...rule, reason: value.trim().slice(0, 240) })}
          />
        </RuleField>
      </div>
    </div>
  );
}

/**
 * Settings → Auto (Model Router).
 *
 * The profile is a user-owned table: the starters are read-only seeds and the
 * first edit clones one into `custom`. Every write goes through
 * `updateSettings`, which validates the profile and mirrors its stance and
 * chip lists onto the v1 flags for anything still reading them.
 */
export function SettingsAutoRoutingSection(props: {
  /** Dev previews feed the usage wizard fixture prompts instead of history. */
  wizardSamples?: UsageSample[];
} = {}) {
  const autoRoutingEnabled = useAppStore((state) => state.settings.autoRoutingEnabled);
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  const providerAvailability = useAppStore((state) => state.providerAvailability);
  const rateLimitsSnapshot = useAppStore((state) => state.rateLimitsSnapshot);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const codexModelCatalog = useCodexModelCatalog({ enabled: true, codexBinaryPath });

  const modelsByProvider = useMemo<Partial<Record<ProviderId, readonly string[]>>>(
    () => ({
      "claude-code": getSdkModelOptions({ providerId: "claude-code" }),
      codex:
        codexModelCatalog.models.length > 0
          ? codexModelCatalog.models
          : getSdkModelOptions({ providerId: "codex" }),
      cursor: getSdkModelOptions({ providerId: "cursor" }),
      kiro: getSdkModelOptions({ providerId: "kiro" }),
    }),
    [codexModelCatalog.models],
  );

  const commit = (next: AutoRoutingProfile) =>
    updateSettings({ patch: { autoRoutingProfile: next } });
  const edit = (mutate: (draft: AutoRoutingProfile) => AutoRoutingProfile) =>
    commit(mutate(isStarterProfileId(profile.id) ? cloneProfileAsCustom(profile) : profile));

  const rulesByRole = useMemo(() => {
    const groups: Record<RouterRole, Array<{ rule: RouteRule; index: number }>> = {
      primary: [],
      advisor: [],
      worker: [],
      delegate: [],
    };
    profile.rules.forEach((rule, index) => {
      groups[rule.when.role ?? "primary"].push({ rule, index });
    });
    return groups;
  }, [profile.rules]);

  const [testPrompt, setTestPrompt] = useState("");
  const [testRole, setTestRole] = useState<RouterRole>("primary");
  const [testProvider, setTestProvider] = useState<ProviderId>("claude-code");
  const dryRun = useMemo(() => {
    if (!testPrompt.trim()) {
      return null;
    }
    const { signals } = computeRouterSignals({
      prompt: testPrompt,
      fileContextCount: 0,
      history: [],
      currentProviderId: testProvider,
      profile,
      rateLimitsSnapshot,
      providerAvailability,
    });
    try {
      const route = resolveRoute({ profile, role: testRole, signals });
      return { route, signals, summary: summarizeRouterSignals(signals), error: null };
    } catch (error) {
      return { route: null, signals, summary: summarizeRouterSignals(signals),
        error: error instanceof Error ? error.message : "No eligible route is available." };
    }
  }, [profile, providerAvailability, rateLimitsSnapshot, testPrompt, testProvider, testRole]);


  return (
    <SectionStack>
      <SettingsCard
        id={AUTO_ROUTING_SETTING_FIELD_ID}
        tabIndex={-1}
        title="Auto (Model Router)"
        description="Auto uses a model to understand intent, complexity, risk, and conversation context before choosing an eligible model and effort."
        titleAccessory={
          <Badge variant={autoRoutingEnabled ? "secondary" : "outline"}>
            {autoRoutingEnabled ? "On" : "Off"}
          </Badge>
        }
      >
        <SwitchField
          title="Enable Auto routing"
          description="Global kill switch. Off keeps the composer's Auto option unavailable and every Auto pick falls back to the provider default."
          checked={autoRoutingEnabled}
          onCheckedChange={(checked) => updateSettings({ patch: { autoRoutingEnabled: checked } })}
        />
        <LabeledField layout="stacked"
          title="Preference"
          description="Balance cost and quality while keeping the capability required by the task. Saved rules and model choices are preserved."
        >
          <ChoiceButtons
            columns={3}
            value={profile.stance}
            onChange={(stance: Stance) => commit(withStance(profile, stance))}
            options={STANCES.map((stance) => ({
              value: stance,
              label: STANCE_LABELS[stance],
            }))}
          />
          <p className={sx(styles.stanceNote)}>{STANCE_DESCRIPTIONS[profile.stance]}</p>
        </LabeledField>
      </SettingsCard>
      <SettingsCard
        title="Eligible models"
        description="Which catalog models a route may land on. Empty means every model of that provider. Stance and budget steps stay inside this set."
      >
        <div className={sx(styles.chipGroup)}>
          {(["claude-code", "codex"] as const).map((providerId) => {
            const selected = profile.eligibleModelsByProvider[providerId] ?? [];
            return (
              <LabeledField layout="stacked"
                key={providerId}
                title={`${getProviderLabel({ providerId })} eligible models`}
              >
                <ToggleChipGroup
                  allLabel="All"
                  onSelectAll={() =>
                    edit((draft) => {
                      const { [providerId]: _dropped, ...rest } = draft.eligibleModelsByProvider;
                      return { ...draft, eligibleModelsByProvider: rest };
                    })
                  }
                  selected={selected}
                  onToggle={(model) =>
                    edit((draft) => ({
                      ...draft,
                      eligibleModelsByProvider: {
                        ...draft.eligibleModelsByProvider,
                        [providerId]: selected.includes(model)
                          ? selected.filter((entry) => entry !== model)
                          : [...selected, model],
                      },
                    }))
                  }
                  options={(modelsByProvider[providerId] ?? []).map((model) => ({
                    value: model,
                    label: modelLabel(model),
                  }))}
                />
              </LabeledField>
            );
          })}
        </div>
      </SettingsCard>

      <Accordion>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced settings</AccordionTrigger>
          <AccordionContent>
            <SectionStack>
      <SettingsCard title="Routing controls" description="Model classification, budget thresholds, and routing signals.">
        <LabeledField layout="stacked"
          title="Budget guard"
          description="Reads the tightest account usage window. Past the first threshold every route steps down one effort (models that keep their cache) or one rung; past the second, use the least expensive eligible model that meets the task requirements."
        >
          <div className={sx(styles.thresholdRow)}>
            <div className={sx(styles.thresholdField)}>
              <span className={sx(styles.thresholdLabel)}>Step down at (%)</span>
              <DraftInput
                xstyle={styles.thresholdInput}
                inputMode="numeric"
                aria-label="Step down threshold percent"
                value={String(profile.budgetGuard.stepDownAt)}
                onCommit={(value) => {
                  const parsed = Number.parseInt(value, 10);
                  if (!Number.isFinite(parsed)) return;
                  edit((draft) => ({
                    ...draft,
                    budgetGuard: { ...draft.budgetGuard, stepDownAt: parsed },
                  }));
                }}
              />
            </div>
            <div className={sx(styles.thresholdField)}>
              <span className={sx(styles.thresholdLabel)}>Cheapest at (%)</span>
              <DraftInput
                xstyle={styles.thresholdInput}
                inputMode="numeric"
                aria-label="Cheapest threshold percent"
                value={String(profile.budgetGuard.cheapestAt)}
                onCommit={(value) => {
                  const parsed = Number.parseInt(value, 10);
                  if (!Number.isFinite(parsed)) return;
                  edit((draft) => ({
                    ...draft,
                    budgetGuard: { ...draft.budgetGuard, cheapestAt: parsed },
                  }));
                }}
              />
            </div>
          </div>
        </LabeledField>
        <LabeledField layout="stacked" title="Signals" description="Which inputs the router is allowed to read.">
          <div className={sx(styles.signalsGrid)}>
            <SwitchField
              title="Model intent classification"
              description="Enabled by default. Uses the configured Utility model and waits up to 30 seconds. Failure uses a conservative local route; turning this off uses local rules only."
              checked={profile.signals.classifier}
              onCheckedChange={(classifier) =>
                edit((draft) => ({ ...draft, signals: { ...draft.signals, classifier } }))
              }
            />
            <SwitchField
              title="Skill routing"
              description="Let a leading slash command such as /ship match skill rules."
              checked={profile.signals.skillRouting}
              onCheckedChange={(skillRouting) =>
                edit((draft) => ({ ...draft, signals: { ...draft.signals, skillRouting } }))
              }
            />
            <SwitchField
              title="Budget guard"
              description="Apply the thresholds above."
              checked={profile.signals.budgetGuard}
              onCheckedChange={(budgetGuard) =>
                edit((draft) => ({ ...draft, signals: { ...draft.signals, budgetGuard } }))
              }
            />
            <SwitchField
              title="Safety escalation"
              description="Classify prompts that touch auth, secrets, payments, or production as safety-critical."
              checked={profile.signals.safetyEscalation}
              onCheckedChange={(safetyEscalation) =>
                edit((draft) => ({ ...draft, signals: { ...draft.signals, safetyEscalation } }))
              }
            />
            <SwitchField
              title="Provider switch"
              description="Allow a pinned provider that is unavailable to hand over to another one mid-task."
              checked={profile.signals.providerSwitch}
              onCheckedChange={(providerSwitch) =>
                edit((draft) => ({ ...draft, signals: { ...draft.signals, providerSwitch } }))
              }
            />
          </div>
        </LabeledField>
      </SettingsCard>

      <SettingsAutoRoutingWizard samplesOverride={props.wizardSamples} />

      <SettingsCard
        title="Role table"
        description="Ordered rules per role. Conditions are ANDed; the first enabled match decides the route, and its reason is what the composer shows."
      >
        <Button type="button" variant="quiet" size="sm"
          onClick={() => edit((draft) => ({ ...draft, rules: buildStarterRules() }))}>
          Reset rules to defaults
        </Button>
        {ROUTER_ROLES.map((role) => (
          <div key={role} className={sx(styles.roleGroup)}>
            <div className={sx(styles.roleHeader)}>
              <div>
                <p className={sx(styles.roleTitle)}>{ROUTER_ROLE_LABELS[role]}</p>
                <p className={sx(styles.roleHint)}>{ROLE_HINTS[role]}</p>
              </div>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() =>
                  edit((draft) => ({
                    ...draft,
                    rules: [
                      ...draft.rules,
                      {
                        id: nextRuleId(draft, role),
                        when: { role },
                        then: { providerId: "any-eligible" },
                        reason: "",
                        enabled: true,
                      },
                    ],
                  }))
                }
              >
                <Plus className={sx(styles.icon)} aria-hidden="true" />
                Add rule
              </Button>
            </div>
            {rulesByRole[role].length === 0 ? (
              <p className={sx(styles.emptyRules)}>
                No rules. {role === "worker" ? "The worker preset decides." : "The provider fallback decides."}
              </p>
            ) : (
              rulesByRole[role].map(({ rule, index }, position) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  index={position}
                  count={rulesByRole[role].length}
                  modelsByProvider={modelsByProvider}
                  onChange={(next) =>
                    edit((draft) => ({
                      ...draft,
                      rules: draft.rules.map((entry, entryIndex) =>
                        entryIndex === index ? next : entry,
                      ),
                    }))
                  }
                  onMove={(direction) => {
                    const neighbour = rulesByRole[role][position + direction];
                    if (!neighbour) return;
                    edit((draft) => {
                      const rules = [...draft.rules];
                      const current = rules[index];
                      const other = rules[neighbour.index];
                      if (!current || !other) return draft;
                      rules[index] = other;
                      rules[neighbour.index] = current;
                      return { ...draft, rules };
                    });
                  }}
                  onDelete={() =>
                    edit((draft) => ({
                      ...draft,
                      rules: draft.rules.filter((_, entryIndex) => entryIndex !== index),
                    }))
                  }
                />
              ))
            )}
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        title="Rule preview"
        description="Preview the local rules with heuristic signals. No AI call is made; model classification can produce a different route."
        titleAccessory={<Sparkles className={sx(styles.icon)} aria-hidden="true" />}
      >
        <Textarea
          aria-label="Dry-run prompt"
          className={sx(styles.testerTextarea)}
          placeholder="e.g. Plan the migration of the settings dialog to StyleX"
          value={testPrompt}
          onChange={(event) => setTestPrompt(event.target.value)}
        />
        <div className={sx(styles.testerControls)}>
          <RuleField label="Role">
            <RuleSelect
              ariaLabel="Dry-run role"
              value={testRole}
              onChange={setTestRole}
              options={ROUTER_ROLES.map((role) => ({
                value: role,
                label: ROUTER_ROLE_LABELS[role],
              }))}
            />
          </RuleField>
          <RuleField label="Task currently on">
            <RuleSelect
              ariaLabel="Dry-run current provider"
              value={testProvider}
              onChange={setTestProvider}
              options={listProviderIds().map((providerId) => ({
                value: providerId,
                label: getProviderLabel({ providerId }),
              }))}
            />
          </RuleField>
        </div>
        {dryRun?.error ? <p role="status">{dryRun.error}</p> : null}
        {dryRun?.route ? (
          <dl className={sx(styles.testerResult)}>
            <dt className={sx(styles.testerKey)}>Route</dt>
            <dd className={sx(styles.testerRoute)}>
              {getProviderLabel({ providerId: dryRun.route.providerId })} ·{" "}
              {formatResolvedRouteLabel(dryRun.route)}
              {" · "}
              {formatModelPrice(dryRun.route.model) ?? ROUTE_TIER_LABELS[dryRun.route.tier]}
            </dd>
            <dt className={sx(styles.testerKey)}>Rule</dt>
            <dd className={sx(styles.testerValue)}>{dryRun.route.ruleId ?? "Fallback (no rule matched)"}</dd>
            <dt className={sx(styles.testerKey)}>Reason</dt>
            <dd className={sx(styles.testerValue)}>{dryRun.route.reason}</dd>
            <dt className={sx(styles.testerKey)}>Signals</dt>
            <dd className={sx(styles.testerValue)}>
              {formatAutoRoutingSignalSummary(dryRun.summary)}
            </dd>
            <dt className={sx(styles.testerKey)}>Eligible</dt>
            <dd className={sx(styles.testerValue)}>
              {listEligibleRouteModels({ profile, providerId: dryRun.route.providerId })
                .map((model) => toHumanModelName({ model }))
                .join(", ")}
            </dd>
          </dl>
        ) : null}
        {dryRun?.route ? (
          <RouteFlow
            profile={profile}
            signals={dryRun.signals}
            route={dryRun.route}
            summary={dryRun.summary}
            prompt={testPrompt}
            role={testRole}
            compact
            data-testid="auto-routing-dry-run-flow"
          />
        ) : null}
      </SettingsCard>
            </SectionStack>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionStack>
  );
}
