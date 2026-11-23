import { expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { archiveSensitiveFilesPath, deleteArchiveSensitiveFiles, restoreArchiveSensitiveFiles, saveArchiveSensitiveFiles } from "../electron/host-service/workspace-archive-sensitive-files";

test("saves only eligible bounded files privately and restores without replacing files or following directory links", async () => {
  const root = await mkdtemp(join(tmpdir(), "archive-sensitive-"));
  try {
    const cwd = join(root, "checkout");
    const destination = join(root, "restored");
    const store = archiveSensitiveFilesPath(root, "../workspace");
    await mkdir(join(cwd, "credentials"), { recursive: true });
    await mkdir(join(cwd, "node_modules"));
    await mkdir(destination);
    await writeFile(join(cwd, ".env"), "sample");
    await writeFile(join(cwd, ".envlarge"), new Uint8Array(1024 * 1024 + 1));
    await writeFile(join(cwd, "credentials", "config"), "nested");
    await writeFile(join(cwd, "node_modules", ".env"), "dependency");
    await writeFile(join(cwd, "cache"), "cache");
    await writeFile(join(root, "outside"), "outside");
    await symlink(join(root, "outside"), join(cwd, "external.key"));
    await symlink(".env", join(cwd, "internal.key"));
    const ignored = [".env", ".envlarge", "credentials/config", "node_modules/.env", "cache", "external.key", "internal.key"];
    expect(await saveArchiveSensitiveFiles(cwd, store, ignored)).toBe(2);
    for (const path of [dirname(store), store, join(store, "credentials")]) {
      if (process.platform !== "win32") expect((await lstat(path)).mode & 0o777).toBe(0o700);
    }
    for (const path of [".env", "credentials/config", "internal.key"]) {
      if (process.platform !== "win32") expect((await lstat(join(store, path))).mode & 0o777).toBe(0o600);
    }
    for (const path of [".envlarge", "node_modules", "cache", "external.key"]) await expect(lstat(join(store, path))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(join(destination, ".env"), "existing");
    await symlink(root, join(destination, "credentials"));
    expect(await restoreArchiveSensitiveFiles(destination, store)).toEqual({ conflict: true, failed: false });
    expect(await readFile(join(destination, ".env"), "utf8")).toBe("existing");
    expect(await readFile(join(destination, "internal.key"), "utf8")).toBe("sample");
    expect(await readFile(join(store, ".env"), "utf8")).toBe("sample");
    await expect(lstat(join(root, "config"))).rejects.toMatchObject({ code: "ENOENT" });

    await deleteArchiveSensitiveFiles(store);
    await expect(lstat(store)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("caps the backup at 50 files and retains a previously saved copy if a new version conflicts", async () => {
  const root = await mkdtemp(join(tmpdir(), "archive-sensitive-"));
  try {
    const cwd = join(root, "checkout");
    const store = archiveSensitiveFilesPath(root, "workspace");
    await mkdir(cwd);
    const files = Array.from({ length: 51 }, (_, index) => `.env.${index}`);
    await Promise.all(files.map(file => writeFile(join(cwd, file), "sample")));
    expect(await saveArchiveSensitiveFiles(cwd, store, files)).toBe(1);
    await expect(lstat(join(store, files[50]!))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(join(cwd, files[0]!), "change");
    await expect(saveArchiveSensitiveFiles(cwd, store, files)).rejects.toThrow("sensitiveFilesBackupConflict");
    expect(await readFile(join(store, files[0]!), "utf8")).toBe("sample");
    expect(await readFile(join(cwd, files[0]!), "utf8")).toBe("change");
  } finally { await rm(root, { recursive: true, force: true }); }
});
