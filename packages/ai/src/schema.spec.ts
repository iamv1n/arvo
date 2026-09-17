import { FINANCE_TOOLS } from '@arvo/finance-tools';
import { z } from 'zod';
import { createDraftTools } from './drafts';
import { toJsonSchema, toolSpec } from './schema';

describe('toJsonSchema', () => {
  it('produces plain object schemas without $schema', () => {
    const schema = toJsonSchema(z.object({ amount: z.string().regex(/^\d+$/).describe('Amount'), months: z.number().min(0).optional() }));
    expect(schema).toEqual({
      type: 'object',
      properties: { amount: { type: 'string', pattern: '^\\d+$', description: 'Amount' }, months: { type: 'number', minimum: 0 } },
      required: ['amount'],
    });
    expect(toJsonSchema(z.object({}))).toMatchObject({ type: 'object', properties: {} });
  });

  it('converts every finance and draft tool', () => {
    for (const tool of [...FINANCE_TOOLS, ...createDraftTools({ create: async () => ({ id: 'x' }) })]) {
      const spec = toolSpec(tool);
      expect(spec.name).toMatch(/^[a-z_]+$/);
      expect(spec.parameters).toMatchObject({ type: 'object' });
      expect(JSON.stringify(spec.parameters)).not.toContain('$schema');
    }
    const whatIf = toolSpec(FINANCE_TOOLS.find((t) => t.name === 'finance_run_what_if')!);
    expect(JSON.stringify(whatIf.parameters)).toContain('oneOf');
  });
});
