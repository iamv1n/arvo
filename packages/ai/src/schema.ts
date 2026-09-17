import { z } from 'zod';
import type { ToolSpec } from './types';

/**
 * Converts a zod input schema to a plain JSON Schema object accepted by every provider:
 * no $schema key, always an object with properties, inputs (not outputs) semantics.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  if (json.type === 'object' && !json.properties) json.properties = {};
  return json;
}

export function toolSpec(tool: { name: string; description: string; inputSchema: z.ZodType }): ToolSpec {
  return { name: tool.name, description: tool.description, parameters: toJsonSchema(tool.inputSchema) };
}
