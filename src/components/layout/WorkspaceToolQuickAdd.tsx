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
  const id = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const process = props.kind === "service";
  const noun = process ? "process" : "command";
  if (!open) return <div className={sx(toolStyles.quickAddClosed)}><ActionButton onClick={() => { setError(""); setOpen(true); }}><Plus className={sx(toolStyles.icon)} />Add {noun}</ActionButton>{error ? <p role="status" className={sx(toolStyles.muted)}>{error}</p> : null}</div>;
  return (
    <form className={sx(toolStyles.quickAddForm)} aria-label={`Add ${noun}`} onSubmit={(event) => {
      event.preventDefault();
      if (saving) return;
      if (useAppStore.getState().activeWorkspaceId !== props.workspaceId) {
        setError("Return to this workspace before saving the entry.");
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
            setError("Entry saved. Refresh Workspace tools to see it.");
          });
        } catch {
          setError("The entry could not be saved or refreshed. Your input is kept. Check Workspace tools and retry.");
        } finally {
          setSaving(false);
        }
      })();
    }}>
      <label htmlFor={`${id}-name`} className={sx(toolStyles.fieldLabel)}>Name</label>
      <AdsInput id={`${id}-name`} autoFocus maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={process ? "Dev server" : "Check the project"} />
      <label htmlFor={`${id}-command`} className={sx(toolStyles.fieldLabel)}>Command</label>
      <AdsTextarea id={`${id}-command`} required maxLength={16_000} value={command} onChange={(e) => setCommand(e.target.value)} placeholder={process ? "bun run dev" : "bun run typecheck"} xstyle={toolStyles.commandInput} />
      <p className={sx(toolStyles.muted)}>Saved to this workspace. You choose when to {process ? "start it" : "run it"}. Advanced targets, environment and triggers are available in settings.</p>
      {error ? <p role="alert" className={sx(toolStyles.failed)}>{error}</p> : null}
      <div className={sx(toolStyles.formActions)}>
        <ActionButton weight="quiet" disabled={saving} onClick={() => setOpen(false)}>Cancel</ActionButton>
        <ActionButton type="submit" weight="primary" disabled={saving || !command.trim()}>{saving ? "Saving…" : `Save ${noun}`}</ActionButton>
      </div>
    </form>
  );
}
