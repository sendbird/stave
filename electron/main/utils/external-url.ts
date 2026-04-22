import { spawn } from "node:child_process";
import os from "node:os";

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function spawnExternalOpen(args: { command: string; commandArgs: string[] }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(args.command, args.commandArgs, {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", (error) => reject(error));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function isAllowedExternalUrl(args: { url: string }): boolean {
  try {
    const parsed = new URL(args.url);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function openExternalWithFallback(args: { url: string }) {
  if (!isAllowedExternalUrl({ url: args.url })) {
    return { ok: false as const, stderr: "Blocked external URL protocol." };
  }

  const isWsl = process.platform === "linux"
    && (
      Boolean(process.env.WSL_DISTRO_NAME)
      || Boolean(process.env.WSL_INTEROP)
      || os.release().toLowerCase().includes("microsoft")
    );

  if (isWsl) {
    const wslLaunchers: Array<{ command: string; commandArgs: string[] }> = [
      { command: "wslview", commandArgs: [args.url] },
      { command: "cmd.exe", commandArgs: ["/c", "start", "", args.url] },
      { command: "powershell.exe", commandArgs: ["-NoProfile", "-Command", "Start-Process", args.url] },
    ];

    let lastError = "Failed to open URL from WSL.";
    for (const launcher of wslLaunchers) {
      try {
        await spawnExternalOpen(launcher);
        return { ok: true as const };
      } catch (launcherError) {
        lastError = String(launcherError);
      }
    }

    return { ok: false as const, stderr: lastError };
  }

  try {
    const { shell } = await import("electron");
    await shell.openExternal(args.url);
    return { ok: true as const };
  } catch (error) {
    if (process.platform !== "linux") {
      return { ok: false as const, stderr: String(error) };
    }

    const launchers: Array<{ command: string; commandArgs: string[] }> = [
      { command: "xdg-open", commandArgs: [args.url] },
      { command: "gio", commandArgs: ["open", args.url] },
      { command: "kioclient5", commandArgs: ["exec", args.url] },
      { command: "gnome-open", commandArgs: [args.url] },
    ];

    let lastError = String(error);
    for (const launcher of launchers) {
      try {
        await spawnExternalOpen(launcher);
        return { ok: true as const };
      } catch (launcherError) {
        lastError = String(launcherError);
      }
    }

    return { ok: false as const, stderr: lastError };
  }
}
