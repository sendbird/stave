import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/components/ui";
import type {
  ScriptEditorEntry,
  ScriptEntryFieldIssues,
} from "@/lib/workspace-scripts/editor";
import type { ScriptKind } from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";

function FieldError(props: { message?: string }) {
  if (!props.message) {
    return null;
  }
  return <span className="block text-[11px] text-destructive">{props.message}</span>;
}

export function ScriptEntryFormFields(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  targetOptions: Array<{ id: string; label: string }>;
  issues?: ScriptEntryFieldIssues;
  onFieldChange: (field: keyof ScriptEditorEntry, value: string | boolean) => void;
}) {
  const issues = props.issues ?? {};
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">ID</span>
          <Input
            value={props.entry.id}
            onChange={(event) => props.onFieldChange("id", event.target.value)}
            placeholder={props.kind === "service" ? "dev-server" : "bootstrap"}
            aria-invalid={Boolean(issues.id)}
            className={cn(issues.id && "border-destructive")}
          />
          <FieldError message={issues.id} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Label</span>
          <Input
            value={props.entry.label}
            onChange={(event) => props.onFieldChange("label", event.target.value)}
            placeholder="Shown in the GUI"
          />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Description</span>
        <Input
          value={props.entry.description}
          onChange={(event) => props.onFieldChange("description", event.target.value)}
          placeholder="Short summary of what this script does"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Target</span>
          <Select
            value={props.entry.target}
            onValueChange={(value) => props.onFieldChange("target", value)}
          >
            <SelectTrigger className={cn("w-full", issues.target && "border-destructive")}>
              <SelectValue placeholder="Select a target" />
            </SelectTrigger>
            <SelectContent>
              {props.targetOptions.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={issues.target} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Timeout (ms)</span>
          <Input
            value={props.entry.timeoutMs}
            onChange={(event) => props.onFieldChange("timeoutMs", event.target.value)}
            inputMode="numeric"
            placeholder="Optional"
            aria-invalid={Boolean(issues.timeoutMs)}
            className={cn(issues.timeoutMs && "border-destructive")}
          />
          <FieldError message={issues.timeoutMs} />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Commands</span>
        <Textarea
          value={props.entry.commandsText}
          onChange={(event) => props.onFieldChange("commandsText", event.target.value)}
          className={cn("min-h-28", issues.commands && "border-destructive")}
          placeholder={"bun install\nbun run dev"}
          aria-invalid={Boolean(issues.commands)}
        />
        {issues.commands ? (
          <FieldError message={issues.commands} />
        ) : (
          <span className="block text-[11px] text-muted-foreground">
            One shell command per line.
          </span>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Switch
            checked={props.entry.enabled}
            onCheckedChange={(checked) => props.onFieldChange("enabled", checked)}
          />
          <span className="text-xs text-foreground">Enabled</span>
        </div>
        {props.kind === "service" ? (
          <>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.restartOnRun}
                onCheckedChange={(checked) => props.onFieldChange("restartOnRun", checked)}
              />
              <span className="text-xs text-foreground">Restart on run</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.orbitEnabled}
                onCheckedChange={(checked) => props.onFieldChange("orbitEnabled", checked)}
              />
              <span className="text-xs text-foreground">Use Orbit</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.orbitNoTls}
                disabled={!props.entry.orbitEnabled}
                onCheckedChange={(checked) => props.onFieldChange("orbitNoTls", checked)}
              />
              <span className="text-xs text-foreground">Plain HTTP</span>
            </div>
          </>
        ) : null}
      </div>

      {props.kind === "service" && props.entry.orbitEnabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Orbit Name</span>
            <Input
              value={props.entry.orbitName}
              onChange={(event) => props.onFieldChange("orbitName", event.target.value)}
              placeholder="Optional base host name override"
            />
            <span className="block text-[11px] text-muted-foreground">
              Optional `portless --name` override. Orbit services must target the workspace.
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Orbit Proxy Port</span>
            <Input
              value={props.entry.orbitProxyPort}
              onChange={(event) => props.onFieldChange("orbitProxyPort", event.target.value)}
              inputMode="numeric"
              placeholder="Optional"
              aria-invalid={Boolean(issues.orbitProxyPort)}
              className={cn(issues.orbitProxyPort && "border-destructive")}
            />
            {issues.orbitProxyPort ? (
              <FieldError message={issues.orbitProxyPort} />
            ) : (
              <span className="block text-[11px] text-muted-foreground">
                Optional portless proxy port override.
              </span>
            )}
          </label>
        </div>
      ) : null}
    </div>
  );
}
