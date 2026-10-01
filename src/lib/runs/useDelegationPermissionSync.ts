import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";
import { permissionOptions } from "./delegation-policy";

/** Mirror user settings into durable host state for cross-provider delegation. */
export function useDelegationPermissionSync() {
  const settings = useAppStore((state) => state.settings);
  const serialized = JSON.stringify({
    "claude-code": permissionOptions("claude-code", {
      ...settings,
      claudeSandboxCredentialFiles: settings.claudeSandboxCredentialFiles
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
      claudeSandboxCredentialEnvVars: settings.claudeSandboxCredentialEnvVars
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    }),
    codex: permissionOptions("codex", {
      ...settings,
      codexAutoApproveStaveLocalMcpTools:
        settings.codexApprovalPolicy === "never",
    }),
  });
  useEffect(() => {
    const sync = window.api?.runs?.syncDelegationPermissionSettings;
    if (sync) void sync(JSON.parse(serialized)).catch(() => undefined);
  }, [serialized]);
}
