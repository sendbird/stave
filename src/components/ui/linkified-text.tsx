import type { ElementType, HTMLAttributes } from "react";
import { useMemo } from "react";
import { splitTextByExternalUrls } from "@/lib/external-links";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import { cn } from "@/lib/utils";
import { ExternalAnchor } from "./external-anchor";
import { ServiceLinkBadge } from "./service-link-badge";

interface LinkifiedTextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  linkClassName?: string;
  text: string;
}

export function LinkifiedText({
  as,
  className,
  linkClassName,
  text,
  ...props
}: LinkifiedTextProps) {
  const Component = as ?? "span";
  const segments = useMemo(
    () =>
      splitTextByExternalUrls(text).map((segment) => ({
        ...segment,
        badge: segment.type === "link" ? resolveServiceLinkBadge(segment.href) : null,
      })),
    [text],
  );

  return (
    <Component className={className} {...props}>
      {segments.map((segment, index) => (
        segment.type === "link" && segment.href ? (
          segment.badge ? (
            <ServiceLinkBadge
              key={`${segment.href}-${index}`}
              href={segment.href}
              badge={segment.badge}
            />
          ) : (
            <ExternalAnchor
              key={`${segment.href}-${index}`}
              href={segment.href}
              className={cn(linkClassName)}
            >
              {segment.text}
            </ExternalAnchor>
          )
        ) : (
          <span key={`text-${index}`}>{segment.text}</span>
        )
      ))}
    </Component>
  );
}
