export type SiteDoc = {
  routePath: string;
  sourcePath: string;
  title: string;
  description: string;
  previewImage?: string;
  content: string;
};

export type SiteSection = {
  id: string;
  title: string;
  docs: SiteDoc[];
};

export type SiteData = {
  sections: SiteSection[];
  homeRoute: string;
};

export function flattenSiteDocs(data: SiteData) {
  return data.sections.flatMap((section) =>
    section.docs.map((doc) => ({ section, doc })),
  );
}

export function findDoc(data: SiteData, routePath: string | null) {
  const resolved = resolveRoute(data, routePath);
  for (const section of data.sections) {
    for (const doc of section.docs) {
      if (doc.routePath === resolved) {
        return { section, doc };
      }
    }
  }
  return null;
}

export function resolveRoute(data: SiteData, routePath: string | null) {
  if (!routePath || routePath === "home") {
    return data.homeRoute;
  }
  return routePath;
}

export function findNeighbors(data: SiteData, routePath: string) {
  const list = flattenSiteDocs(data);
  const index = list.findIndex((entry) => entry.doc.routePath === routePath);
  return {
    previous: index > 0 ? list[index - 1] : null,
    next: index >= 0 && index < list.length - 1 ? list[index + 1] : null,
  };
}
