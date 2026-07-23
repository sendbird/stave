import type { MouseEvent } from "react";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getServiceLinkName,
  type ServiceLinkBadgeInfo,
  type ServiceLinkKind,
} from "@/lib/service-link-badges";

export interface ServiceLinkBadgeProps {
  href: string;
  badge: ServiceLinkBadgeInfo;
  /** Optional display label (e.g. markdown link text) overriding the derived one. */
  label?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

function FigmaBadgeIcon() {
  return (
    <svg viewBox="0 0 38 57" aria-hidden="true" className="h-[1em] w-auto shrink-0">
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}

function JiraBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[1em] w-[1em] shrink-0">
      <path
        fill="#2684ff"
        d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z"
      />
    </svg>
  );
}

function ConfluenceBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[1em] w-[1em] shrink-0">
      <path
        fill="#2684ff"
        d="M.87 18.257c-.248.382-.53.875-.763 1.245a.764.764 0 0 0 .255 1.04l4.965 3.054a.764.764 0 0 0 1.058-.26c.199-.332.454-.763.733-1.221 1.967-3.247 3.945-2.853 7.508-1.146l4.957 2.337a.764.764 0 0 0 1.028-.382l2.364-5.346a.764.764 0 0 0-.382-1.007c-1.043-.49-3.117-1.466-4.98-2.365-6.71-3.258-12.415-3.047-16.743 3.983zm22.26-12.507c.248-.382.53-.875.763-1.245a.764.764 0 0 0-.256-1.04L18.673.411a.764.764 0 0 0-1.058.26c-.199.332-.454.763-.733 1.221-1.967 3.247-3.945 2.853-7.508 1.146L4.417.7a.764.764 0 0 0-1.028.39L1.025 6.436a.764.764 0 0 0 .382 1.007c1.043.49 3.117 1.466 4.98 2.365 6.71 3.257 12.415 3.047 16.743-3.984z"
      />
    </svg>
  );
}

const SERVICE_BADGE_ICONS: Record<ServiceLinkKind, () => React.JSX.Element> = {
  figma: FigmaBadgeIcon,
  jira: JiraBadgeIcon,
  confluence: ConfluenceBadgeIcon,
};

export function ServiceLinkBadge({ href, badge, label, onClick }: ServiceLinkBadgeProps) {
  const Icon = SERVICE_BADGE_ICONS[badge.kind];
  const displayLabel = label?.trim() || badge.label;
  const tooltipLabel = `Open in ${getServiceLinkName(badge.kind)} — ${href}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <ExternalAnchor
            href={href}
            data-service-link-badge={badge.kind}
            aria-label={tooltipLabel}
            className="inline-flex max-w-full items-center gap-[0.35em] rounded-md border border-border/80 bg-muted/40 px-[0.45em] py-[0.1em] align-middle text-[0.8125em] font-medium leading-none text-foreground no-underline transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={onClick}
          >
            <Icon />
            <span className="min-w-0 max-w-64 truncate">{displayLabel}</span>
          </ExternalAnchor>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-96 break-all">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
