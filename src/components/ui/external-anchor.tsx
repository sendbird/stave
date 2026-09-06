import { contentLayout } from "./content-layout.styles";
import { cx, sx } from "../ads/utils/stylex";
import type { StyleXValue } from "../ads/utils/stylex";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { normalizeExternalUrl, openExternalUrl } from "@/lib/external-links";

type ExternalAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { xstyle?: StyleXValue };

export function ExternalAnchor({ className, href, onClick, xstyle, ...props }: ExternalAnchorProps) {
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
      className={cx(sx(contentLayout.externalLink, xstyle), className)}
      onClick={(event) => {
        void handleClick(event);
      }}
      {...props}
    />
  );
}
