import { z } from "zod";

/**
 * A scope Atelier granted a connector. Stave only acts on `crane`, but a
 * pairing may carry other scopes Atelier grants. They stay opaque strings so a
 * saved pairing that lists one still reads, instead of failing the whole vault.
 */
export const AtelierConnectorScopeSchema = z.string().trim().min(1).max(64);

export type AtelierConnectorScope = z.infer<
  typeof AtelierConnectorScopeSchema
>;
