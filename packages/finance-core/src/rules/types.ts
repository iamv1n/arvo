import type { TransactionType } from '@arvo/types';

export type RuleConditionField = 'description' | 'merchant' | 'amount' | 'direction';
export type RuleOperator = 'contains' | 'equals' | 'starts_with' | 'gte' | 'lte';

/**
 * Text comparisons use normalized text (upper-case, punctuation collapsed).
 * amount compares the absolute amount; direction equals IN or OUT.
 */
export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleOperator;
  value: string;
}

export interface RuleActions {
  categoryId?: string;
  merchantName?: string;
  type?: TransactionType;
  /** Reserved for recurring detection. */
  markRecurring?: boolean;
}

export interface RuleRecord {
  id: string;
  userId: string;
  name: string;
  /** Lower runs first. Ties break on creation time, then id, so evaluation is deterministic. */
  priority: number;
  isActive: boolean;
  conditions: RuleCondition[];
  actions: RuleActions;
  createdAt: Date;
  updatedAt: Date;
}

export type NewRule = Omit<RuleRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type RulePatch = Partial<Pick<RuleRecord, 'name' | 'priority' | 'isActive' | 'conditions' | 'actions'>>;

export interface RuleRepository {
  findAll(userId: string): Promise<RuleRecord[]>;
  findById(userId: string, id: string): Promise<RuleRecord | null>;
  create(input: NewRule): Promise<RuleRecord>;
  update(userId: string, id: string, patch: RulePatch): Promise<RuleRecord>;
  delete(userId: string, id: string): Promise<void>;
}
