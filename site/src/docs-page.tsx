import * as React from "react";
import { ArrowLeft, ArrowRight, BookOpen, FileText } from "lucide-react";

import { sx } from "@/components/ads/utils/stylex";
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

import { docsStyles as s } from "./docs-page.styles";
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
    <Sidebar className={sx(s.sidebar)} collapsible="offcanvas">
      <SidebarHeader className={sx(s.sidebarHeader)}>
        <a
          className={sx(s.sidebarHeaderLink)}
          href={docHref(currentRoute, "home")}
        >
          <BookOpen className={sx(s.icon)} />
          Documentation
        </a>
      </SidebarHeader>
      <SidebarContent className={sx(s.sidebarContent)}>
        {data.sections.map((section) => (
          <SidebarGroup key={section.id}>
            <SidebarGroupLabel className={sx(s.sidebarGroupLabel)}>
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
    <nav aria-label="On this page" className={sx(s.toc)}>
      <div className={sx(s.tocLabel)}>On this page</div>
      <div className={sx(s.tocList)}>
        {headings.map((heading) => (
          <a
            key={heading.id}
            className={sx(s.tocLink, heading.depth === 3 && s.tocLinkNested)}
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
    <header className={sx(s.header)}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={docHref(currentRoute, "home")}>
              Docs
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className={sx(s.breadcrumbMuted)}>{section.title}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{doc.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className={sx(s.heroBody)}>
        <Badge className={sx(s.heroBadge)} variant="outline">
          {section.title}
        </Badge>
        <h1 className={sx(s.heroTitle)}>{doc.title}</h1>
        <p className={sx(s.heroDescription)}>{doc.description}</p>
      </div>
      {preview ? (
        <div className={sx(s.heroPreview)}>
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
    <div className={sx(s.neighbors)}>
      {previous ? (
        <a
          className={sx(s.neighborCard)}
          href={docHref(currentRoute, previous.doc.routePath)}
        >
          <div className={sx(s.neighborLabel)}>
            <ArrowLeft className={sx(s.neighborArrow)} />
            Previous
          </div>
          <div className={sx(s.neighborTitle)}>{previous.doc.title}</div>
        </a>
      ) : (
        <div />
      )}
      {next ? (
        <a
          className={sx(s.neighborCard, s.neighborCardNext)}
          href={docHref(currentRoute, next.doc.routePath)}
        >
          <div className={sx(s.neighborLabel, s.neighborLabelNext)}>
            Next
            <ArrowRight className={sx(s.neighborArrow)} />
          </div>
          <div className={sx(s.neighborTitle)}>{next.doc.title}</div>
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
      className={sx(s.searchDialog)}
      description="Search public Stave documentation."
      onOpenChange={onOpenChange}
      open={open}
      title="Search docs"
    >
      <Command key={open ? "open" : "closed"} className={sx(s.searchCommand)}>
        <div className={sx(s.searchInputWrap)}>
          <CommandInput
            autoFocus
            placeholder="Search guides, features, references..."
          />
        </div>
        <CommandList className={sx(s.searchList)}>
          <CommandEmpty className={sx(s.searchEmpty)}>
            No matching docs.
          </CommandEmpty>
          {data.sections.map((section) => (
            <CommandGroup
              key={section.id}
              className={sx(s.searchGroup)}
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
                  <FileText className={sx(s.icon)} />
                  <span>{doc.title}</span>
                  <span className={sx(s.searchItemMeta)}>{section.title}</span>
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
      className={sx(s.provider)}
      style={{ "--sidebar-width": "17rem" } as React.CSSProperties}
    >
      <SiteHeader
        brandHref="/"
        brandSublabel="Docs"
        onSearchClick={() => setSearchOpen(true)}
        primaryLinks={siteHeaderLinks}
      />

      <div className={sx(s.layoutRow)}>
        <DocsSidebar currentRoute={currentRoute} data={data} />
        <SidebarInset className={sx(s.inset)}>
          <div className={sx(s.mobileBar)}>
            <SidebarTrigger />
            <Separator
              className={sx(s.mobileBarSeparator)}
              orientation="vertical"
            />
            <span className={sx(s.mobileBarTitle)}>
              {resolved?.doc.title ?? "Docs"}
            </span>
          </div>
          <main className={sx(s.main)}>
            {resolved ? (
              <div className={sx(s.contentGrid)}>
                <article className={sx(s.article)}>
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
                <aside className={sx(s.asideToc)}>
                  <div className={sx(s.asideTocSticky)}>
                    <DocsToc headings={headings} />
                  </div>
                </aside>
              </div>
            ) : (
              <div className={sx(s.notFound)}>
                <h1 className={sx(s.notFoundTitle)}>Doc not found</h1>
                <p className={sx(s.notFoundText)}>
                  This page is not part of the public Stave docs build.
                </p>
                <a
                  className={sx(s.notFoundLink)}
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
