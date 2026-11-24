import type { ExternalSession } from "./external-sessions";

/** A Stave project as the Activity page needs it: its folder and its workspaces' folders. */
export interface ExternalSessionProjectSource {
  repositoryPath: string;
  repositoryName: string;
  workspaces: ReadonlyArray<{ id: string; name: string }>;
  workspacePathById: Readonly<Record<string, string>>;
}

export interface ExternalSessionPlace {
  projectPath: string;
  projectName: string;
  workspaceId?: string;
  workspaceName?: string;
}

export interface ExternalSessionRow {
  session: ExternalSession;
  place: ExternalSessionPlace | null;
}

export interface ExternalSessionGroup {
  /** The project folder, or the session folder when no project contains it. */
  key: string;
  /** Project name, else the folder's last segment; empty when unknown. */
  label: string;
  path?: string;
  inProject: boolean;
  rows: ExternalSessionRow[];
}

function trimSeparators(value: string) {
  return value.length > 1 ? value.replace(/[\\/]+$/, "") : value;
}

/** `child` is `parent` or inside it (either separator; no partial segment matches). */
export function isPathWithin(parent: string, child: string) {
  const root = trimSeparators(parent);
  const target = trimSeparators(child);
  if (!root || !target) return false;
  if (target === root) return true;
  return target.startsWith(`${root}/`) || target.startsWith(`${root}\\`);
}

/**
 * The Stave project and workspace a session folder belongs to: the deepest
 * workspace folder that contains it, else the deepest project folder.
 */
export function placeExternalSession(cwd: string | undefined, projects: readonly ExternalSessionProjectSource[]): ExternalSessionPlace | null {
  if (!cwd) return null;
  let best: (ExternalSessionPlace & { length: number }) | null = null;
  for (const project of projects) {
    for (const workspace of project.workspaces) {
      const workspacePath = project.workspacePathById[workspace.id];
      if (!workspacePath || !isPathWithin(workspacePath, cwd)) continue;
      if (best && best.length >= workspacePath.length) continue;
      best = { projectPath: project.repositoryPath, projectName: project.repositoryName, workspaceId: workspace.id, workspaceName: workspace.name, length: workspacePath.length };
    }
  }
  if (best) {
    const { length: _length, ...place } = best;
    return place;
  }
  let project: ExternalSessionProjectSource | null = null;
  for (const candidate of projects) {
    if (!isPathWithin(candidate.repositoryPath, cwd)) continue;
    if (!project || candidate.repositoryPath.length > project.repositoryPath.length) project = candidate;
  }
  return project ? { projectPath: project.repositoryPath, projectName: project.repositoryName } : null;
}

function folderName(value: string) {
  const parts = trimSeparators(value).split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? value;
}

/** Project → sessions, keeping the watcher's order (live first, then most recent). */
export function groupExternalSessions(sessions: readonly ExternalSession[], projects: readonly ExternalSessionProjectSource[]): ExternalSessionGroup[] {
  const groups = new Map<string, ExternalSessionGroup>();
  for (const session of sessions) {
    const place = placeExternalSession(session.cwd, projects);
    const key = place?.projectPath ?? session.cwd ?? "";
    let group = groups.get(key);
    if (!group) {
      group = place
        ? { key, label: place.projectName, path: place.projectPath, inProject: true, rows: [] }
        : { key, label: session.cwd ? folderName(session.cwd) : "", ...(session.cwd ? { path: session.cwd } : {}), inProject: false, rows: [] };
      groups.set(key, group);
    }
    group.rows.push({ session, place });
  }
  return [...groups.values()];
}

/** Projects the renderer knows, one per folder (the open project may also be in the recent list). */
export function collectExternalSessionProjects(args: {
  recentRepositories: readonly ExternalSessionProjectSource[];
  current: ExternalSessionProjectSource | null;
}): ExternalSessionProjectSource[] {
  const byPath = new Map<string, ExternalSessionProjectSource>();
  if (args.current) byPath.set(args.current.repositoryPath, args.current);
  for (const project of args.recentRepositories) if (!byPath.has(project.repositoryPath)) byPath.set(project.repositoryPath, project);
  return [...byPath.values()];
}
