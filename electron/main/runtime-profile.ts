import path from "node:path";

export type PersistenceRuntimeProfile = "development" | "production";

export interface AppPathConfigurator {
  isPackaged: boolean;
  getPath(name: "userData"): string;
  setPath(name: "userData", value: string): void;
}

export function resolvePersistenceRuntimeProfile(args: {
  isPackaged: boolean;
  override?: string | null;
}): PersistenceRuntimeProfile {
  void args;
  return "production";
}

export function resolveDevelopmentUserDataPath(args: { productionUserDataPath: string }) {
  const baseName = path.basename(args.productionUserDataPath);
  return path.join(path.dirname(args.productionUserDataPath), `${baseName}-dev`);
}

export function configurePersistenceUserDataPath(
  app: AppPathConfigurator,
  env: NodeJS.ProcessEnv = process.env,
) {
  const productionUserDataPath = app.getPath("userData");
  const developmentUserDataPath = resolveDevelopmentUserDataPath({ productionUserDataPath });

  const profile = resolvePersistenceRuntimeProfile({
    isPackaged: app.isPackaged,
    override: env.STAVE_RUNTIME_PROFILE ?? null,
  });

  const selectedUserDataPath = productionUserDataPath;

  if (selectedUserDataPath !== productionUserDataPath) {
    app.setPath("userData", selectedUserDataPath);
  }

  return {
    profile,
    userDataPath: selectedUserDataPath,
    productionUserDataPath,
    developmentUserDataPath,
  };
}
