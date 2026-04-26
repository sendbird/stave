import * as React from "react";
import { ArrowLeft, ArrowRight, BookOpen, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import {
  MarkdownContent,
  extractHeadings,
  stripLeadingTitle,
  type HeadingEntry,
} from "./docs-markdown";
import { SiteFooter, SiteHeader } from "./site-layout";
import {
  findDoc,
  findNeighbors,
  flattenSiteDocs,
  resolveRoute,
  type SiteData,
  type SiteDoc,
  type SiteSection,
} from "./site-types";

type ResolvedRoute = {
  doc: SiteDoc;
  section: SiteSection;
};

function docHref(currentRoute: string, targetRoute: string) {
  if (currentRoute === "home") {
    return targetRoute === "home" ? "./" : `./${targetRoute}/`;
  }
  if (targetRoute === "home") {
    return "../";
  }
  if (currentRoute === targetRoute) {
    return "./";
  }
  return `../${targetRoute}/`;
}

function previewHref(currentRoute: string, previewImage?: string) {
  if (!previewImage) return undefined;
  if (currentRoute === "home") return `./${previewImage}`;
  return `../${previewImage}`;
}

function useHeadingObserver(headings: HeadingEntry[]) {
  const [activeId, setActiveId] = React.useState<string | null>(
    headings[0]?.id ?? null,
  );

  React.useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId(headings[0].id);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-64px 0px -70% 0px", threshold: [0, 1] },
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [headings]);

  return activeId;
}

function DocsSidebar({
  data,
  currentRoute,
}: {
  data: SiteData;
  currentRoute: string;
}) {
  return (
    <Sidebar className="border-r border-border/70" collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border/80 px-4 py-3">
        <a
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          href={docHref(currentRoute, "home")}
        >
          <BookOpen className="size-4" />
          Documentation
        </a>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        {data.sections.map((section) => (
          <SidebarGroup key={section.id}>
            <SidebarGroupLabel className="px-2 text-[11px] font-medium tracking-wide uppercase">
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.docs.map((doc) => {
                  const effectiveRoute =
                    currentRoute === "home" ? data.homeRoute : currentRoute;
                  const isActive = effectiveRoute === doc.routePath;
                  return (
                    <SidebarMenuItem key={doc.routePath}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <a href={docHref(currentRoute, doc.routePath)}>
                          <span>{doc.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function DocsToc({ headings }: { headings: HeadingEntry[] }) {
  const activeId = useHeadingObserver(headings);
  if (headings.length === 0) {
    return null;
  }
  return (
    <nav aria-label="On this page" className="space-y-2">
      <div className="text-xs font-semibold tracking-wide text-foreground uppercase">
        On this page
      </div>
      <div className="border-l border-border">
        {headings.map((heading) => (
          <a
            key={heading.id}
            className={cn(
              "docs-toc-link",
              heading.depth === 3 && "docs-toc-link--nested",
            )}
            data-active={activeId === heading.id}
            href={`#${heading.id}`}
          >
            {heading.text}
          </a>
        ))}
      </div>
    </nav>
  );
}

function DocHero({
  resolved,
  currentRoute,
}: {
  resolved: ResolvedRoute;
  currentRoute: string;
}) {
  const { doc, section } = resolved;
  const preview = previewHref(currentRoute, doc.previewImage);
  return (
    <header className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={docHref(currentRoute, "home")}>
              Docs
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">{section.title}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{doc.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="space-y-4">
        <Badge
          className="rounded-full border-border/80 bg-card/60 px-3 py-0.5 text-[11px] tracking-wide text-muted-foreground uppercase"
          variant="outline"
        >
          {section.title}
        </Badge>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          {doc.title}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          {doc.description}
        </p>
      </div>
      {preview ? (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
          <img alt={doc.title} loading="lazy" src={preview} />
        </div>
      ) : null}
    </header>
  );
}

function DocNeighbors({
  data,
  routePath,
  currentRoute,
}: {
  data: SiteData;
  routePath: string;
  currentRoute: string;
}) {
  const { previous, next } = findNeighbors(data, routePath);
  if (!previous && !next) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {previous ? (
        <a
          className="group flex flex-col justify-between rounded-xl border border-border/70 bg-card/50 p-5 transition-colors hover:border-foreground/20"
          href={docHref(currentRoute, previous.doc.routePath)}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5" />
            Previous
          </div>
          <div className="mt-2 font-heading text-base font-semibold tracking-tight text-foreground">
            {previous.doc.title}
          </div>
        </a>
      ) : (
        <div />
      )}
      {next ? (
        <a
          className="group flex flex-col justify-between rounded-xl border border-border/70 bg-card/50 p-5 text-right transition-colors hover:border-foreground/20"
          href={docHref(currentRoute, next.doc.routePath)}
        >
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            Next
            <ArrowRight className="size-3.5" />
          </div>
          <div className="mt-2 font-heading text-base font-semibold tracking-tight text-foreground">
            {next.doc.title}
          </div>
        </a>
      ) : null}
    </div>
  );
}

function DocSearchDialog({
  data,
  currentRoute,
  open,
  onOpenChange,
}: {
  data: SiteData;
  currentRoute: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const docs = flattenSiteDocs(data);
  return (
    <CommandDialog
      className="max-w-2xl border-border/80 bg-background/95 p-0 shadow-2xl"
      description="Search public Stave documentation."
      onOpenChange={onOpenChange}
      open={open}
      title="Search docs"
    >
      <Command
        key={open ? "open" : "closed"}
        className="flex h-[min(70vh,32rem)] min-h-0 flex-col bg-transparent"
      >
        <div className="shrink-0 border-b border-border/70 px-1 pb-1">
          <CommandInput
            autoFocus
            placeholder="Search guides, features, references..."
          />
        </div>
        <CommandList className="min-h-0 max-h-none flex-1 px-2 pb-3">
          <CommandEmpty className="px-4 py-10 text-sm text-muted-foreground">
            No matching docs.
          </CommandEmpty>
          {data.sections.map((section) => (
            <CommandGroup
              key={section.id}
              className="py-1"
              heading={section.title}
            >
              {section.docs.map((doc) => (
                <CommandItem
                  key={doc.routePath}
                  keywords={[
                    doc.title,
                    doc.description,
                    section.title,
                    doc.routePath,
                  ]}
                  onSelect={() => {
                    window.location.href = docHref(
                      currentRoute,
                      doc.routePath,
                    );
                  }}
                  value={`${section.title} ${doc.title}`}
                >
                  <FileText className="size-4" />
                  <span>{doc.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {section.title}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {docs.length > 0 ? null : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export function DocsPageRoot({
  data,
  currentRoute,
}: {
  data: SiteData;
  currentRoute: string;
}) {
  const effectiveRoute = resolveRoute(data, currentRoute);
  const resolved = findDoc(data, effectiveRoute);
  const markdown = resolved ? stripLeadingTitle(resolved.doc.content) : "";
  const headings = React.useMemo(
    () => extractHeadings(markdown).filter((h) => h.depth <= 3),
    [markdown],
  );

  const [searchOpen, setSearchOpen] = React.useState(false);
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const siteHeaderLinks = [
    { href: "/", label: "Home" },
    { href: docHref(currentRoute, "home"), label: "Docs", active: true },
  ];

  return (
    <SidebarProvider
      className="flex min-h-svh flex-col"
      style={{ "--sidebar-width": "17rem" } as React.CSSProperties}
    >
      <SiteHeader
        brandHref="/"
        brandSublabel="Docs"
        onSearchClick={() => setSearchOpen(true)}
        primaryLinks={siteHeaderLinks}
      />

      <div className="flex flex-1">
        <DocsSidebar currentRoute={currentRoute} data={data} />
        <SidebarInset className="min-w-0 bg-background">
          <div className="flex h-12 items-center gap-2 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md lg:hidden">
            <SidebarTrigger />
            <Separator className="h-4" orientation="vertical" />
            <span className="text-sm font-medium text-foreground">
              {resolved?.doc.title ?? "Docs"}
            </span>
          </div>
          <main className="mx-auto w-full min-w-0 max-w-screen-2xl flex-1 px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
            {resolved ? (
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_220px]">
                <article className="min-w-0 max-w-3xl space-y-10">
                  <DocHero currentRoute={currentRoute} resolved={resolved} />
                  <MarkdownContent
                    currentRoute={currentRoute}
                    markdown={markdown}
                  />
                  <Separator />
                  <DocNeighbors
                    currentRoute={currentRoute}
                    data={data}
                    routePath={resolved.doc.routePath}
                  />
                </article>
                <aside className="hidden xl:block">
                  <div className="sticky top-20">
                    <DocsToc headings={headings} />
                  </div>
                </aside>
              </div>
            ) : (
              <div className="space-y-4">
                <h1 className="font-heading text-2xl font-semibold">
                  Doc not found
                </h1>
                <p className="text-muted-foreground">
                  This page is not part of the public Stave docs build.
                </p>
                <a
                  className="text-primary underline"
                  href={docHref(currentRoute, "home")}
                >
                  Return to docs home
                </a>
              </div>
            )}
          </main>
          <SiteFooter docsHref={docHref(currentRoute, "home")} />
        </SidebarInset>
      </div>

      <DocSearchDialog
        currentRoute={currentRoute}
        data={data}
        onOpenChange={setSearchOpen}
        open={searchOpen}
      />
    </SidebarProvider>
  );
}
