import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge, Textarea } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { describeRuleConditions, RouteFlow } from "@/components/auto-routing";
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
  AUTO_ROUTING_OPT_IN_MODELS,
  cloneProfileAsCustom,
  buildRoleTableGroups,
  buildStarterRules,
  formatResolvedRouteLabel,
  isStarterProfileId,
  listEligibleRouteModels,
  previewRouteLevels,
  resolveRoute,
  ROUTE_COMPLEXITIES,
  ROUTE_COMPLEXITY_LABELS,
  ROUTE_TIER_LABELS,
  ROUTE_TIERS,
  ROUTER_ROLE_LABELS,
  SELECTABLE_ROUTER_ROLES,
  STANCE_DESCRIPTIONS,
  STANCE_LABELS,
  STANCES,
  TASK_CLASS_LABELS,
  TASK_CLASSES,
  withStance,
  type AutoRoutingProfile,
  type RouteComplexity,
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
import { useProviderModelCatalogs } from "@/lib/providers/use-provider-model-catalogs";
import {
  computeRouterSignals,
  formatAutoRoutingSignalSummary,
  summarizeRouterSignals,
} from "@/lib/routing/auto-routing";
import { useAppStore } from "@/store/app.store";
import { sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
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

const ADVANCED_SECTION_VALUE = "advanced";
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
  primary: "The task's own turns. Rules without a role apply here.",
  advisor: "No longer used. Second opinions run as read-only subagents, so these saved rules have no effect.",
  worker: "No longer used. Subagents run on their agent's model, so these saved rules have no effect.",
  delegate: "Seeds the model and effort a delegated task starts with.",
};
const EMPTY_ROLE_HINTS: Readonly<Record<(typeof SELECTABLE_ROUTER_ROLES)[number], string>> = {
  primary: "No rules. Each turn uses the provider's default model, adjusted for your preference.",
  delegate: "No rules. A delegated task starts on its provider's default model.",
};
const ROLE_OPTIONS = SELECTABLE_ROUTER_ROLES.map((role) => ({ value: role, label: ROUTER_ROLE_LABELS[role] }));

/** `Frontier · High effort` (plus the provider when it is pinned): what a rule picks. */
function describeRuleTarget(rule: RouteRule) {
  const provider = rule.then.providerId === "any-eligible"
    ? null
    : PROVIDER_SELECTORS.find((entry) => entry.value === rule.then.providerId)?.label ?? rule.then.providerId;
  const target = rule.then.model
    ? toHumanModelName({ model: rule.then.model })
    : rule.then.tier
      ? ROUTE_TIER_LABELS[rule.then.tier]
      : "Provider default";
  const effort = rule.then.effort
    ? `${rule.then.effort.slice(0, 1).toUpperCase()}${rule.then.effort.slice(1)} effort`
    : null;
  return [provider, target, effort].filter(Boolean).join(" · ");
}

/** One line for a stored rule that can no longer be edited: what it would have picked. */
function describeLegacyRule(rule: RouteRule) {
  return [describeRuleTarget(rule), rule.reason || null].filter(Boolean).join(" · ");
}

/** `Opus 5.5 · $4 / $20`: the vendor prefix repeats the provider heading. */
function modelLabel(model: string) {
  const price = formatModelPrice(model);
  const name = toHumanModelName({ model }).replace(/^Claude /, "");
  return price ? `${name} · ${price}` : name;
}

const MANAGED_PROVIDERS = ["claude-code", "codex"] as const;

/**
 * What each level runs on under the current preference and allowed models,
 * per provider. Recomputed from the same resolver the composer uses, so the
 * table is the routing policy rather than a description of it.
 */
function RoutingLevelsTable(args: {
  profile: AutoRoutingProfile;
  modelsByProvider: Partial<Record<ProviderId, readonly string[]>>;
}) {
  const previews = useMemo(
    () =>
      MANAGED_PROVIDERS.map((providerId) => ({
        providerId,
        levels: previewRouteLevels({
          profile: args.profile,
          providerId,
          runtimeModels: args.modelsByProvider[providerId],
        }),
      })),
    [args.modelsByProvider, args.profile],
  );
  return (
    <table className={sx(styles.levelTable)} data-testid="auto-routing-levels">
      <thead>
        <tr>
          <th scope="col" className={sx(styles.levelHead)}>Level</th>
          {previews.map(({ providerId }) => (
            <th key={providerId} scope="col" className={sx(styles.levelHead)}>
              {getProviderLabel({ providerId })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROUTE_COMPLEXITIES.map((complexity, rowIndex) => {
          const level = previews[0]?.levels[rowIndex]?.level;
          return (
            <tr key={complexity} className={sx(styles.levelRow)}>
              <th scope="row" className={sx(styles.levelName)}>
                <span className={sx(styles.levelLabel)}>{ROUTE_COMPLEXITY_LABELS[complexity]}</span>
                <span className={sx(styles.levelDescription)}>{level?.description}</span>
              </th>
              {previews.map(({ providerId, levels }) => {
                const entry = levels[rowIndex];
                return (
                  <td key={providerId} className={sx(styles.levelCell)}>
                    {entry?.route ? (
                      <span className={sx(styles.levelRoute)}>{formatResolvedRouteLabel(entry.route)}</span>
                    ) : (
                      <span className={sx(styles.levelMissing)} title={entry?.error ?? undefined}>
                        No allowed model
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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
  const [expanded, setExpanded] = useState(false);
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
          <span className={sx(styles.ruleSummary)}>
            <span className={sx(styles.ruleWhen)}>
              {describeRuleConditions(rule).join(" · ")}
            </span>
            <span className={sx(styles.ruleArrow)} aria-hidden="true">→</span>
            <span className={sx(styles.ruleThen)}>{describeRuleTarget(rule)}</span>
          </span>
        </div>
        <div className={sx(styles.ruleActions)}>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            aria-label={expanded ? `Close rule ${rule.id}` : `Edit rule ${rule.id}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            <Pencil className={sx(styles.icon)} aria-hidden="true" />
          </Button>
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
      {expanded ? (
        <div className={sx(styles.ruleGrid)}>
          <RuleField label="Role">
            <RuleSelect
              ariaLabel="Rule role"
              value={role}
              onChange={(value) => patchWhen({ role: value })}
              options={ROLE_OPTIONS}
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
              placeholder="ship, review"
              value={(rule.when.skill ?? []).join(", ")}
              onCommit={(value) => {
                const skill = value
                  .split(",")
                  .map((entry) => entry.trim().replace(/^[/$]/, "").toLowerCase())
                  .filter(Boolean);
                patchWhen({ skill: skill.length > 0 ? skill : undefined });
              }}
            />
          </RuleField>
          <RuleField label="Level">
            <RuleSelect
              ariaLabel="Level condition"
              value={rule.when.complexity ?? ANY_VALUE}
              onChange={(value) =>
                patchWhen({
                  complexity: value === ANY_VALUE ? undefined : (value as RouteComplexity),
                })
              }
              options={[
                { value: ANY_VALUE, label: "Any" },
                ...ROUTE_COMPLEXITIES.map((entry) => ({
                  value: entry,
                  label: ROUTE_COMPLEXITY_LABELS[entry],
                })),
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
          <p className={sx(styles.ruleIdNote)}>Rule id: {rule.id}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A stored rule for a role nothing routes any more: shown as saved, removable, not editable. */
function LegacyRuleRow(args: { rule: RouteRule; onDelete: () => void }) {
  return (
    <div className={sx(styles.ruleCard, styles.ruleCardDisabled)}>
      <div className={sx(styles.ruleHeader)}>
        <div className={sx(styles.ruleHeaderLead)}>
          <span className={sx(styles.ruleId)} title={args.rule.id}>
            {args.rule.id}
          </span>
        </div>
        <div className={sx(styles.ruleActions)}>
          <Button type="button" variant="quiet" size="sm" aria-label={`Delete rule ${args.rule.id}`} onClick={args.onDelete}>
            <Trash2 className={sx(styles.icon)} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className={sx(styles.legacyRuleSummary)}>{describeLegacyRule(args.rule)}</p>
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const autoRoutingEnabled = useAppStore((state) => state.settings.autoRoutingEnabled);
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  const cursorBinaryPath = useAppStore((state) => state.settings.cursorBinaryPath);
  const kiroBinaryPath = useAppStore((state) => state.settings.kiroBinaryPath);
  const providerAvailability = useAppStore((state) => state.providerAvailability);
  const rateLimitsSnapshot = useAppStore((state) => state.rateLimitsSnapshot);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const catalogOptions = useMemo(() => ({ codexBinaryPath, cursorBinaryPath, kiroBinaryPath }), [codexBinaryPath, cursorBinaryPath, kiroBinaryPath]);
  const { catalogs } = useProviderModelCatalogs({ enabled: true, runtimeOptions: catalogOptions });
  const codexModelCatalog = catalogs.codex;

  const modelsByProvider = useMemo<Partial<Record<ProviderId, readonly string[]>>>(
    () => ({
      "claude-code": getSdkModelOptions({ providerId: "claude-code" }),
      codex:
        codexModelCatalog.models.length > 0
          ? codexModelCatalog.models
          : getSdkModelOptions({ providerId: "codex" }),
      cursor: catalogs.cursor.models,
      kiro: catalogs.kiro.models,
    }),
    [codexModelCatalog.models, catalogs.cursor.models, catalogs.kiro.models],
  );

  const commit = (next: AutoRoutingProfile) =>
    updateSettings({ patch: { autoRoutingProfile: next } });
  const edit = (mutate: (draft: AutoRoutingProfile) => AutoRoutingProfile) =>
    commit(mutate(isStarterProfileId(profile.id) ? cloneProfileAsCustom(profile) : profile));

  const roleGroups = useMemo(() => buildRoleTableGroups(profile.rules), [profile.rules]);

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
        description="Auto reads each request, rates how much reasoning it needs, and runs it on the matching model and effort."
        titleAccessory={
          <Badge variant={autoRoutingEnabled ? "secondary" : "outline"}>
            {autoRoutingEnabled ? "On" : "Off"}
          </Badge>
        }
      >
        <SwitchField
          title="Enable Auto routing"
          description="Off hides the composer's Auto option; turns use the model you pick."
          checked={autoRoutingEnabled}
          onCheckedChange={(checked) => updateSettings({ patch: { autoRoutingEnabled: checked } })}
        />
        <LabeledField layout="stacked"
          title="Preference"
          description="Sets the effort inside each level's range. The model for a level stays the same."
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
        title="Routing levels"
        description="Most work is Standard. Expert and Extreme run only when the classifier finds explicit evidence for them. Sensitive changes route as Complex or higher."
      >
        <RoutingLevelsTable profile={profile} modelsByProvider={modelsByProvider} />
      </SettingsCard>
      <SettingsCard
        title="Allowed models"
        description="Models Auto may pick. Default allows every model except Claude Haiku 4.5. A level with no allowed model hands the turn to the other provider."
      >
        <div className={sx(styles.chipGroup)}>
          {MANAGED_PROVIDERS.map((providerId) => {
            const selected = profile.eligibleModelsByProvider[providerId] ?? [];
            return (
              <LabeledField layout="stacked"
                key={providerId}
                title={getProviderLabel({ providerId })}
              >
                <ToggleChipGroup
                  allLabel="Default"
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
                    ...(AUTO_ROUTING_OPT_IN_MODELS.has(model)
                      ? { description: "Not in Default. Select it to let Auto use it." }
                      : {}),
                  }))}
                />
              </LabeledField>
            );
          })}
        </div>
      </SettingsCard>

      {/*
        Controlled so the chevron can follow the open state from here. ADS's
        shared rotation rule keys off `data-open` on the trigger, but Base UI
        puts `data-open` on the header and gives the trigger `data-panel-open`,
        so that rule never matches. Owning the state locally keeps the fix out
        of the vendored ADS source.
      */}
      <Accordion
        value={advancedOpen ? [ADVANCED_SECTION_VALUE] : []}
        onValueChange={(value) =>
          setAdvancedOpen(
            (value as readonly unknown[]).includes(ADVANCED_SECTION_VALUE),
          )
        }
      >
        <AccordionItem value={ADVANCED_SECTION_VALUE}>
          <AccordionTrigger className={sx(styles.advancedTrigger)}>
            <span className={sx(styles.advancedTitle)}>Advanced settings</span>
            <ChevronDown
              aria-hidden
              className={sx(
                styles.advancedChevron,
                transition.transform,
                advancedOpen && styles.advancedChevronOpen,
              )}
            />
          </AccordionTrigger>
          <AccordionContent className={sx(styles.advancedPanel)}>
            <SectionStack>
      <SettingsCard title="Classification and signals" description="What Auto may read before it picks a route.">
        <div className={sx(styles.signalsList)}>
          <SwitchField
            title="Model classification"
            description="The Utility model rates intent, level, and risk (up to 30 seconds). Off, or on failure, Auto uses local keyword rules, which never pick Expert or Extreme."
            checked={profile.signals.classifier}
            onCheckedChange={(classifier) =>
              edit((draft) => ({ ...draft, signals: { ...draft.signals, classifier } }))
            }
          />
          <SwitchField
            title="Safety escalation"
            description="Changes to auth, secrets, payments, or production data route as Complex work or higher."
            checked={profile.signals.safetyEscalation}
            onCheckedChange={(safetyEscalation) =>
              edit((draft) => ({ ...draft, signals: { ...draft.signals, safetyEscalation } }))
            }
          />
          <SwitchField
            title="Skill routing"
            description="A prompt that starts with a skill, such as /ship or $ship, can match rules that name it."
            checked={profile.signals.skillRouting}
            onCheckedChange={(skillRouting) =>
              edit((draft) => ({ ...draft, signals: { ...draft.signals, skillRouting } }))
            }
          />
          <SwitchField
            title="Provider switch"
            description="Let Auto move a task to the other provider by preference. A provider that cannot run the turn hands over either way."
            checked={profile.signals.providerSwitch}
            onCheckedChange={(providerSwitch) =>
              edit((draft) => ({ ...draft, signals: { ...draft.signals, providerSwitch } }))
            }
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Usage budget" description="Reads the tightest account usage window. Never routes below a level's minimum model.">
        <SwitchField
          title="Budget guard"
          description="Lower effort, then the model, as account usage climbs."
          checked={profile.signals.budgetGuard}
          onCheckedChange={(budgetGuard) =>
            edit((draft) => ({ ...draft, signals: { ...draft.signals, budgetGuard } }))
          }
        />
        <div className={sx(styles.thresholdRow)}>
          <label className={sx(styles.thresholdField)}>
            <span className={sx(styles.thresholdLabel)}>Save from (% used)</span>
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
            <span className={sx(styles.thresholdHint)}>One effort step lower, or one model lower.</span>
          </label>
          <label className={sx(styles.thresholdField)}>
            <span className={sx(styles.thresholdLabel)}>Cheapest from (% used)</span>
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
            <span className={sx(styles.thresholdHint)}>The least expensive model the level allows.</span>
          </label>
        </div>
      </SettingsCard>

      <SettingsAutoRoutingWizard samplesOverride={props.wizardSamples} />

      <SettingsCard
        title="Rules"
        description="The levels above are these rules. First enabled match wins, top to bottom; every condition in a rule must hold. Its reason is shown on the route line."
        titleAccessory={
          <Button type="button" variant="quiet" size="sm"
            onClick={() => edit((draft) => ({ ...draft, rules: buildStarterRules() }))}>
            Reset to defaults
          </Button>
        }
      >
        {roleGroups.map(({ role, legacy, rules }) => {
          const deleteRule = (index: number) =>
            edit((draft) => ({
              ...draft,
              rules: draft.rules.filter((_, entryIndex) => entryIndex !== index),
            }));
          return (
            <div key={role} className={sx(styles.roleGroup)}>
              <div className={sx(styles.roleHeader)}>
                <div>
                  <p className={sx(styles.roleTitle)}>{ROUTER_ROLE_LABELS[role]}</p>
                  <p className={sx(styles.roleHint)}>{ROLE_HINTS[role]}</p>
                </div>
                {legacy ? null : (
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
                )}
              </div>
              {legacy ? (
                rules.map(({ rule, index }) => (
                  <LegacyRuleRow key={rule.id} rule={rule} onDelete={() => deleteRule(index)} />
                ))
              ) : rules.length === 0 ? (
                <p className={sx(styles.emptyRules)}>
                  {EMPTY_ROLE_HINTS[role as keyof typeof EMPTY_ROLE_HINTS]}
                </p>
              ) : (
                rules.map(({ rule, index }, position) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    index={position}
                    count={rules.length}
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
                      const neighbour = rules[position + direction];
                      if (!neighbour) return;
                      edit((draft) => {
                        const nextRules = [...draft.rules];
                        const current = nextRules[index];
                        const other = nextRules[neighbour.index];
                        if (!current || !other) return draft;
                        nextRules[index] = other;
                        nextRules[neighbour.index] = current;
                        return { ...draft, rules: nextRules };
                      });
                    }}
                    onDelete={() => deleteRule(index)}
                  />
                ))
              )}
            </div>
          );
        })}
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
              options={ROLE_OPTIONS}
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
