import { Layers } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

const WORKSPACE_BLUE_TONES = [
  "oklch(0.69 0.12 245)",
  "oklch(0.72 0.1 235)",
  "oklch(0.67 0.13 230)",
  "oklch(0.74 0.09 252)",
  "oklch(0.7 0.11 220)",
  "oklch(0.65 0.12 240)",
] as const;

export function getWorkspaceAccentTone(args: { workspaceName: string; isDefault?: boolean }) {
  if (args.isDefault) {
    return {
      background: "color-mix(in oklch, var(--muted) 82%, var(--card))",
      foreground: "color-mix(in oklch, var(--muted-foreground) 78%, var(--foreground))",
      border: "color-mix(in oklch, var(--muted-foreground) 16%, var(--border))",
    };
  }

  let hash = 0;
  for (let index = 0; index < args.workspaceName.length; index += 1) {
    hash = (hash * 31 + args.workspaceName.charCodeAt(index)) | 0;
  }
  const accent = WORKSPACE_BLUE_TONES[Math.abs(hash) % WORKSPACE_BLUE_TONES.length]!;
  return {
    background: `color-mix(in oklch, ${accent} 18%, var(--card))`,
    foreground: `color-mix(in oklch, ${accent} 58%, var(--foreground))`,
    border: `color-mix(in oklch, ${accent} 24%, var(--border))`,
  };
}

export function WorkspaceIdentityMark(args: { workspaceName: string; isDefault?: boolean; className?: string; iconClassName?: string }) {
  const tone = getWorkspaceAccentTone({ workspaceName: args.workspaceName, isDefault: args.isDefault });
  return (
    <span
      className={cx(sx(layoutShellStyles.identityMark), args.className)}
      style={{
        backgroundColor: tone.background,
        color: tone.foreground,
        borderColor: tone.border,
      }}
    >
      <Layers className={cx(sx(layoutShellStyles.workspaceIcon), args.iconClassName)} />
    </span>
  );
}
