import * as React from "react";
import { Search } from "lucide-react";

import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";

import { siteLayoutStyles as s } from "./site-layout.styles";
import { ThemeToggle } from "./theme";

const REPO_URL = "https://github.com/sendbird/stave";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.72-2.78.62-3.37-1.22-3.37-1.22-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.04 1.53 1.04.89 1.55 2.34 1.1 2.91.84.09-.66.35-1.1.63-1.35-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.04 1.03-2.75-.1-.26-.45-1.3.1-2.72 0 0 .84-.28 2.75 1.05a9.4 9.4 0 012.5-.34c.85.004 1.7.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.46.1 2.72.64.71 1.03 1.63 1.03 2.75 0 3.93-2.35 4.8-4.58 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.2 10.2 0 0022 12.25C22 6.58 17.52 2 12 2z"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function StaveMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={className ?? sx(s.mark)} />
  );
}

export function Brand({
  href = "/",
  label = "Stave",
  sublabel,
}: {
  href?: string;
  label?: string;
  sublabel?: string;
}) {
  return (
    <a className={sx(s.brand)} href={href}>
      <StaveMark />
      <span className={sx(s.brandLabel)}>{label}</span>
      {sublabel ? (
        <span className={sx(s.brandSublabel)}>{sublabel}</span>
      ) : null}
    </a>
  );
}

export type HeaderLink = {
  href: string;
  label: string;
  external?: boolean;
  active?: boolean;
};

export function SiteHeader({
  brandHref = "/",
  brandSublabel,
  primaryLinks = [],
  onSearchClick,
}: {
  brandHref?: string;
  brandSublabel?: string;
  primaryLinks?: HeaderLink[];
  onSearchClick?: () => void;
}) {
  return (
    <header className={sx(s.header)}>
      <div className={sx(s.headerInner)}>
        <Brand href={brandHref} sublabel={brandSublabel} />
        <nav className={sx(s.nav)}>
          {primaryLinks.map((link) => (
            <a
              key={link.href}
              className={sx(s.navLink, link.active && s.navLinkActive)}
              href={link.href}
              rel={link.external ? "noreferrer" : undefined}
              target={link.external ? "_blank" : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className={sx(s.headerActions)}>
          {onSearchClick ? (
            <Button
              aria-label="Search docs"
              className={sx(s.searchButton)}
              onClick={onSearchClick}
              variant="outline"
            >
              <span className={sx(s.searchButtonInner)}>
                <Search className={sx(s.icon)} />
                Search docs
              </span>
              <Kbd className={sx(s.searchKbd)}>⌘K</Kbd>
            </Button>
          ) : null}
          {onSearchClick ? (
            <Button
              aria-label="Search docs"
              className={sx(s.searchButtonMobile)}
              onClick={onSearchClick}
              size="icon"
              variant="ghost"
            >
              <Search className={sx(s.icon)} />
            </Button>
          ) : null}
          <Button asChild size="icon" variant="ghost">
            <a
              aria-label="Stave on GitHub"
              href={REPO_URL}
              rel="noreferrer"
              target="_blank"
            >
              <GithubIcon className={sx(s.icon)} />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ docsHref }: { docsHref: string }) {
  return (
    <footer className={sx(s.footer)}>
      <div className={sx(s.footerInner)}>
        <div className={sx(s.footerBrandRow)}>
          <Brand href="/" />
          <Separator
            className={sx(s.footerVerticalSeparator)}
            orientation="vertical"
          />
          <span>Desktop AI coding workspace for Claude and Codex.</span>
        </div>
        <div className={sx(s.footerLinks)}>
          <a className={sx(s.footerLink)} href={docsHref}>
            Docs
          </a>
          <a
            className={sx(s.footerLink)}
            href={REPO_URL}
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          <a
            className={sx(s.footerLink)}
            href={`${REPO_URL}/releases`}
            rel="noreferrer"
            target="_blank"
          >
            Releases
          </a>
        </div>
      </div>
    </footer>
  );
}
