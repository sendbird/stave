import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  configurePersistenceUserDataPath,
  resolvePersistenceRuntimeProfile,
} from "../electron/main/runtime-profile";

function createTempRoot() {
  return path.join(tmpdir(), `stave-runtime-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("runtime profile persistence paths", () => {
  const cleanupRoots = new Set<string>();

  afterEach(() => {
    for (const root of cleanupRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    cleanupRoots.clear();
  });

  test("always resolves to the production persistence profile", () => {
    expect(resolvePersistenceRuntimeProfile({ isPackaged: false })).toBe("production");
    expect(resolvePersistenceRuntimeProfile({ isPackaged: true })).toBe("production");
    expect(resolvePersistenceRuntimeProfile({ isPackaged: false, override: "production" })).toBe("production");
    expect(resolvePersistenceRuntimeProfile({ isPackaged: false, override: "development" })).toBe("production");
  });

  test("configures every runtime to use the single production userData path", () => {
    const root = createTempRoot();
    cleanupRoots.add(root);

    const productionUserDataPath = path.join(root, "Stave");
    let selectedUserDataPath = productionUserDataPath;

    const app = {
      isPackaged: false,
      getPath(name: "userData") {
        if (name !== "userData") {
          throw new Error(`Unexpected path request: ${name}`);
        }
        return productionUserDataPath;
      },
      setPath(name: "userData", value: string) {
        if (name !== "userData") {
          throw new Error(`Unexpected setPath request: ${name}`);
        }
        selectedUserDataPath = value;
      },
    };

    const result = configurePersistenceUserDataPath(app, {
      STAVE_RUNTIME_PROFILE: "development",
    });
    expect(result.profile).toBe("production");
    expect(result.userDataPath).toBe(productionUserDataPath);
    expect(selectedUserDataPath).toBe(productionUserDataPath);
  });
});
