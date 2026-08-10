import { randomUUID } from "node:crypto";
import { app } from "electron";

import {
  toMartinProjectSummary,
  type MartinProjectSummary,
} from "../../../src/lib/martin-sync/contract";
import { buildMartinSyncLinks } from "../../../src/lib/martin-sync/links";
import type { WorkspaceMartinProjectLink } from "../../../src/lib/workspace-information";
import { AtelierConnectorHttpClient } from "../atelier-connector/http-client";
import {
  getWorkspaceInformation,
  listKnownProjects,
  setWorkspaceMartinProject,
} from "../stave-mcp-service";
import { writeMartinContextSnapshot } from "./context-snapshot";
import {
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
    client: new AtelierConnectorHttpClient({
      baseUrl: credential.baseUrl,
      allowInsecureLocalhost:
        process.env.STAVE_DEV === "1" && !app.isPackaged,
    }),
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
}): WorkspaceMartinProjectLink {
  return {
    ref: args.projectRef,
    slug: args.slug,
    name: args.name,
    url: args.url,
    linkedAt: args.linkedAt ?? args.now,
    lastPulledAt: args.now,
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
  const projectSummary = toMartinProjectSummary(
    bundle.project,
    baseUrl,
  );
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
  runtime.resumeWorkspace(args.workspaceId);
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
  const project = createProjectLink({
    projectRef: bundle.project.slug,
    slug: bundle.project.slug,
    name: bundle.project.name,
    url: toMartinProjectSummary(bundle.project, connection.baseUrl).url,
    now,
    linkedAt: current.linkedAt,
  });
  await setWorkspaceMartinProject({
    workspaceId: args.workspaceId,
    project,
  });
  getMartinSyncRuntime().resumeWorkspace(args.workspaceId);
  return {
    project,
    snapshotRelativePath: snapshot.relativePath,
    markdown: bundle.markdown,
  };
}
