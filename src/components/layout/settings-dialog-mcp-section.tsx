import {
  CodexMcpStatusCard,
  LocalMcpRequestLogCard,
  LocalMcpServerCard,
} from "./settings-dialog-developer-section";
import { SectionHeading, SectionStack } from "./settings-dialog.shared";

export function McpSection() {
  return (
    <>
      <SectionHeading
        title="MCP"
        description="Local MCP server status, request logs, and provider connection state."
      />
      <SectionStack>
        <LocalMcpServerCard />
        <LocalMcpRequestLogCard />
        <CodexMcpStatusCard />
      </SectionStack>
    </>
  );
}
