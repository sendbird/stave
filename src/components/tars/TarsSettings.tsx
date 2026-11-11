import { useId, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { i18n, useTranslation } from "@/i18n";
import { Select } from "@/components/aui/components/Select";
import { Tabs } from "@/components/aui/components/Tabs";
import { tarsSettingsStyles as layout } from "./tars-settings.styles";
import { Button, Input, Textarea } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { ModelSelector, buildAutoModelSelectorOption, buildModelSelectorOptions, buildModelSelectorValue, buildModelEnrichmentFromCatalogs } from "@/components/ai-elements/model-selector";
import { SearchablePicker } from "@/components/layout/settings-searchable-picker";
import { useProviderModelCatalogs } from "@/lib/providers/use-provider-model-catalogs";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { buildTarsRuntimeHints, tarsAccountSelection } from "@/lib/tars/runtime-hints";
import { useAppStore } from "@/store/app.store";
import type { TarsIdentity } from "@/lib/tars/types";
import { TARS_EXECUTION_PROVIDERS, type TarsConversationSettings } from "@/lib/tars/conversation";
import { listAgents } from "@/lib/agents/library";
import { PROVIDER_LABELS } from "@/lib/agents/provider-labels";
import { tarsStyles as styles } from "./tars.styles";
import { TarsAgentAllowlist } from "./TarsAgentAllowlist";
import { TARS_RETENTION_DAYS, type TarsViewSettings } from "@/lib/tars/clearing";
import { isTarsDefaultInstructions } from "@/lib/tars/default-instructions";
import { tarsClearStyles as clearStyles } from "./tars-clear.styles";
import { TarsAutonomySettings } from "./TarsAutonomySettings";
import { TARS_DEFAULT_AUTONOMY } from "@/lib/tars/autonomy";

const PROVIDERS = TARS_EXECUTION_PROVIDERS;

/** Settings without an optional key, so an absent choice keeps its default instead of saving `undefined`. */
function withoutKey(settings: TarsConversationSettings, key: "executionModel" | "allowedAgentIds" | "neverDo"): TarsConversationSettings {
  const next = { ...settings };
  delete next[key];
  return next;
}

export function TarsSettings({ identity, initial, busy, view: initialView = null, onSave }: {
  identity: TarsIdentity; initial: TarsConversationSettings; busy: boolean;
  /** The view settings; null on bridges without them, which show no retention choice. */
  view?: TarsViewSettings | null;
  onSave: (identity: Pick<TarsIdentity, "name" | "instructions">, settings: TarsConversationSettings, view: TarsViewSettings | null) => Promise<boolean>;
}) {
  const { t } = useTranslation(["shell"]);
  const accountLabel = useId();
  const appSettings = useAppStore((state) => state.settings);
  const availability = useAppStore((state) => state.providerAvailability);
  const profiles = useProviderAccounts((state) => state.profiles);
  useLoadProviderAccounts();
  const [name, setName] = useState(identity.name);
  const defaultInstructions = t("shell:tars.instructionsDefault");
  const [instructions, setInstructions] = useState(() => identity.instructions.trim() ? identity.instructions : defaultInstructions);
  const [settings, setSettings] = useState(initial);
  const [view, setView] = useState(initialView);
  const [saveFailed, setSaveFailed] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const instructionsId = useId();
  // The default in this language fills the field; one in either language counts as the default, so switching languages offers no needless reset.
  const isDefault = isTarsDefaultInstructions(instructions, ["en", "ko"].map((lng) => i18n.t("shell:tars.instructionsDefault", { lng })));
  const empty = !instructions.trim();
  // Show the account that runs: the saved hints, never the app's current default.
  const { accountId, accountKey, runtimeOptions } = useMemo(() => tarsAccountSelection({ providerId: settings.providerId, runtimeHints: settings.runtimeHints }, appSettings), [settings.providerId, settings.runtimeHints, appSettings]);
  const { catalogs } = useProviderModelCatalogs({ enabled: true, runtimeOptions });
  const models = useMemo(() => buildModelSelectorOptions({ providerIds: PROVIDERS, availabilityByProvider: availability,
    modelsByProvider: { codex: catalogs.codex.models, "claude-code": catalogs["claude-code"].models }, enrichmentByModel: buildModelEnrichmentFromCatalogs(catalogs),
  }).filter((option) => option.model && !option.isAuto && option.model !== "auto"), [availability, catalogs]);
  const selected = models.find((option) => option.providerId === settings.providerId && option.model === settings.model);
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const savedAgents = useMemo(() => listAgents({ custom: customAgents, activeOnly: true }).filter((agent) => agent.source !== "builtin"), [customAgents]);
  // Execution defaults to automatic routing; a pin is an explicit choice of model.
  const automatic = useMemo(() => ({ ...buildAutoModelSelectorOption({ providerId: settings.providerId }),
    label: t("shell:tars.execution.auto"), description: t("shell:tars.execution.autoDescription") }), [settings.providerId, t]);
  const pinned = settings.executionModel;
  const executionValue = pinned ? models.find((option) => option.providerId === pinned.providerId && option.model === pinned.model)
    ?? buildModelSelectorValue(pinned) : automatic;
  return <form className={sx(layout.form)} data-tars-settings="" onInvalidCapture={(event) => {
    // Reveal a hidden invalid field before native validation tries to focus it.
    if (event.target !== event.currentTarget.querySelector("input:invalid, textarea:invalid, select:invalid")) return;
    const panel = (event.target as HTMLElement).closest<HTMLElement>("[data-tars-settings-panel]");
    const tab = panel?.dataset.tarsSettingsPanel;
    if (tab && tab !== activeTab) flushSync(() => setActiveTab(tab));
  }} onSubmit={(event) => { event.preventDefault(); if (!busy && name.trim()) void onSave({ name, instructions }, settings, view).then((ok) => setSaveFailed(!ok)); }}>
    {saveFailed ? <p role="alert" className={sx(styles.error, layout.error)}>{t("shell:tars.conversation.failed")}</p> : null}
    <Tabs.Root value={activeTab} onValueChange={(value) => { if (typeof value === "string") setActiveTab(value); }} variant="line" xstyle={layout.tabs}>
      <Tabs.List aria-label={t("shell:tars.settings.tabsLabel")} xstyle={layout.tabList}>
        <Tabs.Tab value="general">{t("shell:tars.settings.general")}</Tabs.Tab>
        <Tabs.Tab value="models">{t("shell:tars.settings.models")}</Tabs.Tab>
        <Tabs.Tab value="work">{t("shell:tars.settings.work")}</Tabs.Tab>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Panel value="general" mount="eager" xstyle={layout.panel} data-tars-settings-panel="general">
        <div className={sx(layout.stack)}>
          <label className={sx(styles.field)}>{t("shell:tars.name")}<Input value={name} maxLength={80} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
          <div className={sx(styles.field)}>
            <div className={sx(clearStyles.fieldHead)}>
              <label htmlFor={instructionsId}>{t("shell:tars.instructions")}</label>
              {/* Defaults fill an empty initial draft; reset and clear remain explicit edits until Save. */}
              {empty || !isDefault ? <Button type="button" variant="ghost" size="2xs" disabled={busy} data-tars-instructions-default={empty ? "use" : "reset"}
                onClick={() => setInstructions(defaultInstructions)}>{t(empty ? "shell:tars.instructionsUseDefault" : "shell:tars.instructionsResetDefault")}</Button> : null}
            </div>
            <Textarea id={instructionsId} value={instructions} placeholder={defaultInstructions} maxLength={8000} rows={6} disabled={busy} onChange={(event) => setInstructions(event.target.value)} />
          </div>
          {empty ? <p className={sx(styles.text)}>{t("shell:tars.instructionsEmptyHint")}</p> : null}
          <p className={sx(styles.text)}>{t("shell:tars.instructionsHint")}</p>
          {view ? <div className={sx(styles.field)} data-tars-retention="">
            <Select label={t("shell:tars.retention.label")} size="sm" value={String(view.retentionDays)} disabled={busy}
              onValueChange={(value) => { if (typeof value === "string") setView({ retentionDays: Number(value) as TarsViewSettings["retentionDays"] }); }}
              options={TARS_RETENTION_DAYS.map((days) => ({ value: String(days), label: days === 0 ? t("shell:tars.retention.never") : t("shell:tars.retention.days", { count: days }) }))} />
            <p className={sx(styles.text)}>{t("shell:tars.retention.hint")}</p>
          </div> : null}
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="models" mount="eager" xstyle={layout.panel} data-tars-settings-panel="models">
        <div className={sx(layout.stack)}>
          <div className={sx(styles.field)}><span>{t("shell:tars.conversation.model")}</span><ModelSelector disabled={busy} value={selected ?? buildModelSelectorValue(settings)} options={models} onSelect={({ selection }) => {
            if (selection.providerId !== "codex" && selection.providerId !== "claude-code") return;
            setSettings({ ...settings, providerId: selection.providerId, model: selection.model, runtimeHints: selection.providerId === settings.providerId ? settings.runtimeHints : buildTarsRuntimeHints(selection.providerId, appSettings) });
          }} triggerAriaLabel={t("shell:tars.conversation.model")} triggerClassName={sx(styles.full)} /></div>
          <div className={sx(styles.field)}><span id={accountLabel}>{t("shell:tars.conversation.accountLabel")}</span><SearchablePicker disabled={busy} labelledBy={accountLabel} value={accountId} options={profiles.filter((profile) => profile.providerId === settings.providerId).map((profile) => ({ value: profile.id, label: profile.label, keywords: [profile.id] }))}
            onSelect={(id) => setSettings({ ...settings, runtimeHints: { ...settings.runtimeHints, [accountKey]: id } })}
            placeholder={t("shell:tars.conversation.accountLabel")} searchPlaceholder={t("shell:tars.conversation.searchAccounts")} emptyText={t("shell:tars.conversation.noAccounts")} triggerXstyle={styles.full} /></div>
          <div className={sx(styles.field)}><span>{t("shell:tars.execution.model")}</span><ModelSelector disabled={busy} value={executionValue} options={[automatic, ...models]} onSelect={({ selection }) => {
            if (selection.isAuto) { setSettings(withoutKey(settings, "executionModel")); return; }
            if (selection.providerId !== "codex" && selection.providerId !== "claude-code") return;
            setSettings({ ...settings, executionModel: { providerId: selection.providerId, model: selection.model } });
          }} triggerAriaLabel={t("shell:tars.execution.model")} triggerClassName={sx(styles.full)} />
            <p className={sx(styles.text)}>{pinned ? t("shell:tars.execution.pinnedHint") : t("shell:tars.execution.autoHint")}</p>
            {pinned && pinned.providerId !== settings.providerId ? <p className={sx(styles.text)}>{t("shell:tars.execution.systemAccount", { provider: PROVIDER_LABELS[pinned.providerId] })}</p> : null}</div>
          <TarsAgentAllowlist agents={savedAgents} value={settings.allowedAgentIds ?? []} disabled={busy}
            onChange={(allowedAgentIds) => setSettings(allowedAgentIds.length ? { ...settings, allowedAgentIds } : withoutKey(settings, "allowedAgentIds"))} />
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="work" mount="eager" xstyle={layout.panel} data-tars-settings-panel="work">
        <div className={sx(layout.stack)}>
          <TarsAutonomySettings level={settings.autonomy ?? TARS_DEFAULT_AUTONOMY} rules={settings.neverDo ?? []} disabled={busy}
            onLevelChange={(autonomy) => setSettings({ ...settings, autonomy })}
            onRulesChange={(neverDo) => setSettings(neverDo.length ? { ...settings, neverDo } : withoutKey(settings, "neverDo"))} />
          <section className={sx(styles.section)} aria-label={t("shell:tars.settings.limits")}>
            <h3 className={sx(layout.heading)}>{t("shell:tars.settings.limits")}</h3>
            <label className={sx(styles.field)}>{t("shell:tars.execution.concurrency")}<Input type="number" min={0} step={1} required disabled={busy}
              value={settings.maxConcurrentResponsibilities ?? 0} onChange={(event) => setSettings({ ...settings, maxConcurrentResponsibilities: event.target.valueAsNumber })} /></label>
            <p className={sx(styles.text)}>{t("shell:tars.execution.concurrencyHint")}</p>
            <label className={sx(styles.field)}>{t("shell:tars.maxTurns")}<Input type="number" min={1} max={100} required disabled={busy} value={settings.maxTurns} onChange={(event) => setSettings({ ...settings, maxTurns: event.target.valueAsNumber })} /></label>
            <p className={sx(styles.text)}>{t("shell:tars.maxTurnsHint")}</p>
          </section>
        </div>
      </Tabs.Panel>
    </Tabs.Root>
    <div className={sx(layout.footer)}><Button type="submit" disabled={busy || !name.trim() || !settings.model}>{t("shell:tars.save")}</Button></div>
  </form>;
}
