import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { normalizeExternalUrl, openExternalUrl } from "@/lib/external-links";

type ExternalAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function ExternalAnchor({ className, href, onClick, ...props }: ExternalAnchorProps) {
  const normalizedHref = normalizeExternalUrl(href) ?? href;

  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    const externalHref = normalizeExternalUrl(href);
    if (!externalHref) {
      return;
    }

    event.preventDefault();
    await openExternalUrl({ url: externalHref });
  }

  return (
    <a
      href={normalizedHref}
      target="_blank"
      rel="noreferrer"
      className={cn("text-primary underline underline-offset-2", className)}
      onClick={(event) => {
        void handleClick(event);
      }}
      {...props}
    />
  );
}
