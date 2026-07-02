import type { LensSessionScope } from "@/lib/lens/lens.types";

// Script run-state reducers/helpers moved to
// `@/lib/workspace-scripts/runtime-state`. This module keeps only the
// Lens/Orbit URL helpers used by the scripts panel.

type OrbitLensApi = {
  createView?: (args: {
    workspaceId: string;
    sessionScope?: LensSessionScope;
    projectKey?: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  navigate?: (args: {
    workspaceId: string;
    url: string;
  }) => Promise<{ ok: boolean; message?: string }>;
};

type OpenOrbitUrlLayoutPatch = {
  sidebarOverlayVisible: true;
  sidebarOverlayTab: "lens";
  editorVisible?: false;
};

export type OpenOrbitUrlWithLensPriorityResult =
  | { ok: true; target: "lens" }
  | {
      ok: true;
      target: "external";
      reason: "missing-workspace" | "lens-unavailable";
    }
  | { ok: false; target: "lens"; message: string };

export function buildOpenLensLayoutPatch(args: {
  isLargeViewport: boolean;
}): OpenOrbitUrlLayoutPatch {
  return {
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "lens",
    ...(!args.isLargeViewport ? { editorVisible: false as const } : {}),
  };
}

export async function openOrbitUrlWithLensPriority(args: {
  url: string;
  workspaceId?: string | null;
  projectPath?: string | null;
  lensSessionScope: LensSessionScope;
  lensApi?: OrbitLensApi | null;
  isLargeViewport: boolean;
  setLayout: (args: { patch: OpenOrbitUrlLayoutPatch }) => void;
  openExternalUrl: (url: string) => void;
}): Promise<OpenOrbitUrlWithLensPriorityResult> {
  const url = args.url.trim();
  if (!url) {
    return { ok: false, target: "lens", message: "Orbit URL is empty." };
  }

  if (!args.workspaceId) {
    args.openExternalUrl(url);
    return { ok: true, target: "external", reason: "missing-workspace" };
  }

  if (!args.lensApi?.createView || !args.lensApi.navigate) {
    args.openExternalUrl(url);
    return { ok: true, target: "external", reason: "lens-unavailable" };
  }

  args.setLayout({
    patch: buildOpenLensLayoutPatch({
      isLargeViewport: args.isLargeViewport,
    }),
  });

  try {
    const createResult = await args.lensApi.createView({
      workspaceId: args.workspaceId,
      sessionScope: args.lensSessionScope,
      projectKey: args.projectPath,
    });
    if (!createResult.ok) {
      return {
        ok: false,
        target: "lens",
        message: createResult.message ?? "Lens could not create a browser view.",
      };
    }

    const navigateResult = await args.lensApi.navigate({
      workspaceId: args.workspaceId,
      url,
    });
    if (!navigateResult.ok) {
      return {
        ok: false,
        target: "lens",
        message: navigateResult.message ?? "Lens could not load that Orbit URL.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      target: "lens",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return { ok: true, target: "lens" };
}
