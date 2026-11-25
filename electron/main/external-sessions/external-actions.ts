/**
 * Tool calls read from another app's transcript, as a verb and its object.
 * The reading lives in `src/lib/agent-progress/tool-action.ts`, shared with
 * Stave's own agent progress, so a call is described the same way everywhere.
 */
export {
  cleanTarget,
  describeClaudeTool,
  describeCodexCall,
} from "../../../src/lib/agent-progress/tool-action";
