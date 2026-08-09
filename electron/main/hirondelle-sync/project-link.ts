import { randomUUID } from "node:crypto";
import { app } from "electron";

import {
  toHirondelleProjectSummary,
  type HirondelleProjectSummary,
} from "../../../src/lib/hirondelle-sync/contract";
import { buildHirondelleSyncLinks } from "../../../src/lib/hirondelle-sync/links";
import type { WorkspaceHirondelleProjectLink } from "../../../src/lib/workspace-information";
import { AtelierConnectorHttpClient } from "../atelier-connector/http-client";
import {
  getWorkspaceInformation,
  listKnownProjects,
  setWorkspaceHirondelleProject,
} from "../stave-mcp-service";
import { writeHirondelleContextSnapshot } from "./context-snapshot";
import {
  enqueueHirondelleSyncEvent,
  getHirondelleSyncCredential,
  getHirondelleSyncRuntime,
  noteHirondelleWorkspaceLinksChanged,
} from "./service";

async function requireHirondelleClient() {
  const credential = await getHirondelleSyncCredential();
  if (!credential) throw new Error("connector_unpaired");
  if (!credential.scopes.includes("hirondelle")) {
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
}): WorkspaceHirondelleProjectLink {
  return {
    ref: args.projectRef,
    slug: args.slug,
    name: args.name,
    url: args.url,
    linkedAt: args.linkedAt ?? args.now,
    lastPulledAt: args.now,
  };
}

export async function listHirondelleProjects(args: {
  query?: string;
  limit?: number;
}): Promise<HirondelleProjectSummary[]> {
  const { client, secret } = await requireHirondelleClient();
  return client.listHirondelleProjects({
    secret,
    query: args.query,
    limit: args.limit,
  });
}

export async function linkHirondelleProject(args: {
  workspaceId: string;
  projectRef: string;
}): Promise<{
  project: WorkspaceHirondelleProjectLink;
  snapshotRelativePath: string;
}> {
  const [{ baseUrl, client, secret }, workspace] = await Promise.all([
    requireHirondelleClient(),
    requireWorkspace(args.workspaceId),
  ]);
  const bundle = await client.getHirondelleContextBundle({
    secret,
    projectRef: args.projectRef,
  });
  const projectSummary = toHirondelleProjectSummary(
    bundle.project,
    baseUrl,
  );
  const snapshot = await writeHirondelleContextSnapshot({
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
  const result = await setWorkspaceHirondelleProject({
    workspaceId: args.workspaceId,
    project,
  });

  const runtime = getHirondelleSyncRuntime();
  runtime.resumeWorkspace(args.workspaceId);
  const settings = runtime.getSettings();
  if (settings.enabled) {
    enqueueHirondelleSyncEvent({
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
      noteHirondelleWorkspaceLinksChanged({
        workspaceId: args.workspaceId,
        projectRef: project.ref,
        links: buildHirondelleSyncLinks(result.workspaceInformation),
      });
    }
  }
  return { project, snapshotRelativePath: snapshot.relativePath };
}

export async function unlinkHirondelleProject(args: {
  workspaceId: string;
}): Promise<{ ok: true }> {
  const [{ workspaceInformation }, workspace] = await Promise.all([
    getWorkspaceInformation(args),
    requireWorkspace(args.workspaceId),
  ]);
  const project = workspaceInformation.hirondelleProject ?? null;
  await setWorkspaceHirondelleProject({
    workspaceId: args.workspaceId,
    project: null,
  });

  if (
    project &&
    !project.stale &&
    getHirondelleSyncRuntime().getSettings().enabled
  ) {
    enqueueHirondelleSyncEvent({
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

export async function refreshHirondelleContext(args: {
  workspaceId: string;
}): Promise<{
  project: WorkspaceHirondelleProjectLink;
  snapshotRelativePath: string;
  markdown: string;
}> {
  const [{ workspaceInformation }, workspace, connection] = await Promise.all([
    getWorkspaceInformation(args),
    requireWorkspace(args.workspaceId),
    requireHirondelleClient(),
  ]);
  const current = workspaceInformation.hirondelleProject ?? null;
  if (!current) throw new Error("hirondelle_project_not_linked");

  const bundle = await connection.client.getHirondelleContextBundle({
    secret: connection.secret,
    projectRef: current.ref,
  });
  const snapshot = await writeHirondelleContextSnapshot({
    workspacePath: workspace.path,
    slug: bundle.project.slug,
    markdown: bundle.markdown,
  });
  const now = new Date().toISOString();
  const project = createProjectLink({
    projectRef: bundle.project.slug,
    slug: bundle.project.slug,
    name: bundle.project.name,
    url: toHirondelleProjectSummary(bundle.project, connection.baseUrl).url,
    now,
    linkedAt: current.linkedAt,
  });
  await setWorkspaceHirondelleProject({
    workspaceId: args.workspaceId,
    project,
  });
  getHirondelleSyncRuntime().resumeWorkspace(args.workspaceId);
  return {
    project,
    snapshotRelativePath: snapshot.relativePath,
    markdown: bundle.markdown,
  };
}
