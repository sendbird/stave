import { Button as AdsButton } from "@/components/ads/components/Button";
import { Check, ChevronDown, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { layers } from "@/lib/ui-layers.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { permissionModeSelectorStyles as styles } from "./permission-mode-selector.styles";
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

export function getPermissionModeOptions(
  providerId: "claude-code" | "codex",
): readonly PermissionModeOption[] {
  return providerId === "claude-code" ? CLAUDE_OPTIONS : CODEX_OPTIONS;
}

export function getPermissionModeLabel(args: {
  providerId: "claude-code" | "codex";
  value: PermissionModeValue;
}) {
  return (
    getPermissionModeOptions(args.providerId).find(
      (option) => option.value === args.value,
    )?.label ?? args.value
  );
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
    <div className={sx(styles.root)} ref={rootRef}>
      <AdsButton
        layout="host"
        type="button"
        className={sx(styles.trigger, open && styles.triggerOpen)}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        title="Permission mode"
      >
        <Shield className={sx(styles.triggerIcon)} />
        <span>{current?.label ?? value}</span>
        <ChevronDown className={sx(styles.triggerIcon)} />
      </AdsButton>
      {open ? (
        <div className={sx(styles.menu, layers.floatingChrome)}>
          {options.map((option) => (
            <AdsButton
              layout="host"
              key={option.value}
              type="button"
              className={sx(
                styles.option,
                option.value === value && styles.optionSelected,
              )}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value ? (
                <Check className={sx(styles.optionCheck)} />
              ) : null}
            </AdsButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function cyclePermissionMode(args: {
  providerId: "claude-code" | "codex";
  current: PermissionModeValue;
}): PermissionModeValue {
  const options = getPermissionModeOptions(args.providerId);
  const idx = options.findIndex((o) => o.value === args.current);
  return options[(idx + 1) % options.length]!.value;
}
