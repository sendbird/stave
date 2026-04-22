import { normalizeProjectDisplayName } from "@/store/project.utils";

export interface ZenProjectListItem {
  projectName: string;
  projectPath: string;
  isCurrent: boolean;
}

interface ZenProjectRecord {
  projectName: string;
  projectPath: string;
}

export function buildZenProjectList(args: {
  currentProjectName: string | null;
  currentProjectPath: string | null;
  recentProjects: ZenProjectRecord[];
}): ZenProjectListItem[] {
  const rememberedProjects = args.recentProjects
    .filter((project) => project.projectPath.trim().length > 0)
    .map((project) => ({
      projectName: normalizeProjectDisplayName({
        projectName: project.projectName,
        projectPath: project.projectPath,
      }),
      projectPath: project.projectPath,
      isCurrent: project.projectPath === args.currentProjectPath,
    }));

  if (!args.currentProjectPath?.trim()) {
    return rememberedProjects;
  }

  const currentProject: ZenProjectListItem = {
    projectName: normalizeProjectDisplayName({
      projectName: args.currentProjectName,
      projectPath: args.currentProjectPath,
    }),
    projectPath: args.currentProjectPath,
    isCurrent: true,
  };

  const withoutCurrent = rememberedProjects.filter((project) => project.projectPath !== args.currentProjectPath);
  return [currentProject, ...withoutCurrent];
}
