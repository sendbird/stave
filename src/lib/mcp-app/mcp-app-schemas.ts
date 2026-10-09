import { z } from "zod";
import { readMcpAppViewReference, type McpAppViewReference } from "./mcp-app-view";

/**
 * A tool part's MCP App view reference as events and stored messages carry
 * it. A malformed reference decodes to `undefined`, so the row stays a plain
 * tool row instead of failing the whole event or message.
 */
export const McpAppViewReferenceSchema = z
  .unknown()
  .transform((value): McpAppViewReference | undefined => readMcpAppViewReference(value) ?? undefined);
