import * as React from "react";
import {
  ArrowRight,
  BookText,
  Command as CommandIcon,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { SiteFooter, SiteHeader } from "./site-layout";
import type { SiteData } from "./site-types";

const DOCS_HREF = "./docs/";
const INSTALL_HREF = "./docs/install-guide/";

const HEADER_LINKS = [
  { href: DOCS_HREF, label: "Docs" },
  { href: INSTALL_HREF, label: "Install" },
  {
    href: "https://github.com/sendbird-playground/stave/releases",
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
    title: "Docs written for end users",
    description:
      "Install, core workflow, workspace, and advanced — no internal architecture or historical roadmap in the way.",
    icon: BookText,
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
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader brandHref="/" primaryLinks={HEADER_LINKS} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="site-grid-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex max-w-screen-2xl flex-col items-center gap-8 px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-24 sm:pb-20 lg:px-8">
            <Badge
              className="rounded-full border-border/80 bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs"
              variant="outline"
            >
              <Sparkles className="size-3" />
              Now available for macOS
            </Badge>
            <h1 className="max-w-3xl font-heading text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              A desktop coding workspace built around Claude and Codex.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Stave keeps tasks, terminal work, and provider controls in one
              app. Every task gets its own worktree, and every turn starts with
              safety settings you can actually see.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <a href={INSTALL_HREF}>
                  Install Stave
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={DOCS_HREF}>Read the docs</a>
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Works on macOS — </span>
              <Kbd>⌘⇧P</Kbd>
              <span>opens the command palette</span>
            </div>
          </div>
        </section>

        {/* Product shot */}
        <section className="border-b border-border/70 bg-muted/30">
          <div className="mx-auto max-w-screen-2xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-foreground/5 ring-1 ring-border/50">
                <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                </div>
                <img
                  alt="Stave workspace with chat, editor, and terminal visible"
                  className="w-full"
                  loading="eager"
                  src="./docs/screenshots/stave-app.png"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-b border-border/70">
          <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                One workspace for the way you actually work.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Stave brings the most useful pieces of a modern coding assistant
                — model sessions, shells, tasks, and safety — into a single
                desktop surface.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
        <section className="border-b border-border/70 bg-muted/30">
          <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Start here.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                The docs are ordered like a product manual. Install first, learn
                the daily surfaces, then extend.
              </p>
            </div>
            <div className="mt-14 grid gap-4 sm:grid-cols-3">
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
          <div className="mx-auto max-w-screen-2xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Ready to try Stave?
              </h2>
              <p className="text-base leading-7 text-muted-foreground">
                Install the latest macOS build and open the workspace in a few
                minutes.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <a href={INSTALL_HREF}>
                    Install Stave
                    <ArrowRight className="size-4" />
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
    <div className="group rounded-xl border border-border/70 bg-card/60 p-6 transition-colors hover:border-border">
      <div className="flex size-9 items-center justify-center rounded-md border border-border/80 bg-background text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <h3 className="mt-5 font-heading text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
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
    <a
      className="group flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-card p-6 transition-colors hover:border-foreground/20"
      href={href}
    >
      <div className="space-y-2">
        <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Read guide
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </a>
  );
}
