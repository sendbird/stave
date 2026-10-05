import { i18n, useTranslation } from "@/i18n";
import { toolStyles } from "./workspace-tools.styles";
import { sx } from "../ads/utils/stylex";
import { Textarea as AdsTextarea } from "@/components/ui/textarea";
import { Input as AdsInput } from "@/components/ui/input";
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/system/ActionButton";
import { refreshScriptsRuntime } from "@/lib/workspace-scripts";
import { persistWorkspaceScriptQuickAdd } from "@/lib/workspace-scripts/quick-add";
import type { ScriptKind } from "@/lib/workspace-scripts/types";
import { useAppStore } from "@/store/app.store";

export function WorkspaceToolQuickAdd(props: {
  kind: ScriptKind;
  workspaceId: string;
  workspacePath: string;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const process = props.kind === "service";
  const noun = process ? tI18n("workspace:workspaceToolQuickAdd.process") : tI18n("workspace:workspaceToolQuickAdd.command");
  if (!open) return <div className={sx(toolStyles.quickAddClosed)}><ActionButton onClick={() => { setError(""); setOpen(true); }}><Plus className={sx(toolStyles.icon)} />{tI18n("workspace:workspaceToolQuickAdd.addValue", { noun })}</ActionButton>{error ? <p role="status" className={sx(toolStyles.muted)}>{error}</p> : null}</div>;
  return (
    <form className={sx(toolStyles.quickAddForm)} aria-label={tI18n("workspace:workspaceToolQuickAdd.addValue", { noun: noun })} onSubmit={(event) => {
      event.preventDefault();
      if (saving) return;
      if (useAppStore.getState().activeWorkspaceId !== props.workspaceId) {
        setError(i18n.t("workspace:additionalCopy.message17"));
        return;
      }
      setSaving(true);
      setError("");
      void (async () => {
        try {
          const result = await persistWorkspaceScriptQuickAdd({ ...props, label, command });
          if (!result.ok) { setError(result.message); return; }
          setLabel("");
          setCommand("");
          setOpen(false);
          void refreshScriptsRuntime(props.workspaceId).catch(() => {
            setError(i18n.t("workspace:additionalCopy.message18"));
          });
        } catch {
          setError(i18n.t("workspace:additionalCopy.message19"));
        } finally {
          setSaving(false);
        }
      })();
    }}>
      <label htmlFor={`${id}-name`} className={sx(toolStyles.fieldLabel)}>{tI18n("workspace:workspaceToolQuickAdd.name")}</label>
      <AdsInput id={`${id}-name`} autoFocus maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={process ? tI18n("workspace:workspaceToolQuickAdd.devServer") : tI18n("workspace:workspaceToolQuickAdd.checkTheRepository")} />
      <label htmlFor={`${id}-command`} className={sx(toolStyles.fieldLabel)}>{tI18n("workspace:workspaceToolQuickAdd.command")}</label>
      <AdsTextarea id={`${id}-command`} required maxLength={16_000} value={command} onChange={(e) => setCommand(e.target.value)} placeholder={process ? ("bun run dev" /* i18n-ignore: shell command example */) : ("bun run typecheck" /* i18n-ignore: shell command example */)} xstyle={toolStyles.commandInput} />
      <p className={sx(toolStyles.muted)}>
          {tI18n("workspace:workspaceToolQuickAdd.savedGuidance")}
        </p>
      {error ? <p role="alert" className={sx(toolStyles.failed)}>{error}</p> : null}
      <div className={sx(toolStyles.formActions)}>
        <ActionButton weight="quiet" disabled={saving} onClick={() => setOpen(false)}>{tI18n("workspace:workspaceToolQuickAdd.cancel")}</ActionButton>
        <ActionButton type="submit" weight="primary" disabled={saving || !command.trim()}>{saving ? tI18n("workspace:workspaceToolQuickAdd.saving") : tI18n("workspace:workspaceToolQuickAdd.saveValue", { noun: noun })}</ActionButton>
      </div>
    </form>
  );
}
