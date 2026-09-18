import { useState } from "react";
import { Badge } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { describeAgentIdentity } from "@/lib/delegation/format";
import type { DelegationIdentitySource } from "@/lib/delegation/exchange";
import {
  getProviderFallbackLabel,
  getProviderIconUrl,
  getProviderWaveTone,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { delegationStyles as styles, delegationWaveTone } from "./delegation.styles";

const SOURCE_LABEL: Record<DelegationIdentitySource, string> = {
  auto: "Auto",
  preset: "Preset",
  explicit: "Explicit",
  "provider-default": "Default",
};

export interface AgentIdentityProps {
  providerId?: ProviderId | null;
  model?: string | null;
  effort?: string | null;
  /** `Advisor`, `Worker`, … shown ahead of the name when given. */
  role?: string | null;
  source?: DelegationIdentitySource | null;
  /** One line, no wrapping, effort folded into the text: for list rows. */
  compact?: boolean;
  modelEvidence?: "requested" | "configured" | "reported";
  /** Renders the source badge (`Auto` / `Preset` / `Explicit`). */
  showSource?: boolean;
  className?: string;
}

function ProviderMark(props: { providerId: ProviderId }) {
  const [failed, setFailed] = useState(false);
  const url = getProviderIconUrl({ providerId: props.providerId });
  if (failed || !url) {
    return (
      <span aria-hidden className={sx(styles.identityIconFallback)}>
        {getProviderFallbackLabel({ providerId: props.providerId })}
      </span>
    );
  }
  return (
    <img
      alt=""
      aria-hidden
      className={sx(styles.identityIcon)}
      src={url}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Who ran something: provider mark · human model name · effort chip · role.
 *
 * Every delegation surface renders identity through this so a raw model id or
 * a lowercase effort token cannot appear in one place while another prints the
 * catalog name.
 */
export function AgentIdentity(props: AgentIdentityProps) {
  const identity = describeAgentIdentity({
    providerId: props.providerId,
    model: props.model,
    effort: props.effort,
    role: props.role,
  });
  const tone = props.providerId
    ? getProviderWaveTone({ providerId: props.providerId })
    : null;
  const nameLabel =
    identity.modelLabel ?? identity.providerLabel ?? "Not resolved";
  const nameStyle = [
    styles.identityModel,
    tone ? delegationWaveTone[tone] : styles.identityModelMuted,
  ] as const;
  return (
    <span
      className={sx(styles.identity, props.compact && styles.identityCompact)}
      data-agent-identity={identity.text}
      title={identity.text}
    >
      {identity.roleLabel ? (
        <span className={sx(styles.identityRole)}>{identity.roleLabel}</span>
      ) : null}
      {props.providerId ? <ProviderMark providerId={props.providerId} /> : null}
      <span className={sx(...nameStyle)}>
        {props.compact && identity.effortLabel
          ? `${nameLabel} · ${identity.effortLabel}`
          : nameLabel}
      </span>
      {!props.compact && identity.effortLabel ? (
        <Badge
          variant="outline"
          tone="neutral"
          xstyle={styles.identityChip}
        >
          {identity.effortLabel}
        </Badge>
      ) : null}
      {props.modelEvidence ? <span className={sx(styles.identityModelMuted)}>({props.modelEvidence})</span> : null}
      {props.showSource && props.source ? (
        <Badge
          variant="soft"
          tone={props.source === "auto" ? "accent" : "neutral"}
          xstyle={styles.identityChip}
          title={`Model selected by ${SOURCE_LABEL[props.source].toLowerCase()}`}
        >
          {SOURCE_LABEL[props.source]}
        </Badge>
      ) : null}
    </span>
  );
}
