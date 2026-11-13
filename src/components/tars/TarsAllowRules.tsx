import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { TARS_ALLOW_RULES_MAX, TARS_ALWAYS_CONFIRMED, sameTarsAllowRule, tarsRepositoryName, type TarsActionKey, type TarsAllowRule } from "@/lib/tars/autonomy";
import type { TarsConversationSettings } from "@/lib/tars/conversation";
import { sx } from "@/components/aui/utils/stylex";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import { TarsRecordList, TarsRecordRow } from "./TarsRecord";

type Configure = (settings: TarsConversationSettings) => Promise<TarsConversationSettings | null>;
type AllowContext = { settings: TarsConversationSettings; busy: boolean; error: boolean; save: (rule: TarsAllowRule, apply?: () => void) => Promise<void>; remove: (rule: TarsAllowRule) => Promise<void>; repositoryOf?: (workspaceId: string) => string | undefined };
const Context = createContext<AllowContext | null>(null);

/** A failed save must never apply the action; duplicates consume no additional slot. */
export async function saveTarsAllowRule(settings: TarsConversationSettings, configure: Configure, rule: TarsAllowRule, apply: () => void): Promise<boolean> {
  const rules = settings.allowRules ?? [];
  if (TARS_ALWAYS_CONFIRMED.has(rule.key) || (rules.length >= TARS_ALLOW_RULES_MAX && !rules.some((entry) => sameTarsAllowRule(entry, rule)))) return false;
  const next = rules.some((entry) => sameTarsAllowRule(entry, rule)) ? rules : [...rules, rule];
  if (!await configure({ ...settings, allowRules: next })) return false;
  apply();
  return true;
}

export function TarsAllowRulesProvider({ settings, configure, busy, repositoryOf, children }: {
  settings: TarsConversationSettings; configure: Configure; busy: boolean; repositoryOf?: AllowContext["repositoryOf"]; children: ReactNode;
}) {
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (locked.current || busy) return;
    locked.current = true; setSaving(true); setError(false);
    try { if (!await operation()) setError(true); } catch { setError(true); }
    finally { locked.current = false; setSaving(false); }
  };
  return <Context value={{ settings, repositoryOf, error, busy: busy || saving,
    save: (rule, apply = () => {}) => mutate(() => saveTarsAllowRule(settings, configure, rule, apply)),
    remove: (rule) => mutate(() => configure({ ...settings, allowRules: (settings.allowRules ?? []).filter((entry) => !sameTarsAllowRule(entry, rule)) })),
  }}>{children}</Context>;
}

export function TarsAlwaysAllowButton({ actionKey, repositoryPath, workspaceId, disabled, onApply }: {
  actionKey: TarsActionKey | null; repositoryPath?: string | null; workspaceId?: string; disabled?: boolean; onApply: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const context = useContext(Context);
  const repository = repositoryPath ?? (workspaceId ? context?.repositoryOf?.(workspaceId) : null);
  if (!context || !actionKey || !repository || TARS_ALWAYS_CONFIRMED.has(actionKey)
    || context.settings.autonomy === "careful" || (context.settings.allowRules?.length ?? 0) >= TARS_ALLOW_RULES_MAX) return null;
  return <Button type="button" size="xs" variant="quiet" disabled={disabled || context.busy} data-tars-always-allow=""
    onClick={() => context.save({ key: actionKey, repositoryPath: repository }, onApply)}>{t("shell:tars.autonomy.allow.button")}</Button>;
}

/** Standing permission records survive reopening; Undo changes only future admission. */
export function TarsAllowRuleRecords() {
  const { t } = useTranslation(["shell"]);
  const context = useContext(Context);
  if (!context) return null;
  return <>{context.error ? <p className={sx(styles.error)} role="alert">{t("shell:tars.autonomy.allow.failed")}</p> : null}
    {context.settings.allowRules?.length ? <TarsRecordList>{context.settings.allowRules.map((rule) => <TarsRecordRow key={`${rule.key}:${rule.repositoryPath}`} state="applied" title={rule.repositoryPath ?? undefined}
    subject={t("shell:tars.autonomy.allow.record", { action: t(`shell:tars.autonomy.action.${rule.key}`), repo: tarsRepositoryName(rule.repositoryPath) ?? t("shell:tars.autonomy.allow.anyRepository") })}
    actions={<Button size="xs" variant="quiet" disabled={context.busy} onClick={() => context.remove(rule)}>{t("shell:tars.autonomy.allow.undo")}</Button>} />)}</TarsRecordList> : null}</>;
}
