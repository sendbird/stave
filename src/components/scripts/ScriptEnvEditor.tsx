import { Plus, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import type { ScriptEditorEnvRow } from "@/lib/workspace-scripts/editor";
import { envEditorStyles } from "./script-env-editor.styles";

export function ScriptEnvEditor(props: {
  rows: ScriptEditorEnvRow[];
  onChange: (rows: ScriptEditorEnvRow[]) => void;
}) {
  const update = (index: number, patch: Partial<ScriptEditorEnvRow>) => {
    props.onChange(
      props.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };
  const remove = (index: number) => {
    props.onChange(props.rows.filter((_, rowIndex) => rowIndex !== index));
  };
  const add = () => {
    props.onChange([...props.rows, { key: "", value: "" }]);
  };

  return (
    <div className={sx(envEditorStyles.root)}>
      <span className={sx(envEditorStyles.label)}>Environment</span>
      {props.rows.length === 0 ? (
        <p className={sx(envEditorStyles.empty)}>No environment overrides.</p>
      ) : (
        <div className={sx(envEditorStyles.rows)}>
          {props.rows.map((row, index) => (
            <div key={index} className={sx(envEditorStyles.row)}>
              <Input
                value={row.key}
                onChange={(event) => update(index, { key: event.target.value })}
                placeholder="KEY"
                xstyle={envEditorStyles.input}
              />
              <span className={sx(envEditorStyles.equals)}>=</span>
              <Input
                value={row.value}
                onChange={(event) =>
                  update(index, { value: event.target.value })
                }
                placeholder="value"
                xstyle={envEditorStyles.input}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                xstyle={envEditorStyles.removeButton}
                onClick={() => remove(index)}
                aria-label="Remove variable"
              >
                <X className={sx(envEditorStyles.icon)} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        xstyle={envEditorStyles.addButton}
        onClick={add}
      >
        <Plus className={sx(envEditorStyles.icon)} />
        Add variable
      </Button>
    </div>
  );
}
