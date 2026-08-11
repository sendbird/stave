import { randomUUID } from "node:crypto";

import {
  toMartinProjectSummary,
  type MartinProjectSummary,
} from "../../../src/lib/martin-sync/contract";
import { buildMartinSyncLinks } from "../../../src/lib/martin-sync/links";
import type { WorkspaceMartinProjectLink } from "../../../src/lib/workspace-information";
import {
  getWorkspaceInformation,
  listKnownProjects,
  setWorkspaceMartinProject,
} from "../stave-mcp-service";
import { writeMartinContextSnapshot } from "./context-snapshot";
import {
  createMartinHttpClient,
  enqueueMartinSyncEvent,
  getMartinSyncCredential,
  getMartinSyncRuntime,
  noteMartinWorkspaceLinksChanged,
} from "./service";

async function requireMartinClient() {
  const credential = await getMartinSyncCredential();
  if (!credential) throw new Error("connector_unpaired");
  if (!credential.scopes.includes("martin")) {
    throw new Error("scope_missing");
  }
  return {
    baseUrl: credential.baseUrl,
    secret: credential.secret,
    client: createMartinHttpClient(credential.baseUrl),
  };
}

async function requireWorkspace(workspaceId: string) {
  const projects = await listKnownProjects();
  for (const project of projects) {
    const workspace = project.workspaces.find(
      (candidate) => candidate.id === workspaceId,
    );
    if (workspace) return workspace;
  }
  throw new Error("workspace_not_found");
}

function createProjectLink(args: {
  projectRef: string;
  slug: string;
  name: string;
  url: string;
  now: string;
  linkedAt?: string;
  stale?: boolean;
}): WorkspaceMartinProjectLink {
  return {
    ref: args.projectRef,
    slug: args.slug,
    name: args.name,
    url: args.url,
    linkedAt: args.linkedAt ?? args.now,
    lastPulledAt: args.now,
    ...(args.stale ? { stale: true } : {}),
  };
}

export async function listMartinProjects(args: {
  query?: string;
  limit?: number;
}): Promise<MartinProjectSummary[]> {
  const { client, secret } = await requireMartinClient();
  return client.listMartinProjects({
    secret,
    query: args.query,
    limit: args.limit,
  });
}

export async function linkMartinProject(args: {
  workspaceId: string;
  projectRef: string;
}): Promise<{
  project: WorkspaceMartinProjectLink;
  snapshotRelativePath: string;
}> {
  const [{ baseUrl, client, secret }, workspace] = await Promise.all([
    requireMartinClient(),
    requireWorkspace(args.workspaceId),
  ]);
  const bundle = await client.getMartinContextBundle({
    secret,
    projectRef: args.projectRef,
  });
  // Archived projects still serve context reads but reject every write with
  // 409, so linking one would look healthy while nothing could ever sync. The
  // renderer disables archived results; this guards the MCP tool as well.
  if (bundle.project.status === "archived") {
    throw new Error("martin_project_archived");
  }
  const projectSummary = toMartinProjectSummary(bundle.project, baseUrl);
  const snapshot = await writeMartinContextSnapshot({
    workspacePath: workspace.path,
    slug: bundle.project.slug,
    markdown: bundle.markdown,
  });
  const now = new Date().toISOString();
  const project = createProjectLink({
    projectRef: bundle.project.slug,
    slug: bundle.project.slug,
    name: bundle.project.name,
    url: projectSummary.url,
    now,
  });
  const result = await setWorkspaceMartinProject({
    workspaceId: args.workspaceId,
    project,
  });

  const runtime = getMartinSyncRuntime();
  // Anything still queued for a previously linked project can never be
  // delivered now, and its 404/409 responses would hold this workspace's rows
  // on every drain. Drop them before resuming the new mapping.
  runtime.discardWorkspaceEntries({
    workspaceId: args.workspaceId,
    exceptProjectRef: project.ref,
  });
  runtime.resumeWorkspace(args.workspaceId, project.ref);
  const settings = runtime.getSettings();
  if (settings.enabled) {
    enqueueMartinSyncEvent({
      workspaceId: args.workspaceId,
      projectRef: project.ref,
      event: {
        staveEventId: randomUUID(),
        kind: "workspace_linked",
        summary: `${workspace.name} (${workspace.branch})`,
        sourceUrl: project.url,
        tier: "factual",
        workspaceName: workspace.name,
        branch: workspace.branch,
      },
    });
    if (settings.resourceLinks) {
      noteMartinWorkspaceLinksChanged({
        workspaceId: args.workspaceId,
        projectRef: project.ref,
        links: buildMartinSyncLinks(result.workspaceInformation),
      });
    }
  }
  return { project, snapshotRelativePath: snapshot.relativePath };
}

export async function unlinkMartinProject(args: {
  workspaceId: string;
}): Promise<{ ok: true }> {
  const [{ workspaceInformation }, workspace] = await Promise.all([
    getWorkspaceInformation(args),
    requireWorkspace(args.workspaceId),
  ]);
  const project = workspaceInformation.martinProject ?? null;
  await setWorkspaceMartinProject({
    workspaceId: args.workspaceId,
    project: null,
  });

  if (project) {
    // Discard before queueing the farewell event so the unlink notice is the
    // only row left for this project rather than trailing a dead backlog.
    getMartinSyncRuntime().discardWorkspaceEntries({
      workspaceId: args.workspaceId,
      projectRef: project.ref,
    });
  }

  if (
    project &&
    !project.stale &&
    getMartinSyncRuntime().getSettings().enabled
  ) {
    enqueueMartinSyncEvent({
      workspaceId: args.workspaceId,
      projectRef: project.ref,
      event: {
        staveEventId: randomUUID(),
        kind: "workspace_unlinked",
        summary: `${workspace.name} (${workspace.branch})`,
        sourceUrl: project.url,
        tier: "factual",
        workspaceName: workspace.name,
        branch: workspace.branch,
      },
    });
  }
  return { ok: true };
}

export async function refreshMartinContext(args: {
  workspaceId: string;
}): Promise<{
  project: WorkspaceMartinProjectLink;
  snapshotRelativePath: string;
  markdown: string;
}> {
  const [{ workspaceInformation }, workspace, connection] = await Promise.all([
    getWorkspaceInformation(args),
    requireWorkspace(args.workspaceId),
    requireMartinClient(),
  ]);
  const current = workspaceInformation.martinProject ?? null;
  if (!current) throw new Error("martin_project_not_linked");

  const bundle = await connection.client.getMartinContextBundle({
    secret: connection.secret,
    projectRef: current.ref,
  });
  const snapshot = await writeMartinContextSnapshot({
    workspacePath: workspace.path,
    slug: bundle.project.slug,
    markdown: bundle.markdown,
  });
  const now = new Date().toISOString();
  // Refreshing an archived project must not clear the stale badge or resume its
  // outbox: reads succeed, but every write still fails with 409.
  const archived = bundle.project.status === "archived";
  const project = createProjectLink({
    projectRef: bundle.project.slug,
    slug: bundle.project.slug,
    name: bundle.project.name,
    url: toMartinProjectSummary(bundle.project, connection.baseUrl).url,
    now,
    linkedAt: current.linkedAt,
    stale: archived,
  });
  await setWorkspaceMartinProject({
    workspaceId: args.workspaceId,
    project,
  });
  if (!archived) {
    getMartinSyncRuntime().resumeWorkspace(args.workspaceId, project.ref);
  }
  return {
    project,
    snapshotRelativePath: snapshot.relativePath,
    markdown: bundle.markdown,
  };
}
