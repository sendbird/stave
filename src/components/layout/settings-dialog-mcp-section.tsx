import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { McpDiscoveryResponse } from "@/lib/providers/provider.types";
import {
  CodexMcpStatusCard,
  LocalMcpRequestLogCard,
  LocalMcpServerCard,
} from "./settings-dialog-developer-section";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";

function DiscoveredMcpServersCard() {
  const [state, setState] = useState<McpDiscoveryResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const discover = window.api?.provider?.discoverMcpServers;
    if (!discover) return;
    setBusy(true);
    try {
      setState(await discover({}));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <SettingsCard
      title="Discovered MCP Servers"
      description="Read-only view of Claude and Codex configuration. Refresh reads config files; it does not start MCP servers."
      titleAccessory={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {busy ? "Refreshing..." : "Refresh"}
        </Button>
      }
    >
      {!state ? (
        <p className="text-sm text-muted-foreground">Loading configuration…</p>
      ) : null}
      {state?.servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No MCP servers found in the current Claude or Codex configuration.
        </p>
      ) : null}
      <div className="space-y-2">
        {state?.servers.map((server) => (
          <div
            key={server.name}
            className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-foreground">{server.name}</p>
              <p className="text-xs text-muted-foreground">
                {server.sources.join(", ")} · {server.transport}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Claude {server.claude.configured ? "on" : "—"} · Codex{" "}
              {server.codex.configured ? "on" : "—"}
            </span>
          </div>
        ))}
      </div>
      {state?.errors.map((error) => (
        <p key={error} className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ))}
    </SettingsCard>
  );
}

export function McpSection() {
  return (
    <>
      <SectionStack>
        <DiscoveredMcpServersCard />
        <LocalMcpServerCard />
        <LocalMcpRequestLogCard />
        <CodexMcpStatusCard />
      </SectionStack>
    </>
  );
}
