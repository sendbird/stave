import { ChevronDown, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * Permission mode, on the ADS menu.
 *
 * The trigger names the current mode and the popup is a single-select radio
 * group, which is what this control is: one of N, exclusive. Both come from
 * ADS (`Menu` via the `dropdown-menu` shim), so the popup arrives with a
 * `role="menu"`, roving focus, typeahead, Escape-to-close, click-outside,
 * focus return to the trigger, and the portal/layer stacking every other
 * composer menu uses — all of which the previous hand-rolled
 * `useState` + `document` mousedown + absolutely positioned `div` had to do
 * without.
 */
export function PermissionModeSelector(args: PermissionModeSelectorProps) {
  const { providerId, value, disabled, onSelect } = args;
  const [open, setOpen] = useState(false);
  const options = getPermissionModeOptions(providerId);
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={sx(styles.trigger, open && styles.triggerOpen)}
            disabled={disabled}
            title="Permission mode"
          />
        }
      >
        <Shield className={sx(styles.triggerIcon)} />
        <span>{current?.label ?? value}</span>
        <ChevronDown className={sx(styles.triggerIcon)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={6}
        className={sx(styles.menu)}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onSelect(next as PermissionModeValue)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
