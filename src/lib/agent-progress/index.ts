/**
 * The one progress model every agent surface reads: a header (who, how it
 * stands, the facts) and a list of steps worded in two tenses. Adapters turn
 * each source into it; `AgentProgressPanel` draws it.
 */
export type {
  AgentChildRef,
  AgentProgress,
  AgentProgressFacts,
  AgentProgressParent,
  AgentProgressSource,
  AgentStep,
  AgentStepKind,
  AgentStepStatus,
  InlineStepDetail,
  StepDetailRef,
} from "./agent-progress.types";
export {
  clipPathTail,
  describeClaudeTool,
  describeCodexCall,
  describeToolCall,
  humanizeToolName,
  relativeTo,
  stripToolNamespace,
  type ToolAction,
  type ToolActionVerb,
} from "./tool-action";
export {
  describeToolSentence,
  phraseToolAction,
  type ToolSentence,
  type ToolSentenceTense,
} from "./tool-sentence";
export {
  formatAgentFactLine,
  formatAgentFacts,
  isAgentStateLive,
  resolveAgentElapsedMs,
  type AgentFact,
  type AgentFactKey,
} from "./facts";
export {
  boundStepDetail,
  countUnseenSteps,
  countWorkSteps,
  findCurrentStep,
  foldAgentSteps,
  isPinnedStep,
  isQuietStep,
  sortAgentSteps,
  STEP_DETAIL_MAX_CHARS,
  type AgentStepBlock,
} from "./steps";
export {
  mapAgentHistoryItems,
  type AgentHistoryItem,
  type AgentHistoryItemKind,
} from "./history-items";
export { mergeHistoryItems, stepsFromHistoryItems, type AgentStepsResult } from "./from-history";
export {
  stepFromToolPart,
  stepsFromMessages,
  stepsFromProgressMessages,
  stepsFromSubagentParts,
  type MessageStepOptions,
} from "./from-messages";
export { progressFromExchange } from "./from-exchange";
export { firstLine, isSubagentToolName } from "./step-builders";
