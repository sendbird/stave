/** Counters are sanitized independently; malformed JSON never aborts a report. */
const valid = (field: string) => `typeof(${field}) IN ('integer', 'real') AND ${field} >= 0 AND ${field} <= 1.7976931348623157e308`;
const number = (field: string) => `CASE WHEN ${valid(field)} THEN ${field} ELSE 0 END`;
const extract = (field: string) => `json_extract(CASE WHEN json_valid(usage_json) THEN usage_json ELSE '{}' END, '$.${field}')`;

export const USAGE_CTE = `WITH raw AS (
  SELECT *,
    ${extract("inputTokens")} AS raw_input,
    ${extract("outputTokens")} AS raw_output,
    ${extract("cacheReadTokens")} AS raw_read,
    ${extract("cacheCreationTokens")} AS raw_write,
    ${extract("thoughtTokens")} AS raw_thought,
    ${extract("totalCostUsd")} AS raw_cost
  FROM usage_turns
  WHERE created_at >= ? AND created_at < ? AND completed_at IS NOT NULL
    AND (? IS NULL OR provider_id = ?) AND (? IS NULL OR account_profile_id = ?)
    AND (? = 0 OR model_id IS ?)
), counters AS (
  SELECT *,
    CASE WHEN ${valid("raw_input")} AND ${valid("raw_output")} THEN 1 ELSE 0 END AS measured,
    ${number("raw_input")} AS input, ${number("raw_output")} AS output,
    ${number("raw_read")} AS cache_read, ${number("raw_write")} AS cache_write,
    ${number("raw_thought")} AS thought,
    CASE WHEN ${valid("raw_cost")} THEN raw_cost ELSE NULL END AS cost
  FROM raw
), usage AS (
  SELECT *, CASE WHEN measured = 1 THEN output + CASE provider_id
    WHEN 'claude-code' THEN input + cache_write
    WHEN 'codex' THEN MAX(input - cache_read, 0)
    ELSE input END ELSE 0 END AS tokens
  FROM counters
)`;

export const METRIC_SUMS = `COUNT(*) AS turns, SUM(measured) AS measuredTurns,
  COALESCE(SUM(input), 0) AS inputTokens, COALESCE(SUM(output), 0) AS outputTokens,
  COALESCE(SUM(cache_read), 0) AS cacheReadTokens, COALESCE(SUM(cache_write), 0) AS cacheCreationTokens,
  COALESCE(SUM(thought), 0) AS thoughtTokens, COALESCE(SUM(tokens), 0) AS tokens,
  SUM(cost) AS costUsd, SUM(cost IS NOT NULL) AS costReportedTurns`;

export const TURN_METRICS = `1 AS turns, measured AS measuredTurns, input AS inputTokens,
  output AS outputTokens, cache_read AS cacheReadTokens, cache_write AS cacheCreationTokens,
  thought AS thoughtTokens, tokens, cost AS costUsd, (cost IS NOT NULL) AS costReportedTurns`;
