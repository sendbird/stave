/** View-only project identity. Paths distinguish projects even when their display names match. */
export interface TarsTrayProject { repositoryPath: string; repositoryName: string }

export function groupTarsTrayItems<T>(items: readonly T[], pathOf: (item: T) => string | null | undefined, projects: readonly TarsTrayProject[]) {
  const groups = new Map<string, { key: string; label: string | null; items: T[] }>();
  for (const item of items) {
    const path = pathOf(item)?.trim() || "";
    const key = path || "unknown";
    let group = groups.get(key);
    if (!group) {
      const name = projects.find((project) => project.repositoryPath === path)?.repositoryName.trim();
      group = { key, label: name || path.split(/[\\/]/).filter(Boolean).at(-1) || null, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
