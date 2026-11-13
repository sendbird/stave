import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import { Button, Input } from "@/components/ui";
import { RadioGroup } from "@/components/aui/components/RadioGroup";
import { ChevronRight } from "lucide-react";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import {
  TARS_ALWAYS_CONFIRMED, TARS_AUTONOMY_LEVELS, TARS_NEVER_RULE_MAX_CHARS, TARS_NEVER_RULES_MAX, TarsAutonomyLevelSchema, tarsAutonomySummary,
  type TarsAllowRule, type TarsActionKey, type TarsAutonomyLevel, type TarsUnavailableAction,
} from "@/lib/tars/autonomy";
import { tarsStyles as styles } from "./tars.styles";
import { tarsAutonomyStyles as autonomy } from "./tars-autonomy.styles";

/**
 * What a level's table shows, by row. Read from `tarsAutonomySummary`, which
 * reads the same policy function the host admits with, so the table cannot
 * say something the host does not do. "Always asks" is the part of "asks
 * first" that no level changes.
 */
export function tarsAutonomyTable(level: TarsAutonomyLevel): { auto: TarsActionKey[]; confirm: TarsActionKey[]; always: TarsActionKey[]; never: readonly TarsUnavailableAction[] } {
  const summary = tarsAutonomySummary(level);
  return { auto: summary.auto, confirm: summary.confirm.filter((key) => !TARS_ALWAYS_CONFIRMED.has(key)),
    always: summary.confirm.filter((key) => TARS_ALWAYS_CONFIRMED.has(key)), never: summary.never };
}

/** The rules with one added: trimmed, cut to the limit, and never a second copy or one past the maximum. */
export function addTarsNeverRule(rules: readonly string[], text: string): string[] {
  const rule = text.trim().slice(0, TARS_NEVER_RULE_MAX_CHARS).trim();
  if (!rule || rules.length >= TARS_NEVER_RULES_MAX || rules.some((entry) => entry.toLocaleLowerCase() === rule.toLocaleLowerCase())) return [...rules];
  return [...rules, rule];
}

/**
 * How independently Tars acts: one of three levels with a line each, the
 * optional details of what it does on its own, asks first and never does, and
 * the user's own "never do" rules. Nothing here is saved until the form is.
 */
export function TarsAutonomySettings({ level, rules, disabled, onLevelChange, onRulesChange, allowRules = [], onAllowRulesChange }: {
  level: TarsAutonomyLevel;
  rules: readonly string[];
  allowRules?: readonly TarsAllowRule[];
  onAllowRulesChange?: (rules: TarsAllowRule[]) => void;
  disabled?: boolean;
  onLevelChange: (level: TarsAutonomyLevel) => void;
  onRulesChange: (rules: string[]) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const rulesLabel = useId();
  const rulesHint = useId();
  const [draft, setDraft] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const table = tarsAutonomyTable(level);
  const full = rules.length >= TARS_NEVER_RULES_MAX;
  const add = () => {
    const next = addTarsNeverRule(rules, draft);
    if (next.length !== rules.length) onRulesChange(next);
    setDraft("");
  };
  // Enter adds the rule; it must not save the whole settings form.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    add();
  };
  const actions = (keys: readonly TarsActionKey[]) => keys.length ? formatList(keys.map((key) => level !== "careful" && (key === "extend" || key === "publish")
    ? t(`shell:tars.autonomy.conditional.${key}`) : t(`shell:tars.autonomy.action.${key}`))) : t("shell:tars.autonomy.table.none");
  const rows: Array<{ id: "auto" | "confirm" | "always" | "never"; keys: readonly string[]; text: string }> = [
    { id: "auto", keys: table.auto, text: actions(table.auto) },
    { id: "confirm", keys: table.confirm, text: actions(table.confirm) },
    { id: "always", keys: table.always, text: actions(table.always) },
    { id: "never", keys: table.never, text: formatList(table.never.map((key) => t(`shell:tars.autonomy.unavailable.${key}`))) },
  ];
  return <div className={sx(autonomy.group)} data-tars-autonomy={level}>
    <RadioGroup label={t("shell:tars.autonomy.title")} description={t("shell:tars.autonomy.hint")} value={level} disabled={disabled}
      onValueChange={(value) => { const parsed = TarsAutonomyLevelSchema.safeParse(value); if (parsed.success) onLevelChange(parsed.data); }}
      options={TARS_AUTONOMY_LEVELS.map((value) => ({ value, label: t(`shell:tars.autonomy.level.${value}.label`), description: t(`shell:tars.autonomy.level.${value}.description`) }))} />
    <p className={sx(styles.text)}>{t("shell:tars.guide.limit1")}</p>
    <CollapsibleRoot open={detailsOpen} onOpenChange={setDetailsOpen}>
      <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />} data-tars-autonomy-details-toggle="">
        <ChevronRight aria-hidden className={sx(autonomy.chevron, transition.transform, detailsOpen && autonomy.chevronOpen)} />
        {t("shell:tars.autonomy.detailsTitle")}
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted>
        <dl className={sx(autonomy.details)} aria-label={t("shell:tars.autonomy.table.label", { level: t(`shell:tars.autonomy.level.${level}.label`) })} data-tars-autonomy-details="">
          {rows.map((row) => <div key={row.id} data-tars-autonomy-row={row.id} data-tars-autonomy-actions={row.keys.join(",")}>
            <dt className={sx(autonomy.rowTitle)}>{t(`shell:tars.autonomy.table.row.${row.id}`)}</dt>
            <dd className={sx(autonomy.actions)}>{row.text}</dd>
          </div>)}
        </dl>
        <p className={sx(styles.text)}>{t("shell:tars.autonomy.footnote")}</p>
      </CollapsiblePanel>
    </CollapsibleRoot>
    <div className={sx(styles.field)} data-tars-allow-rules="">
      <span>{t("shell:tars.autonomy.allow.title")}</span>
      <p className={sx(styles.text)}>{t("shell:tars.autonomy.allow.hint")}</p>
      {allowRules.length ? <ul className={sx(autonomy.rules)}>{allowRules.map((rule, index) => {
        const label = t("shell:tars.autonomy.allow.rule", { action: t(`shell:tars.autonomy.action.${rule.key}`), repo: rule.repositoryPath ?? t("shell:tars.autonomy.allow.anyRepository") });
        return <li key={`${rule.key}:${rule.repositoryPath}`} className={sx(autonomy.rule)}>
          <span className={sx(autonomy.ruleText)}>{label}</span>
          <Button type="button" variant="ghost" size="2xs" disabled={disabled || !onAllowRulesChange} aria-label={t("shell:tars.autonomy.never.remove", { rule: label })}
            onClick={() => onAllowRulesChange?.(allowRules.filter((_, position) => position !== index))}>{t("shell:tars.autonomy.never.removeShort")}</Button>
        </li>;
      })}</ul> : <p className={sx(styles.text)}>{t("shell:tars.autonomy.allow.empty")}</p>}
    </div>
    <div className={sx(styles.field)} role="group" aria-labelledby={rulesLabel} aria-describedby={rulesHint} data-tars-never-rules="">
      <span id={rulesLabel}>{t("shell:tars.autonomy.never.title")}</span>
      <p id={rulesHint} className={sx(styles.text)}>{t("shell:tars.autonomy.never.hint")}</p>
      {rules.length ? <ul className={sx(autonomy.rules)}>
        {rules.map((rule) => <li key={rule} className={sx(autonomy.rule)} data-tars-never-rule="">
          <span className={sx(autonomy.ruleText)}>{rule}</span>
          <Button type="button" variant="ghost" size="2xs" disabled={disabled} aria-label={t("shell:tars.autonomy.never.remove", { rule })}
            onClick={() => onRulesChange(rules.filter((entry) => entry !== rule))}>{t("shell:tars.autonomy.never.removeShort")}</Button>
        </li>)}
      </ul> : <p className={sx(styles.text)}>{t("shell:tars.autonomy.never.empty")}</p>}
      <div className={sx(autonomy.addRow)}>
        <Input value={draft} maxLength={TARS_NEVER_RULE_MAX_CHARS} disabled={disabled || full} placeholder={t("shell:tars.autonomy.never.placeholder")}
          aria-label={t("shell:tars.autonomy.never.inputLabel")} className={sx(autonomy.addInput)} data-tars-never-rule-input=""
          onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
        <Button type="button" variant="outline" size="sm" disabled={disabled || full || !draft.trim()} xstyle={autonomy.addButton} data-tars-never-rule-add="" onClick={add}>{t("shell:tars.autonomy.never.add")}</Button>
      </div>
      {full ? <p className={sx(styles.text)} role="status">{t("shell:tars.autonomy.never.limit", { count: TARS_NEVER_RULES_MAX })}</p> : null}
    </div>
  </div>;
}
