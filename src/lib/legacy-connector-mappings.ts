// temporary-migration: connector-repository-mappings
/**
 * Jira and Crane connector settings saved before registered projects were
 * renamed to repositories keep their mappings under `projectMappings`; the
 * strict schemas now read `repositoryMappings`. Renames the key, so an upgrade
 * keeps the connector enabled with its site, URL and mappings. Remove per
 * config/temporary-migrations.json.
 */
export function renameLegacyConnectorMappings(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!("projectMappings" in record)) return value;
  const { projectMappings, ...rest } = record;
  return rest.repositoryMappings === undefined ? { ...rest, repositoryMappings: projectMappings } : rest;
}
