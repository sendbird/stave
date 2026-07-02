import { Plus, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { ScriptEditorEnvRow } from "@/lib/workspace-scripts/editor";

export function ScriptEnvEditor(props: {
  rows: ScriptEditorEnvRow[];
  onChange: (rows: ScriptEditorEnvRow[]) => void;
}) {
  const update = (index: number, patch: Partial<ScriptEditorEnvRow>) => {
    props.onChange(props.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };
  const remove = (index: number) => {
    props.onChange(props.rows.filter((_, rowIndex) => rowIndex !== index));
  };
  const add = () => {
    props.onChange([...props.rows, { key: "", value: "" }]);
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-foreground">Environment</span>
      {props.rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No environment overrides.</p>
      ) : (
        <div className="space-y-1.5">
          {props.rows.map((row, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                value={row.key}
                onChange={(event) => update(index, { key: event.target.value })}
                placeholder="KEY"
                className="h-8 font-mono text-xs"
              />
              <span className="text-muted-foreground">=</span>
              <Input
                value={row.value}
                onChange={(event) => update(index, { value: event.target.value })}
                placeholder="value"
                className="h-8 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
                aria-label="Remove variable"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5"
        onClick={add}
      >
        <Plus className="size-3.5" />
        Add variable
      </Button>
    </div>
  );
}
