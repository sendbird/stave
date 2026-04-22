import { Check, ChevronDown, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import type { ClaudePermissionMode } from "@/types/chat";
export type { ClaudePermissionMode } from "@/types/chat";

export type CodexApprovalPolicy = "never" | "on-request" | "untrusted";
export type PermissionModeValue = ClaudePermissionMode | CodexApprovalPolicy;

interface PermissionModeOption {
  value: PermissionModeValue;
  label: string;
}

const CLAUDE_OPTIONS: PermissionModeOption[] = [
  { value: "default", label: "Default" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "bypassPermissions", label: "Bypass" },
  { value: "plan", label: "Plan" },
  { value: "dontAsk", label: "Don't Ask" },
  { value: "auto", label: "Auto" },
];

const CODEX_OPTIONS: PermissionModeOption[] = [
  { value: "untrusted", label: "Untrusted" },
  { value: "on-request", label: "On Request" },
  { value: "never", label: "Never" },
];

export function getPermissionModeOptions(providerId: "claude-code" | "codex"): readonly PermissionModeOption[] {
  return providerId === "claude-code" ? CLAUDE_OPTIONS : CODEX_OPTIONS;
}

export function getPermissionModeLabel(args: {
  providerId: "claude-code" | "codex";
  value: PermissionModeValue;
}) {
  return getPermissionModeOptions(args.providerId).find((option) => option.value === args.value)?.label ?? args.value;
}

interface PermissionModeSelectorProps {
  providerId: "claude-code" | "codex";
  value: PermissionModeValue;
  disabled?: boolean;
  onSelect: (value: PermissionModeValue) => void;
}

export function PermissionModeSelector(args: PermissionModeSelectorProps) {
  const { providerId, value, disabled, onSelect } = args;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options = getPermissionModeOptions(providerId);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-sm border border-border/80 bg-secondary px-2 text-sm text-foreground transition-colors hover:bg-secondary/80",
          open && "border-primary/60 bg-secondary/90",
        )}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        title="Permission mode"
      >
        <Shield className="size-3.5 text-muted-foreground" />
        <span>{current?.label ?? value}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className={cn(UI_LAYER_CLASS.floatingChrome, "absolute bottom-[calc(100%+0.375rem)] left-0 w-44 rounded-sm border border-border/90 bg-card p-1 shadow-xl")}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70",
                option.value === value && "bg-secondary/80",
              )}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value ? <Check className="size-3.5 text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function cyclePermissionMode(args: { providerId: "claude-code" | "codex"; current: PermissionModeValue }): PermissionModeValue {
  const options = getPermissionModeOptions(args.providerId);
  const idx = options.findIndex((o) => o.value === args.current);
  return options[(idx + 1) % options.length]!.value;
}
