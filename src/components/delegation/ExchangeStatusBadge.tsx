import { Badge } from "@/components/ads/components/Badge";
import {
  describeExchangeStatus,
  type ExchangeStatus,
} from "@/lib/delegation/format";

/**
 * The single status chip for every delegation. Tone rides the ADS Badge tone
 * axis so `Returned` here is the same green as `Returned` anywhere else.
 */
export function ExchangeStatusBadge(props: {
  status: ExchangeStatus;
  /** Extra text after the label, e.g. a duration. */
  suffix?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const description = describeExchangeStatus(props.status);
  return (
    <Badge
      variant="soft"
      tone={description.tone}
      className={props.className}
      data-exchange-status={props.status}
      data-testid={props["data-testid"]}
    >
      {props.suffix ? `${description.label} · ${props.suffix}` : description.label}
    </Badge>
  );
}
