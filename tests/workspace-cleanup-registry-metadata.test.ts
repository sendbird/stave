import { expect, test } from "bun:test";
import { keepUnseenWorkspaces } from "../electron/persistence/repository-registry-merge";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

const repository = (): PersistenceRepositoryRegistryEntry => ({
  repositoryPath: "/tmp/repository", repositoryName: "Repository", defaultBranch: "main", lastOpenedAt: "2026-11-16",
  workspaces: [{ id: "base", name: "Default", updatedAt: "2026-01-01" }], activeWorkspaceId: "base",
  workspaceBranchById: { base: "main" }, workspacePathById: { base: "/tmp/repository" }, workspaceDefaultById: { base: true },
});

test("stale registry writes retain newer activity and external ownership for unseen workspaces", () => {
  const persisted = repository();
  persisted.workspaces.push({ id: "external", name: "External", updatedAt: "2026-01-01" });
  persisted.workspacePathById.external = "/tmp/external";
  persisted.workspaceBranchById.external = "external";
  persisted.workspaceLastActiveAtById = { base: "2026-11-16T10:00:00Z", external: "2026-11-16T11:00:00Z" };
  persisted.linkedWorkspacePaths = ["/tmp/external"];
  const incoming = repository();
  incoming.workspaceLastActiveAtById = { base: "2026-01-01T00:00:00Z" };
  const merged = keepUnseenWorkspaces({ incoming: [incoming], persisted: [persisted], workspaceExists: () => true })[0]!;
  expect(merged.workspaceLastActiveAtById).toEqual(persisted.workspaceLastActiveAtById);
  expect(merged.linkedWorkspacePaths).toEqual(["/tmp/external"]);
  expect(merged.workspacePathById.external).toBe("/tmp/external");
  const later = structuredClone(merged);
  later.workspaceLastActiveAtById = { external: "2026-11-17T00:00:00Z" };
  later.linkedWorkspacePaths = undefined;
  const resaved = keepUnseenWorkspaces({ incoming: [later], persisted: [merged], workspaceExists: () => true })[0]!;
  expect(resaved.workspaceLastActiveAtById?.external).toBe("2026-11-17T00:00:00Z");
  expect(resaved.workspaceLastActiveAtById?.base).toBe("2026-11-16T10:00:00Z");
  expect(resaved.linkedWorkspacePaths).toEqual(["/tmp/external"]);
});
