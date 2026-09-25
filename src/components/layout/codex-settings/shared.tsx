import { Badge, Textarea } from "@/components/ui";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { CodexAppServerSnapshot } from "@/lib/providers/provider.types";
import type { ReactNode } from "react";
import { codexStyles } from "../settings-dialog-codex-section.styles";

export type SnapshotState = {
  status: "idle" | "loading" | "ready" | "error";
  detail: string;
  sectionErrors: Record<string, string>;
  snapshot: CodexAppServerSnapshot | null;
  updatedAt: number | null;
};

export type DetailState<T> = {
  status: "idle" | "loading" | "ready" | "error";
  detail: string;
  value: T | null;
};

export function formatDateTime(value?: number | null) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleString();
}

export function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "0%";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

export function getPercentWidth(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

/** Thresholds match `StatusBarUsageSegment`: 60% is watch, 85% is tight. */
export function rateLimitFillStyle(usedPercent: number | null | undefined) {
  if (usedPercent == null || !Number.isFinite(usedPercent)) {
    return codexStyles.progressFillOk;
  }
  if (usedPercent >= 85) return codexStyles.progressFillDanger;
  if (usedPercent >= 60) return codexStyles.progressFillWarn;
  return codexStyles.progressFillOk;
}

export function DenseMetric(args: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "success" | "warning";
}) {
  return (
    <div className={sx(codexStyles.metric)}>
      <p className={sx(codexStyles.metricLabel)}>{args.label}</p>
      <p
        className={sx(
          codexStyles.metricValue,
          args.tone === "success"
            ? codexStyles.metricValueSuccess
            : args.tone === "warning"
              ? codexStyles.metricValueWarning
              : args.tone === "muted"
                ? codexStyles.metricValueMuted
                : null,
        )}
        title={args.value}
      >
        {args.value}
      </p>
    </div>
  );
}

export function DenseSection(args: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(sx(codexStyles.section), args.className)}>
      <div className={sx(codexStyles.sectionHeader)}>
        <div className={sx(codexStyles.sectionHeaderText)}>
          <h4 className={sx(codexStyles.sectionTitle)}>{args.title}</h4>
          {args.description ? (
            <p className={sx(codexStyles.sectionDescription)}>
              {args.description}
            </p>
          ) : null}
        </div>
        {args.action}
      </div>
      <div className={sx(codexStyles.sectionBody)}>{args.children}</div>
    </section>
  );
}

export function StatusPill(args: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Badge
      variant="outline"
      className={sx(
        codexStyles.pill,
        args.tone === "success"
          ? codexStyles.pillSuccess
          : args.tone === "warning"
            ? codexStyles.pillWarning
            : args.tone === "danger"
              ? codexStyles.pillDanger
              : codexStyles.pillDefault,
      )}
    >
      {args.label}
    </Badge>
  );
}

export function ReadOnlyCodeBlock(args: { value: string; minHeight?: number }) {
  return (
    <Textarea
      readOnly
      value={args.value}
      xstyle={codexStyles.codeBlock}
      style={{ minHeight: args.minHeight ?? 180 }}
    />
  );
}

export function getCodexAccountBadgeState(
  account: CodexAppServerSnapshot["account"],
) {
  if (!account) {
    return {
      label: "unknown",
      tone: "default" as const,
    };
  }

  const hasResolvedAccount =
    account.type === "apiKey" ||
    account.type === "chatgpt" ||
    account.email != null ||
    account.planType != null;
  if (account.requiresOpenaiAuth && !hasResolvedAccount) {
    return {
      label: "needs login",
      tone: "warning" as const,
    };
  }

  if (!account.requiresOpenaiAuth) {
    return {
      label: "not required",
      tone: "success" as const,
    };
  }

  return {
    label: "ready",
    tone: "success" as const,
  };
}
