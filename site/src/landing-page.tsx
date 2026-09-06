import * as React from "react";
import {
  ArrowRight,
  Command as CommandIcon,
  Inbox,
  ScanEye,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";

import { sx } from "@/components/ads/utils/stylex";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { landingStyles as s } from "./landing-page.styles";
import { SiteFooter, SiteHeader } from "./site-layout";
import type { SiteData } from "./site-types";

const DOCS_HREF = "./docs/";
const INSTALL_HREF = "./docs/install-guide/";

const HEADER_LINKS = [
  { href: DOCS_HREF, label: "Docs" },
  { href: INSTALL_HREF, label: "Install" },
  {
    href: "https://github.com/sendbird/stave/releases",
    label: "Releases",
    external: true,
  },
];

const FEATURES = [
  {
    title: "Tasks in a dedicated workspace",
    description:
      "Every task gets its own worktree, chat history, and side panels. Switch between tasks without losing context.",
    icon: Workflow,
  },
  {
    title: "Claude and Codex together",
    description:
      "Use either model, route between them automatically, or run both in parallel sessions inside one desktop app.",
    icon: Sparkles,
  },
  {
    title: "Integrated terminal",
    description:
      "Docked shells for quick commands, plus full Claude or Codex CLI sessions in the main panel without leaving the workspace.",
    icon: TerminalSquare,
  },
  {
    title: "Runtime safety you can see",
    description:
      "File access, approvals, and network settings live next to the composer. You always know what the next turn can do.",
    icon: ShieldCheck,
  },
  {
    title: "Command palette for everything",
    description:
      "Jump to any action, setting, or workspace surface from one searchable launcher. Never hunt for a button again.",
    icon: CommandIcon,
  },
  {
    title: "Lens browser panel",
    description:
      "Inspect a live page in the right rail and send DOM, console, network, or element context straight into a task draft.",
    icon: ScanEye,
  },
  {
    title: "One inbox for every workspace",
    description:
      "Fleet's \"Action required\" rail lists pending questions, approvals, failed runs, and PR blockers across all your workspaces.",
    icon: Inbox,
  },
];

const START_ITEMS = [
  {
    title: "Install on macOS",
    description:
      "One authenticated GitHub CLI command to download, install, and launch the latest Stave build.",
    href: INSTALL_HREF,
  },
  {
    title: "Learn the daily surfaces",
    description:
      "Terminal, command palette, runtime safety, and attachments — the four surfaces most people use every day.",
    href: "./docs/integrated-terminal/",
  },
  {
    title: "Make it yours",
    description:
      "Save project instructions, configure scripts, and adopt advanced features only when you need them.",
    href: "./docs/project-instructions/",
  },
];

export function LandingPage({ data: _data }: { data: SiteData }) {
  return (
    <div className={sx(s.page)}>
      <SiteHeader brandHref="/" primaryLinks={HEADER_LINKS} />

      <main>
        {/* Hero */}
        <section className={sx(s.heroSection)}>
          <div className={sx(s.gridBackground)} />
          <div className={sx(s.heroInner)}>
            <Badge className={sx(s.heroBadge)} variant="outline">
              <Sparkles className={sx(s.badgeIcon)} />
              Now available for macOS
            </Badge>
            <h1 className={sx(s.heroTitle)}>
              A desktop coding workspace built around Claude and Codex.
            </h1>
            <p className={sx(s.heroLead)}>
              Stave keeps tasks, terminal work, and provider controls in one
              app. Every task gets its own worktree, and every turn starts with
              safety settings you can actually see.
            </p>
            <div className={sx(s.actionRow)}>
              <Button asChild size="lg">
                <a href={INSTALL_HREF}>
                  Install Stave
                  <ArrowRight className={sx(s.actionIcon)} />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={DOCS_HREF}>Read the docs</a>
              </Button>
            </div>
            <div className={sx(s.hint)}>
              <span>Works on macOS — </span>
              <Kbd>⌘⇧P</Kbd>
              <span>opens the command palette</span>
            </div>
          </div>
        </section>

        {/* Product shot */}
        <section className={sx(s.shotSection)}>
          <div className={sx(s.sectionInner)}>
            <div className={sx(s.shotFrame)}>
              <div className={sx(s.shotWindow)}>
                <div className={sx(s.shotTitlebar)}>
                  <span className={sx(s.shotDot)} />
                  <span className={sx(s.shotDot)} />
                  <span className={sx(s.shotDot)} />
                </div>
                <img
                  alt="Stave workspace with chat, editor, and terminal visible"
                  className={sx(s.shotImage)}
                  loading="eager"
                  src="./docs/screenshots/stave-app.png"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className={sx(s.featuresSection)}>
          <div className={sx(s.featuresInner)}>
            <div className={sx(s.sectionHeader)}>
              <h2 className={sx(s.sectionTitle)}>
                One workspace for the way you actually work.
              </h2>
              <p className={sx(s.sectionLead)}>
                Stave brings the most useful pieces of a modern coding assistant
                — model sessions, shells, tasks, and safety — into a single
                desktop surface.
              </p>
            </div>
            <div className={sx(s.featuresGrid)}>
              {FEATURES.map((feature) => (
                <FeatureCard
                  key={feature.title}
                  description={feature.description}
                  icon={feature.icon}
                  title={feature.title}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Start here */}
        <section className={sx(s.startSection)}>
          <div className={sx(s.startInner)}>
            <div className={sx(s.sectionHeader)}>
              <h2 className={sx(s.sectionTitle)}>Start here.</h2>
              <p className={sx(s.sectionLead)}>
                The docs are ordered like a product manual. Install first, learn
                the daily surfaces, then extend.
              </p>
            </div>
            <div className={sx(s.startGrid)}>
              {START_ITEMS.map((item) => (
                <StartCard
                  key={item.title}
                  description={item.description}
                  href={item.href}
                  title={item.title}
                />
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section>
          <div className={sx(s.ctaInner)}>
            <div className={sx(s.ctaBlock)}>
              <h2 className={sx(s.sectionTitle)}>Ready to try Stave?</h2>
              <p className={sx(s.ctaLead)}>
                Install the latest macOS build and open the workspace in a few
                minutes.
              </p>
              <div className={sx(s.actionRow)}>
                <Button asChild size="lg">
                  <a href={INSTALL_HREF}>
                    Install Stave
                    <ArrowRight className={sx(s.actionIcon)} />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={DOCS_HREF}>Browse the docs</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter docsHref={DOCS_HREF} />
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={sx(s.featureCard)}>
      <div className={sx(s.featureIconWrap)}>
        <Icon className={sx(s.featureIcon)} />
      </div>
      <h3 className={sx(s.featureTitle)}>{title}</h3>
      <p className={sx(s.featureDescription)}>{description}</p>
    </div>
  );
}

function StartCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a className={sx(s.startCard)} href={href}>
      <div className={sx(s.startCardText)}>
        <h3 className={sx(s.startCardTitle)}>{title}</h3>
        <p className={sx(s.startCardDescription)}>{description}</p>
      </div>
      <div className={sx(s.startCardCta)}>
        Read guide
        <ArrowRight className={sx(s.startCardCtaIcon)} />
      </div>
    </a>
  );
}
